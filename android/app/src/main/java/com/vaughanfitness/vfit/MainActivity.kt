package com.vaughanfitness.vfit

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
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
    private var stepSyncInProgress = false
    private var stepSyncQueued = false
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var pendingCameraRequest: PermissionRequest? = null

    private val healthPermissionLauncher = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { grantedPermissions ->
        getSharedPreferences(HEALTH_PERMISSION_PREFERENCES, MODE_PRIVATE)
            .edit()
            .putBoolean(HEALTH_PERMISSION_REQUESTED, true)
            .apply()
        val readGranted = HealthStepReader.readStepsPermission in grantedPermissions
        val backgroundGranted = HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND in grantedPermissions
        if (readGranted && backgroundGranted) StepSyncScheduler.schedule(this)
        publishHealthStatus()
        if (readGranted) syncStepHistory()
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
        ) { _, message, sourceOrigin, isMainFrame, _ ->
            if (!isMainFrame || sourceOrigin.toString().removeSuffix("/") != APP_ORIGIN) return@addWebMessageListener
            val payload = try { JSONObject(message.data ?: "{}") } catch (error: Exception) { JSONObject() }
            when (payload.optString("command")) {
                "status" -> publishHealthStatus()
                "request_permission" -> requestHealthPermissions()
                "sync" -> syncStepHistory()
            }
        }
    }

    private fun requestHealthPermissions() {
        when (HealthStepReader.sdkStatus(this)) {
            HealthConnectClient.SDK_AVAILABLE -> lifecycleScope.launch {
                val client = HealthStepReader.client(this@MainActivity)
                val permissions = mutableSetOf(HealthStepReader.readStepsPermission)
                if (HealthStepReader.backgroundReadAvailable(client)) {
                    permissions += HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND
                }
                getSharedPreferences(HEALTH_PERMISSION_PREFERENCES, MODE_PRIVATE)
                    .edit()
                    .putBoolean(HEALTH_PERMISSION_REQUESTED, true)
                    .apply()
                healthPermissionLauncher.launch(permissions)
            }
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> {
                publishHealthStatus()
                openHealthConnectInPlayStore()
            }
            else -> publishHealthStatus()
        }
    }

    private fun publishHealthStatus() {
        lifecycleScope.launch {
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
            } else {
                payload.put("permission", "unavailable")
                payload.put("backgroundPermission", false)
            }
            sendWebPayload(payload)
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
                val totals = HealthStepReader.readRecentDays(this@MainActivity, dayCount)
                val todayTotal = totals.firstOrNull { it.date == today.toString() }
                if (todayTotal != null) StepCache.write(this@MainActivity, todayTotal)
                StepCache.markHistorySynced(this@MainActivity, today)
                if (HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND in granted) {
                    StepSyncScheduler.schedule(this@MainActivity)
                }
                publishStepHistory(totals)
            } catch (error: Exception) {
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
        if (!pageLoaded) return
        webView.post {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.POST_WEB_MESSAGE)) {
                WebViewCompat.postWebMessage(
                    webView,
                    WebMessageCompat(payload.toString()),
                    Uri.parse(APP_ORIGIN)
                )
            } else {
                val quoted = JSONObject.quote(payload.toString())
                webView.evaluateJavascript("window.postMessage($quoted, '$APP_ORIGIN');", null)
            }
        }
    }

    private fun isTrustedOrigin(origin: Uri): Boolean =
        origin.scheme == "https" && origin.host == Uri.parse(APP_ORIGIN).host

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
