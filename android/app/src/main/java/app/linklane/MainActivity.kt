package app.linklane

import android.Manifest
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.ContextCompat.RECEIVER_NOT_EXPORTED
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.InetAddress
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * Android native host for the shared React Linklane interface.
 * All LAN sockets, discovery and transfer work stay in LanShareService.
 */
class MainActivity : Activity() {
    private val peers = ConcurrentHashMap<String, Peer>()
    private val io = Executors.newSingleThreadExecutor()
    private lateinit var webView: WebView
    @Volatile private var selectedPeer: Peer? = null

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                LanShareService.ACTION_PEER -> {
                    val id = intent.getStringExtra(LanShareService.EXTRA_PEER) ?: return
                    val address = intent.getStringExtra("address") ?: return
                    val host = address.substringBeforeLast(":")
                    val port = address.substringAfterLast(":").toIntOrNull() ?: return
                    val peer = Peer(
                        id,
                        intent.getStringExtra(LanShareService.EXTRA_NAME) ?: "Nearby device",
                        intent.getStringExtra(LanShareService.EXTRA_KIND) ?: "other",
                        InetAddress.getByName(host),
                        port
                    )
                    peers[id] = peer
                    emit("linklanePeer", peerJson(peer))
                }
                LanShareService.ACTION_STATUS -> {
                    emit("linklaneStatus", JSONObject.quote(intent.getStringExtra("message") ?: "Ready"))
                }
                LanShareService.ACTION_INCOMING -> {
                    val token = intent.getStringExtra(LanShareService.EXTRA_TOKEN) ?: return
                    val name = intent.getStringExtra(LanShareService.EXTRA_NAME) ?: "Incoming item"
                    val size = intent.getLongExtra(LanShareService.EXTRA_SIZE, 0)
                    val kind = intent.getStringExtra(LanShareService.EXTRA_KIND) ?: "file"
                    if (kind == "text") {
                        val staged = File(cacheDir, "incoming-$token.txt")
                        val text = runCatching { staged.readText(Charsets.UTF_8) }.getOrDefault("")
                        staged.delete()
                        emit("linklaneTextIncoming", JSONObject()
                            .put("peerName", "Nearby device").put("text", text).toString())
                    } else {
                        emit("linklaneIncoming", JSONObject()
                            .put("token", token).put("name", name).put("size", size)
                            .put("peer_name", "Nearby device").put("kind", kind).toString())
                    }
                }
            }
        }
    }

    inner class LinklaneBridge {
        @JavascriptInterface
        fun getPeers(): String = JSONArray().apply {
            peers.values.sortedBy { it.name }.forEach { put(peerJsonObject(it)) }
        }.toString()

        @JavascriptInterface
        fun sendText(peerId: String, text: String) {
            val peer = peers[peerId] ?: return
            io.execute {
                val ok = sendTextTo(peer, text)
                emit("linklaneStatus", JSONObject.quote(if (ok) "Text sent directly over Wi-Fi" else "Text send failed"))
            }
        }

        @JavascriptInterface
        fun chooseFile(peerId: String) {
            selectedPeer = peers[peerId]
            runOnUiThread {
                if (selectedPeer == null) {
                    emit("linklaneStatus", JSONObject.quote("Select an online device first"))
                    return@runOnUiThread
                }
                startActivityForResult(
                    Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*")
                        .addCategory(Intent.CATEGORY_OPENABLE),
                    REQUEST_FILE
                )
            }
        }

        @JavascriptInterface
        fun accept(token: String, name: String) {
            runOnUiThread { acceptIncoming(token, name) }
        }

        @JavascriptInterface
        fun reject(token: String) {
            runOnUiThread { rejectIncoming(token) }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestPermissionsIfNeeded()
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            addJavascriptInterface(LinklaneBridge(), "Linklane")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    assetLoader.shouldInterceptRequest(request.url)

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                    request.url.host != "appassets.androidplatform.net"

                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    emit("linklaneStatus", JSONObject.quote("Searching this local network"))
                    peers.values.forEach { emit("linklanePeer", peerJson(it)) }
                }
            }
        }
        setContentView(webView)
        registerAppReceiver()
        ContextCompat.startForegroundService(this, Intent(this, LanShareService::class.java))
        webView.loadUrl("https://appassets.androidplatform.net/assets/linklane/lan-android.html")
    }

    private fun registerAppReceiver() {
        val filter = IntentFilter().apply {
            addAction(LanShareService.ACTION_PEER)
            addAction(LanShareService.ACTION_STATUS)
            addAction(LanShareService.ACTION_INCOMING)
        }
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(receiver, filter, RECEIVER_NOT_EXPORTED)
        else {
            @Suppress("DEPRECATION")
            registerReceiver(receiver, filter)
        }
    }

    private fun peerJsonObject(peer: Peer) = JSONObject()
        .put("id", peer.id).put("name", peer.name).put("device", peer.device)
        .put("address", peer.address.hostAddress).put("port", peer.port)

    private fun peerJson(peer: Peer): String = peerJsonObject(peer).toString()

    private fun emit(function: String, payload: String) {
        if (!::webView.isInitialized) return
        runOnUiThread {
            if (::webView.isInitialized) {
                webView.evaluateJavascript("window.$function && window.$function($payload)", null)
            }
        }
    }

    private fun sendTextTo(peer: Peer, text: String): Boolean = runCatching {
        val bytes = text.toByteArray(Charsets.UTF_8)
        require(bytes.isNotEmpty() && bytes.size <= 64 * 1024)
        java.net.Socket(peer.host, peer.port).use { socket ->
            val out = java.io.DataOutputStream(socket.getOutputStream())
            val input = java.io.DataInputStream(socket.getInputStream())
            out.writeInt(0x4c4e4c32)
            out.writeByte(1)
            out.writeInt(bytes.size)
            out.write(bytes)
            out.flush()
            input.readBoolean()
        }
    }.getOrDefault(false)

    @Deprecated("Use Activity Result API in production")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQUEST_FILE || resultCode != RESULT_OK) return
        val uri: Uri = data?.data ?: return
        val peer = selectedPeer ?: return
        io.execute {
            val size = contentResolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L
            val name = queryName(uri) ?: "shared-file"
            val digest = contentResolver.openInputStream(uri)?.use { input ->
                val md = MessageDigest.getInstance("SHA-256")
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    val n = input.read(buffer)
                    if (n < 0) break
                    md.update(buffer, 0, n)
                }
                md.digest().joinToString("") { "%02x".format(it) }
            }
            val ok = digest?.let { sendFile(peer, name, uri, size, it) } ?: false
            emit("linklaneStatus", JSONObject.quote(if (ok) "File sent directly over Wi-Fi" else "File transfer failed"))
        }
    }

    private fun sendFile(peer: Peer, name: String, uri: Uri, size: Long, digestHex: String): Boolean =
        runCatching {
            require(size in 0..1_500_000_000L)
            val digest = digestHex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
            require(digest.size == 32)
            val safeName = name.substringAfterLast('/').substringAfterLast('\\\\').take(180)
                .toByteArray(Charsets.UTF_8)
            require(safeName.isNotEmpty() && safeName.size <= 240)
            java.net.Socket(peer.host, peer.port).use { socket ->
                val out = java.io.DataOutputStream(java.io.BufferedOutputStream(socket.getOutputStream()))
                val ack = java.io.DataInputStream(socket.getInputStream())
                out.writeInt(0x4c4e4c32)
                out.writeByte(2)
                out.writeShort(safeName.size)
                out.write(safeName)
                out.writeLong(size)
                out.write(digest)
                contentResolver.openInputStream(uri)?.use { stream ->
                    val buffer = ByteArray(64 * 1024)
                    var remaining = size
                    while (remaining > 0) {
                        val n = stream.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
                        if (n < 0) throw java.io.EOFException("File changed during transfer")
                        out.write(buffer, 0, n)
                        remaining -= n
                    }
                } ?: throw java.io.IOException("Could not reopen the selected file")
                out.flush()
                ack.readBoolean()
            }
        }.getOrDefault(false)

    private fun queryName(uri: Uri): String? =
        contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)
            ?.use { if (it.moveToFirst()) it.getString(0) else null }

    private fun acceptIncoming(token: String, name: String) {
        val destination = File(getExternalFilesDir(null), name.replace(Regex("[/\\\\\\\\]"), "_"))
        val staged = File(cacheDir, "incoming-$token.part")
        if (staged.exists()) {
            runCatching { staged.copyTo(destination, overwrite = false); staged.delete() }
                .onSuccess { emit("linklaneStatus", JSONObject.quote("Saved to app files: ${destination.name}")) }
                .onFailure { emit("linklaneStatus", JSONObject.quote("Could not save: ${it.message}")) }
        } else emit("linklaneStatus", JSONObject.quote("Incoming item expired"))
    }

    private fun rejectIncoming(token: String) {
        File(cacheDir, "incoming-$token.part").delete()
        File(cacheDir, "incoming-$token.txt").delete()
        emit("linklaneStatus", JSONObject.quote("Incoming item rejected"))
    }

    private fun requestPermissionsIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33) {
            val needed = arrayOf(
                Manifest.permission.POST_NOTIFICATIONS,
                Manifest.permission.NEARBY_WIFI_DEVICES
            ).filter {
                ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
            }
            if (needed.isNotEmpty()) ActivityCompat.requestPermissions(this, needed.toTypedArray(), 4)
        }
    }

    override fun onDestroy() {
        runCatching { unregisterReceiver(receiver) }
        io.shutdownNow()
        super.onDestroy()
    }

    companion object { private const val REQUEST_FILE = 71 }
}
