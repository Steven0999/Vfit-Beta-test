package com.vaughanfitness.vfit

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.util.Base64
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStream
import java.security.MessageDigest

/** Writes verified backup files only to destinations the member chooses. */
class BackupExporter(private val activity: AppCompatActivity) {
    private data class Request(val id: String, val owner: String, val reply: (JSONObject) -> Unit)
    private data class FolderPicker(val request: Request, var cancelled: Boolean = false)
    private data class Transfer(
        val request: Request, val size: Long, val sha256: String, val revision: String,
        val folder: Uri?,
        var uri: Uri? = null, var output: OutputStream? = null,
        var sequence: Int = 0, var written: Long = 0, var verified: Boolean = false,
        val digest: MessageDigest = MessageDigest.getInstance("SHA-256")
    )

    private val resolver get() = activity.contentResolver
    private val settings by lazy { activity.getSharedPreferences("vfit_backup_folders", Context.MODE_PRIVATE) }
    private val permissionFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
    private val lock = Mutex()
    private var active: Transfer? = null
    private var manualPicker: Transfer? = null
    private var folderPicker: FolderPicker? = null

    private val createDocument = activity.registerForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")
    ) { uri ->
        val transfer = manualPicker ?: return@registerForActivityResult
        manualPicker = null
        if (active !== transfer) return@registerForActivityResult
        if (uri == null) {
            active = null
            send(transfer.request, "cancelled", "Backup export cancelled")
            return@registerForActivityResult
        }
        openDocument(transfer) { uri }
    }

    private val chooseDirectory = activity.registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        val picker = folderPicker ?: return@registerForActivityResult
        folderPicker = null
        if (picker.cancelled) return@registerForActivityResult
        if (uri == null) {
            send(picker.request, "cancelled", "Backup folder selection cancelled")
            return@registerForActivityResult
        }
        val owner = picker.request.owner
        val previous = savedFolder(owner)
        try {
            check(DocumentsContract.isTreeUri(uri))
            resolver.takePersistableUriPermission(uri, permissionFlags)
            val edit = settings.edit().putString("folder:$owner", uri.toString())
            if (uri != previous) edit.remove("copies:$owner").remove("verified:$owner").remove("revision:$owner")
            check(edit.commit())
            releaseUnusedFolder(previous)
            sendFolderStatus(picker.request)
        } catch (error: Exception) {
            releaseUnusedFolder(uri)
            send(picker.request, "error", "Could not save access to that backup folder. Choose another location.")
        }
    }

    fun receive(payload: JSONObject, reply: (JSONObject) -> Unit) {
        val id = payload.optString("requestId")
        val owner = payload.optString("ownerUid")
        if (!Regex("[A-Za-z0-9-]{1,100}").matches(id) || owner.length > 128) return
        val request = Request(id, owner, reply)
        val command = payload.optString("command")
        if (command == "folderStatus") {
            sendFolderStatus(request)
            return
        }
        if (command == "abort" && folderPicker?.request?.let { it.id == id && it.owner == owner } == true) {
            folderPicker?.cancelled = true
            return
        }
        if (command in setOf("chooseFolder", "disableFolder", "start")) {
            if (active != null || manualPicker != null || folderPicker != null) {
                send(request, "error", "Close the current backup or file picker first")
                return
            }
            when (command) {
                "chooseFolder" -> {
                    if (owner.isBlank()) return
                    folderPicker = FolderPicker(request)
                    try { chooseDirectory.launch(savedFolder(owner)) }
                    catch (error: Exception) {
                        folderPicker = null
                        send(request, "error", "The backup folder picker could not open")
                    }
                }
                "disableFolder" -> {
                    if (owner.isBlank()) return
                    val previous = savedFolder(owner)
                    val disabled = settings.edit().remove("folder:$owner").remove("copies:$owner")
                        .remove("verified:$owner").remove("revision:$owner").commit()
                    if (disabled) {
                        releaseUnusedFolder(previous)
                        sendFolderStatus(request)
                    } else send(request, "error", "Could not turn off automatic backups")
                }
                "start" -> startTransfer(request, payload)
            }
            return
        }
        val transfer = active ?: return
        if (transfer.request.id != id || transfer.request.owner != owner) return
        activity.lifecycleScope.launch {
            lock.withLock {
                if (active !== transfer) return@withLock
                try {
                    when (command) {
                        "chunk" -> writeChunk(transfer, payload)
                        "finish" -> finishTransfer(transfer, payload.optInt("sequence", -1))
                        "abort" -> discardTransfer(transfer)
                    }
                } catch (error: Exception) {
                    fail(transfer, "The backup could not be verified. Try again or choose a different folder.")
                }
            }
        }
    }

    private fun startTransfer(request: Request, payload: JSONObject) {
        val size = payload.optLong("size", -1)
        val sha = payload.optString("sha256")
        if (size !in 1..250L * 1024 * 1024 || !Regex("[a-f0-9]{64}").matches(sha)) {
            send(request, "error", "The backup size or checksum is invalid")
            return
        }
        val folder = if (payload.optBoolean("automatic")) savedFolder(request.owner) else null
        if (payload.optBoolean("automatic") && !folderAccessible(folder)) {
            send(request, "error", "Choose a backup folder to give VFIT access again")
            return
        }
        val transfer = Transfer(request, size, sha, payload.optString("revision").take(120), folder)
        active = transfer
        val requested = payload.optString("fileName")
        val name = if (Regex("vfit-backup-[A-Za-z0-9.-]+\\.json").matches(requested)) requested else "vfit-backup.json"
        if (folder != null) {
            openDocument(transfer) {
                val parent = DocumentsContract.buildDocumentUriUsingTree(folder, DocumentsContract.getTreeDocumentId(folder))
                DocumentsContract.createDocument(resolver, parent, "application/json", name)
                    ?: error("Could not create backup in this folder")
            }
        } else {
            manualPicker = transfer
            try { createDocument.launch(name) }
            catch (error: Exception) {
                manualPicker = null
                active = null
                send(request, "error", "The file picker could not open. Try again.")
            }
        }
    }

    private fun openDocument(transfer: Transfer, create: () -> Uri) {
        activity.lifecycleScope.launch {
            lock.withLock {
                if (active !== transfer) return@withLock
                try {
                    withContext(Dispatchers.IO) {
                        val uri = create()
                        transfer.uri = uri
                        transfer.output = resolver.openOutputStream(uri, "wt")
                            ?: error("Could not open the backup file")
                    }
                    send(transfer.request, "ready")
                } catch (error: Exception) {
                    fail(transfer, "Could not write to that backup destination. Choose another location.")
                }
            }
        }
    }

    private suspend fun writeChunk(transfer: Transfer, payload: JSONObject) {
        check(transfer.output != null && payload.optInt("sequence", -1) == transfer.sequence)
        val encoded = payload.optString("data")
        check(encoded.length in 1..65536)
        val bytes = Base64.decode(encoded, Base64.NO_WRAP)
        check(bytes.size in 1..49152 && transfer.written + bytes.size <= transfer.size)
        withContext(Dispatchers.IO) { transfer.output!!.write(bytes) }
        transfer.digest.update(bytes)
        transfer.written += bytes.size
        respond(transfer.request, base(transfer.request, "chunk").put("sequence", transfer.sequence++))
    }

    private suspend fun finishTransfer(transfer: Transfer, sequence: Int) {
        check(transfer.output != null && transfer.written == transfer.size && sequence == transfer.sequence)
        val verifiedAt = withContext(Dispatchers.IO) {
            transfer.output!!.use { it.flush() }
            transfer.output = null
            check(hex(transfer.digest.digest()) == transfer.sha256)
            val digest = MessageDigest.getInstance("SHA-256")
            var read = 0L
            val uri = checkNotNull(transfer.uri)
            resolver.openInputStream(uri)?.use { input ->
                val buffer = ByteArray(65536)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    read += count
                    check(read <= transfer.size)
                    digest.update(buffer, 0, count)
                }
            } ?: error("Could not read the saved file")
            check(read == transfer.size && hex(digest.digest()) == transfer.sha256)
            transfer.verified = true
            val time = System.currentTimeMillis()
            if (transfer.folder != null) recordVerifiedCopy(transfer, uri, time)
            time
        }
        active = null
        respond(transfer.request, base(transfer.request, "complete").put("sha256", transfer.sha256)
            .put("size", transfer.size).put("verifiedAt", verifiedAt))
    }

    private fun recordVerifiedCopy(transfer: Transfer, uri: Uri, time: Long) {
        val owner = transfer.request.owner
        val old = JSONArray(settings.getString("copies:$owner", "[]") ?: "[]")
        val files = (listOf(uri.toString()) + (0 until old.length()).map { old.getString(it) }).distinct()
        // Only rotate automatic copies after the new file has been read back and recorded.
        check(settings.edit().putString("copies:$owner", JSONArray(files.take(2)).toString())
            .putLong("verified:$owner", time).putString("revision:$owner", transfer.revision).commit())
        files.drop(2).forEach { value ->
            runCatching { DocumentsContract.deleteDocument(resolver, Uri.parse(value)) }
        }
    }

    private fun savedFolder(owner: String) = settings.getString("folder:$owner", null)?.let(Uri::parse)

    private fun folderAccessible(uri: Uri?): Boolean = uri != null && resolver.persistedUriPermissions.any {
        it.uri == uri && it.isReadPermission && it.isWritePermission
    }

    private fun releaseUnusedFolder(uri: Uri?) {
        if (uri == null || settings.all.any { (key, value) -> key.startsWith("folder:") && value == uri.toString() }) return
        runCatching { resolver.releasePersistableUriPermission(uri, permissionFlags) }
    }

    private fun sendFolderStatus(request: Request) {
        val folder = savedFolder(request.owner)
        respond(request, base(request, "folder").put("enabled", folder != null)
            .put("available", folderAccessible(folder)).put("verifiedAt", settings.getLong("verified:${request.owner}", 0L))
            .put("revision", settings.getString("revision:${request.owner}", "")))
    }

    private fun base(request: Request, status: String) = JSONObject()
        .put("requestId", request.id).put("ownerUid", request.owner).put("status", status)

    private fun respond(request: Request, message: JSONObject) {
        runCatching { request.reply(message) }
    }

    private fun send(request: Request, status: String, message: String? = null) {
        respond(request, base(request, status).put("message", message))
    }

    private suspend fun discardTransfer(transfer: Transfer) {
        withContext(NonCancellable + Dispatchers.IO) {
            runCatching { transfer.output?.close() }
            transfer.output = null
            // Only remove a partial file created by this automatic write.
            if (transfer.folder != null && !transfer.verified) {
                transfer.uri?.let { runCatching { DocumentsContract.deleteDocument(resolver, it) } }
            }
        }
        if (active === transfer) active = null
    }

    private suspend fun fail(transfer: Transfer, message: String) {
        discardTransfer(transfer)
        send(transfer.request, "error", message)
    }

    fun close() {
        folderPicker?.cancelled = true
        val transfer = active ?: return
        activity.lifecycleScope.launch {
            lock.withLock { if (active === transfer) discardTransfer(transfer) }
        }
    }

    private fun hex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it.toInt() and 0xff) }
}
