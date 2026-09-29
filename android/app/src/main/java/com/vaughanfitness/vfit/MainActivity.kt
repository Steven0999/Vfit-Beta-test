package com.vaughanfitness.vfit

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.addCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.lifecycle.lifecycleScope
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.ZoneId

class MainActivity : AppCompatActivity() {
    companion object {
        private const val APP_ORIGIN = "https://appassets.androidplatform.net"
        private const val APP_URL = "$APP_ORIGIN/assets/index.html"
        private const val BRIDGE_NAME = "vfitHealthConnect"
        private const val HEALTH_PERMISSION_PREFERENCES = "vfit_health_permissions"
        private const val HEALTH_PERMISSION_REQUESTED = "step_permission_requested"
    }

    private lateinit var webView: WebView
    private lateinit var assetLoader: WebViewAssetLoader
    private var pageLoaded = false
    private var stepReplyProxy: JavaScriptReplyProxy? = null
    private var stepSyncInProgress = false
    private var stepSyncQueued = false
    private var permissionRequestInProgress = false
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var pendingCameraRequest: PermissionRequest? = null

    private val healthPermissionLauncher = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { _ ->
        permissionRequestInProgress = false
        getSharedPreferences(HEALTH_PERMISSION_PREFERENCES, MODE_PRIVATE)
            .edit()
            .putBoolean(HEALTH_PERMISSION_REQUESTED, true)
            .apply()
        lifecycleScope.launch {
            try {
                // The callback can contain only the permissions requested in this
                // launch. Recheck the complete grant set after either request.
                val granted = HealthStepReader.client(this@MainActivity)
                    .permissionController.getGrantedPermissions()
                val readGranted = HealthStepReader.readStepsPermission in granted
                val backgroundGranted = HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND in granted
                if (readGranted && backgroundGranted) StepSyncScheduler.schedule(this@MainActivity)
                publishHealthStatus()
                if (readGranted) syncStepHistory()
                else publishHealthError("VFIT needs Steps access. Open Health Connect → App permissions → VFIT and allow Steps.")
            } catch (error: Exception) {
                Log.e("VFIT Health Connect", "Could not check permission result", error)
                publishHealthError("VFIT could not check Steps access. Open Health Connect → App permissions → VFIT.")
            }
        }
    }

    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val request = pendingCameraRequest
        pendingCameraRequest = null
        if (granted && request != null && isTrustedOrigin(request.origin)) {
            request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
        } else {
            request?.deny()
        }
    }

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        filePathCallback?.onReceiveValue(uris)
        filePathCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this)
        setContentView(webView)
        configureWebView()
        installHealthConnectBridge()

        onBackPressedDispatcher.addCallback(this) {
            if (webView.canGoBack()) webView.goBack() else finish()
        }

        if (savedInstanceState == null) webView.loadUrl(APP_URL)
        else webView.restoreState(savedInstanceState)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            mediaPlaybackRequiresUserGesture = true
            setSupportMultipleWindows(false)
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.scheme == "https" && request.url.host == Uri.parse(APP_ORIGIN).host) return false
                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, request.url))
                    true
                } catch (error: ActivityNotFoundException) {
                    true
                }
            }

            override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                pageLoaded = false
                stepReplyProxy = null
            }

            override fun onPageFinished(view: WebView, url: String) {
                pageLoaded = true
                publishCachedSteps()
                publishHealthStatus()
                syncStepHistory()
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    if (!isTrustedOrigin(request.origin) || PermissionRequest.RESOURCE_VIDEO_CAPTURE !in request.resources) {
                        request.deny()
                        return@runOnUiThread
                    }
                    if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
                    } else {
                        pendingCameraRequest?.deny()
                        pendingCameraRequest = request
                        cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                    }
                }
            }

            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback
                return try {
                    fileChooserLauncher.launch(fileChooserParams.createIntent())
                    true
                } catch (error: ActivityNotFoundException) {
                    this@MainActivity.filePathCallback = null
                    filePathCallback.onReceiveValue(null)
                    false
                }
            }
        }
    }

    private fun installHealthConnectBridge() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        WebViewCompat.addWebMessageListener(
            webView,
            BRIDGE_NAME,
            setOf(APP_ORIGIN)
        ) { _, message, sourceOrigin, isMainFrame, replyProxy ->
            // Compare URL parts: WebView may include the default :443 port in
            // sourceOrigin even when the allowed origin rule omits it.
            if (!isMainFrame || !isTrustedOrigin(sourceOrigin)) return@addWebMessageListener
            stepReplyProxy = replyProxy
            val payload = try { JSONObject(message.data ?: "{}") } catch (error: Exception) { JSONObject() }
            val command = payload.optString("command")
            // Reply through the exact frame that sent the command. This also
            // acknowledges a tap when page navigation has made pageLoaded stale.
            try {
                replyProxy.postMessage(
                    JSONObject().put("type", "vfit-health-connect-ack")
                        .put("command", command).toString()
                )
            } catch (error: Exception) {
                Log.w("VFIT Health Connect", "Could not acknowledge bridge command", error)
                stepReplyProxy = null
            }
            when (command) {
                "status" -> publishHealthStatus()
                "request_permission" -> requestHealthPermissions()
                "request_background_permission" -> requestBackgroundPermission()
                "open_settings" -> openHealthConnectSettings()
                "sync" -> syncStepHistory()
            }
        }
    }

    private fun requestHealthPermissions() {
        if (permissionRequestInProgress) return
        permissionRequestInProgress = true
        // Acknowledge the tap before Health Connect's permission query, which
        // can exceed the web screen's acknowledgement timeout on some phones.
        publishPermissionOpening()
        try {
            when (HealthStepReader.sdkStatus(this)) {
                HealthConnectClient.SDK_AVAILABLE -> lifecycleScope.launch {
                    try {
                        val granted = HealthStepReader.client(this@MainActivity)
                            .permissionController.getGrantedPermissions()
                        if (HealthStepReader.readStepsPermission in granted) {
                            permissionRequestInProgress = false
                            publishHealthStatus()
                            syncStepHistory()
                            return@launch
                        }
                        // Request the essential Steps grant on its own. The optional
                        // background grant has a separate action in Settings.
                        healthPermissionLauncher.launch(setOf(HealthStepReader.readStepsPermission))
                    } catch (error: Exception) {
                        permissionRequestInProgress = false
                        Log.e("VFIT Health Connect", "Could not request Steps access", error)
                        publishHealthError("VFIT could not open the access screen. Open Health Connect → App permissions → VFIT.")
                    }
                }
                HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> {
                    permissionRequestInProgress = false
                    publishHealthStatus()
                    openHealthConnectInPlayStore()
                }
                else -> {
                    permissionRequestInProgress = false
                    publishHealthError("Health Connect is unavailable on this phone.")
                }
            }
        } catch (error: Exception) {
            permissionRequestInProgress = false
            Log.e("VFIT Health Connect", "Could not check Health Connect", error)
            publishHealthError("VFIT could not check Health Connect access. Open Health Connect → App permissions → VFIT.")
        }
    }

    private fun requestBackgroundPermission() {
        if (permissionRequestInProgress) return
        permissionRequestInProgress = true
        lifecycleScope.launch {
            try {
                val client = HealthStepReader.client(this@MainActivity)
                val granted = client.permissionController.getGrantedPermissions()
                if (HealthStepReader.readStepsPermission !in granted) {
                    permissionRequestInProgress = false
                    publishHealthStatus()
                    return@launch
                }
                if (!HealthStepReader.backgroundReadAvailable(client)) {
                    permissionRequestInProgress = false
                    return@launch
                }
                if (HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND in granted) {
                    permissionRequestInProgress = false
                    StepSyncScheduler.schedule(this@MainActivity)
                    publishHealthStatus()
                    return@launch
                }
                publishPermissionOpening()
                healthPermissionLauncher.launch(setOf(HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND))
            } catch (error: Exception) {
                permissionRequestInProgress = false
                Log.e("VFIT Health Connect", "Could not request background access", error)
                publishHealthError("VFIT could not open background access. Daily steps still sync when you open VFIT.")
            }
        }
    }

    private fun publishPermissionOpening() {
        sendWebPayload(JSONObject().put("type", "vfit-health-connect-request-opening"))
    }

    private fun publishHealthError(message: String) {
        sendWebPayload(JSONObject().put("type", "vfit-health-connect-error").put("message", message))
    }

    private fun openHealthConnectSettings() {
        try {
            startActivity(Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS))
        } catch (error: ActivityNotFoundException) {
            publishHealthError("Open Android Settings → Health Connect → App permissions → VFIT, then allow Steps.")
        }
    }

    private fun publishHealthStatus() {
        lifecycleScope.launch {
            try {
                val sdkStatus = HealthStepReader.sdkStatus(this@MainActivity)
                val payload = JSONObject()
                    .put("type", "vfit-health-connect-status")
                    .put(
                        "availability",
                        when (sdkStatus) {
                            HealthConnectClient.SDK_AVAILABLE -> "available"
                            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "provider_update_required"
                            else -> "unavailable"
                        }
                    )
                if (sdkStatus == HealthConnectClient.SDK_AVAILABLE) {
                    val client = HealthStepReader.client(this@MainActivity)
                    val granted = client.permissionController.getGrantedPermissions()
                    val requested = getSharedPreferences(HEALTH_PERMISSION_PREFERENCES, MODE_PRIVATE)
                        .getBoolean(HEALTH_PERMISSION_REQUESTED, false)
                    payload.put(
                        "permission",
                        when {
                            HealthStepReader.readStepsPermission in granted -> "granted"
                            requested -> "denied"
                            else -> "prompt"
                        }
                    )
                    payload.put(
                        "backgroundPermission",
                        HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND in granted
                    )
                    payload.put("backgroundAvailable", try {
                        HealthStepReader.backgroundReadAvailable(client)
                    } catch (error: Exception) {
                        false // Optional capability must not hide the Steps permission state.
                    })
                } else {
                    payload.put("permission", "unavailable")
                    payload.put("backgroundPermission", false)
                    payload.put("backgroundAvailable", false)
                }
                sendWebPayload(payload)
            } catch (error: Exception) {
                Log.e("VFIT Health Connect", "Could not read Health Connect status", error)
                publishHealthError("VFIT could not read Health Connect permissions. Open Health Connect → App permissions → VFIT.")
            }
        }
    }

    private fun syncStepHistory() {
        publishCachedSteps()
        if (stepSyncInProgress) {
            // A launch/resume read can still be running when the web account
            // finishes loading and asks for its own refresh. Never discard that
            // post-login request: run it once more after the active read ends.
            stepSyncQueued = true
            return
        }
        if (HealthStepReader.sdkStatus(this) != HealthConnectClient.SDK_AVAILABLE) {
            publishHealthStatus()
            return
        }
        stepSyncInProgress = true
        stepSyncQueued = false
        lifecycleScope.launch {
            try {
                val client = HealthStepReader.client(this@MainActivity)
                val granted = client.permissionController.getGrantedPermissions()
                if (HealthStepReader.readStepsPermission !in granted) {
                    publishHealthStatus()
                    return@launch
                }
                val today = LocalDate.now(ZoneId.systemDefault())
                val dayCount = StepCache.historyDaysToSync(this@MainActivity, today)
                // Update the dashboard as soon as today's read completes; a
                // first launch can need up to 30 separate history reads.
                val liveToday = HealthStepReader.readToday(this@MainActivity)
                StepCache.write(this@MainActivity, liveToday)
                publishStepTotal(liveToday, cachedValue = false)
                val totals = HealthStepReader.readRecentDays(this@MainActivity, dayCount, liveToday)
                val todayTotal = totals.firstOrNull { it.date == today.toString() }
                if (todayTotal != null) StepCache.write(this@MainActivity, todayTotal)
                StepCache.markHistorySynced(this@MainActivity, today)
                if (HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND in granted) {
                    StepSyncScheduler.schedule(this@MainActivity)
                }
                publishStepHistory(totals)
            } catch (error: Exception) {
                Log.e("VFIT Health Connect", "Could not sync daily steps", error)
                sendWebPayload(
                    JSONObject()
                        .put("type", "vfit-health-connect-error")
                        .put("message", "Health Connect could not update daily step history")
                )
            } finally {
                stepSyncInProgress = false
                if (stepSyncQueued && pageLoaded) {
                    stepSyncQueued = false
                    syncStepHistory()
                }
            }
        }
    }

    private fun publishCachedSteps() {
        val cached = StepCache.read(this) ?: return
        val today = LocalDate.now(ZoneId.systemDefault()).toString()
        if (cached.date == today) publishStepTotal(cached, cachedValue = true)
    }

    private fun publishStepTotal(total: CachedStepTotal, cachedValue: Boolean) {
        sendWebPayload(
            JSONObject()
                .put("type", "vfit-health-connect-steps")
                .put("date", total.date)
                .put("steps", total.steps)
                .put("capturedAt", total.capturedAt)
                .put("cached", cachedValue)
                .put("timeZone", ZoneId.systemDefault().id)
        )
    }

    private fun publishStepHistory(totals: List<CachedStepTotal>) {
        val entries = JSONArray()
        totals.forEach { total ->
            entries.put(
                JSONObject()
                    .put("date", total.date)
                    .put("steps", total.steps)
                    .put("capturedAt", total.capturedAt)
            )
        }
        sendWebPayload(
            JSONObject()
                .put("type", "vfit-health-connect-history")
                .put("entries", entries)
                .put("capturedAt", totals.firstOrNull()?.capturedAt ?: java.time.Instant.now().toString())
                .put("cached", false)
                .put("timeZone", ZoneId.systemDefault().id)
        )
    }

    private fun sendWebPayload(payload: JSONObject) {
        webView.post {
            if (!pageLoaded || !isTrustedOrigin(Uri.parse(webView.url ?: ""))) return@post
            val message = payload.toString()
            try {
                stepReplyProxy?.let {
                    it.postMessage(message)
                    return@post
                }
            } catch (error: Exception) {
                // A navigation can invalidate a frame's proxy before onPageStarted.
                Log.w("VFIT Health Connect", "Bridge reply failed; using main-frame message", error)
                stepReplyProxy = null
            }
            // Startup reads can finish before JavaScript posts its first command.
            if (WebViewFeature.isFeatureSupported(WebViewFeature.POST_WEB_MESSAGE)) {
                WebViewCompat.postWebMessage(webView, WebMessageCompat(message), Uri.parse(APP_ORIGIN))
                return@post
            }
            val quoted = JSONObject.quote(payload.toString())
            webView.evaluateJavascript(
                "if (typeof window.__vfitReceiveNativeStepPayload === 'function') " +
                    "window.__vfitReceiveNativeStepPayload($quoted); " +
                    "else window.postMessage($quoted, '$APP_ORIGIN');",
                null
            )
        }
    }

    private fun isTrustedOrigin(origin: Uri): Boolean =
        origin.scheme == "https" && origin.host == Uri.parse(APP_ORIGIN).host &&
            (origin.port == -1 || origin.port == 443)

    private fun openHealthConnectInPlayStore() {
        val marketIntent = Intent(
            Intent.ACTION_VIEW,
            Uri.parse("market://details?id=${HealthStepReader.PROVIDER_PACKAGE}")
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            startActivity(marketIntent)
        } catch (error: ActivityNotFoundException) {
            startActivity(
                Intent(
                    Intent.ACTION_VIEW,
                    Uri.parse("https://play.google.com/store/apps/details?id=${HealthStepReader.PROVIDER_PACKAGE}")
                )
            )
        }
    }

    override fun onResume() {
        super.onResume()
        if (pageLoaded) {
            publishHealthStatus()
            syncStepHistory()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        pendingCameraRequest?.deny()
        pendingCameraRequest = null
        filePathCallback?.onReceiveValue(null)
        filePathCallback = null
        webView.destroy()
        super.onDestroy()
    }
}
