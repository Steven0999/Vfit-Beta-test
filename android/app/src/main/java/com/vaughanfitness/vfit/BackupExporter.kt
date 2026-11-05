package com.vaughanfitness.vfit

import android.net.Uri
import android.util.Base64
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.OutputStream
import java.security.MessageDigest

/** User-selected SAF destination; no broad storage access and no blob downloads. */
class BackupExporter(private val activity: AppCompatActivity) {
    private data class Transfer(
        val id: String, val owner: String, val size: Long, val sha256: String,
        val reply: (JSONObject) -> Unit,
        var uri: Uri? = null, var output: OutputStream? = null,
        var sequence: Int = 0, var written: Long = 0,
        val digest: MessageDigest = MessageDigest.getInstance("SHA-256")
    )

    private var active: Transfer? = null
    private val lock = Mutex()
    private val createDocument = activity.registerForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")
    ) { uri ->
        val transfer = active ?: return@registerForActivityResult
        activity.lifecycleScope.launch {
            lock.withLock {
                if (active !== transfer) return@withLock
                if (uri == null) {
                    send(transfer, "cancelled", "Backup export cancelled")
                    active = null
                    return@withLock
                }
                try {
                    transfer.uri = uri
                    transfer.output = withContext(Dispatchers.IO) {
                        activity.contentResolver.openOutputStream(uri, "wt")
                            ?: error("Could not open the selected destination")
                    }
                    send(transfer, "ready")
                } catch (error: Exception) {
                    fail(transfer, "Could not open the backup destination. Choose another location.")
                }
            }
        }
    }

    fun receive(payload: JSONObject, reply: (JSONObject) -> Unit) {
        val id = payload.optString("requestId")
        val owner = payload.optString("ownerUid")
        if (!Regex("[A-Za-z0-9-]{1,100}").matches(id) || owner.length > 128) return
        if (payload.optString("command") == "start") {
            if (active != null) {
                reply(JSONObject().put("requestId", id).put("ownerUid", owner)
                    .put("status", "error").put("message", "Another backup export is already open"))
                return
            }
            val size = payload.optLong("size", -1)
            val sha = payload.optString("sha256")
            if (size !in 1..250L * 1024 * 1024 || !Regex("[a-f0-9]{64}").matches(sha)) return
            val transfer = Transfer(id, owner, size, sha, reply)
            active = transfer
            val requested = payload.optString("fileName")
            val name = if (Regex("vfit-backup-[A-Za-z0-9.-]+\\.json").matches(requested)) requested else "vfit-backup.json"
            try { createDocument.launch(name) }
            catch (error: Exception) { fail(transfer, "The file picker could not open. Try again.") }
            return
        }
        val transfer = active ?: return
        if (transfer.id != id || transfer.owner != owner) return
        activity.lifecycleScope.launch {
            lock.withLock {
                if (active !== transfer) return@withLock
                try {
                    when (payload.optString("command")) {
                        "chunk" -> {
                            check(transfer.output != null && payload.optInt("sequence", -1) == transfer.sequence)
                            val encoded = payload.optString("data")
                            check(encoded.length in 1..65536)
                            val bytes = Base64.decode(encoded, Base64.NO_WRAP)
                            check(bytes.size in 1..49152 && transfer.written + bytes.size <= transfer.size)
                            withContext(Dispatchers.IO) { transfer.output!!.write(bytes) }
                            transfer.digest.update(bytes)
                            transfer.written += bytes.size
                            val sequence = transfer.sequence++
                            send(transfer, "chunk", sequence = sequence)
                        }
                        "finish" -> {
                            check(transfer.output != null && transfer.written == transfer.size &&
                                payload.optInt("sequence", -1) == transfer.sequence)
                            withContext(Dispatchers.IO) { transfer.output!!.flush(); transfer.output!!.close() }
                            transfer.output = null
                            check(hex(transfer.digest.digest()) == transfer.sha256)
                            // Verify bytes from the actual selected document, after closing the writer.
                            val verified = withContext(Dispatchers.IO) {
                                val digest = MessageDigest.getInstance("SHA-256")
                                var read = 0L
                                activity.contentResolver.openInputStream(transfer.uri!!)?.use { input ->
                                    val buffer = ByteArray(65536)
                                    while (true) {
                                        val count = input.read(buffer)
                                        if (count < 0) break
                                        read += count
                                        check(read <= transfer.size)
                                        digest.update(buffer, 0, count)
                                    }
                                } ?: error("Could not read the saved file")
                                read == transfer.size && hex(digest.digest()) == transfer.sha256
                            }
                            check(verified)
                            transfer.reply(base(transfer, "complete").put("sha256", transfer.sha256).put("size", transfer.size))
                            active = null
                        }
                        "abort" -> {
                            withContext(Dispatchers.IO) { transfer.output?.close() }
                            transfer.output = null
                            active = null
                        }
                    }
                } catch (error: Exception) {
                    fail(transfer, "The backup was not verified. A partial file may remain; export again to a new file.")
                }
            }
        }
    }

    private fun base(transfer: Transfer, status: String) = JSONObject()
        .put("requestId", transfer.id).put("ownerUid", transfer.owner).put("status", status)

    private fun send(transfer: Transfer, status: String, message: String? = null, sequence: Int? = null) {
        val payload = base(transfer, status)
        if (message != null) payload.put("message", message)
        if (sequence != null) payload.put("sequence", sequence)
        try { transfer.reply(payload) } catch (error: Exception) { close() }
    }

    private fun fail(transfer: Transfer, message: String) {
        try { transfer.output?.close() } catch (error: Exception) { /* already closed */ }
        transfer.output = null
        send(transfer, "error", message)
        if (active === transfer) active = null
        // Never delete a user-selected document automatically.
    }

    fun close() {
        try { active?.output?.close() } catch (error: Exception) { /* activity closing */ }
        active = null
    }

    private fun hex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it.toInt() and 0xff) }
}
