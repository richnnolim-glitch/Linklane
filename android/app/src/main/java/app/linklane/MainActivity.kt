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
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.ContextCompat.RECEIVER_NOT_EXPORTED
import java.io.File
import java.net.InetAddress
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * Small native Android client shell. The next UI integration step replaces
 * this screen with the existing React UI while keeping this native service.
 */
class MainActivity : Activity() {
    private val peers = ConcurrentHashMap<String, Peer>()
    private val io = Executors.newSingleThreadExecutor()
    private lateinit var status: TextView
    private lateinit var peerList: LinearLayout
    private lateinit var message: EditText
    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                LanShareService.ACTION_PEER -> {
                    val id = intent.getStringExtra(LanShareService.EXTRA_PEER) ?: return
                    val address = intent.getStringExtra("address") ?: return
                    val host = address.substringBeforeLast(":")
                    val port = address.substringAfterLast(":").toIntOrNull() ?: return
                    val peer = Peer(id, intent.getStringExtra(LanShareService.EXTRA_NAME) ?: "Device",
                        "other", InetAddress.getByName(host), port)
                    peers[id] = peer
                    runOnUiThread { renderPeers() }
                }
                LanShareService.ACTION_STATUS ->
                    runOnUiThread { status.text = intent.getStringExtra("message") ?: "Ready" }
                LanShareService.ACTION_INCOMING -> {
                    val token = intent.getStringExtra(LanShareService.EXTRA_TOKEN) ?: return
                    val name = intent.getStringExtra(LanShareService.EXTRA_NAME) ?: "Incoming item"
                    val size = intent.getLongExtra(LanShareService.EXTRA_SIZE, 0)
                    runOnUiThread {
                        android.app.AlertDialog.Builder(this@MainActivity)
                            .setTitle("Incoming from nearby device")
                            .setMessage("$name ($size bytes). Save this item?")
                            .setNegativeButton("Reject") { _, _ -> reject(token) }
                            .setPositiveButton("Accept") { _, _ -> accept(token, name) }
                            .setCancelable(false).show()
                    }
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestPermissionsIfNeeded()
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(24, 28, 24, 24) }
        root.addView(TextView(this).apply { text = "Linklane"; textSize = 28f })
        status = TextView(this).apply { text = "Starting local discovery…"; textSize = 14f }
        root.addView(status)
        root.addView(TextView(this).apply { text = "Devices on this Wi-Fi"; textSize = 18f; setPadding(0, 24, 0, 8) })
        peerList = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(ScrollView(this).apply { addView(peerList) },
            LinearLayout.LayoutParams(-1, 0, 1f))
        message = EditText(this).apply { hint = "Text to send to selected device" }
        root.addView(message)
        val sendText = Button(this).apply { text = "Send text"; isEnabled = false }
        root.addView(sendText)
        sendText.setOnClickListener {
            val peer = selectedPeer ?: return@setOnClickListener
            val text = message.text.toString()
            io.execute {
                val ok = sendText(peer, text)
                runOnUiThread { status.text = if (ok) "Text sent" else "Text send failed" }
            }
        }
        val pick = Button(this).apply { text = "Choose file" }
        root.addView(pick)
        pick.setOnClickListener {
            if (selectedPeer == null) { status.text = "Select a device first"; return@setOnClickListener }
            startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE), 71)
        }
        setContentView(root)
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(receiver, IntentFilter().apply {
                addAction(LanShareService.ACTION_PEER); addAction(LanShareService.ACTION_STATUS)
                addAction(LanShareService.ACTION_INCOMING)
            }, RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("DEPRECATION")
            registerReceiver(receiver, IntentFilter().apply {
                addAction(LanShareService.ACTION_PEER); addAction(LanShareService.ACTION_STATUS)
                addAction(LanShareService.ACTION_INCOMING)
            })
        }
        ContextCompat.startForegroundService(this, Intent(this, LanShareService::class.java))
        sendText.isEnabled = true
    }

    private var selectedPeer: Peer? = null

    private fun renderPeers() {
        peerList.removeAllViews()
        peers.values.sortedBy { it.name }.forEach { peer ->
            val button = Button(this).apply {
                text = if (selectedPeer?.id == peer.id) "✓ ${peer.name}  •  ${peer.address}" else "${peer.name}  •  ${peer.address}"
                setOnClickListener { selectedPeer = peer; renderPeers() }
            }
            peerList.addView(button)
        }
        if (peers.isEmpty()) peerList.addView(TextView(this).apply { text = "No devices found yet. Keep both devices on the same private Wi-Fi." })
    }

    private fun sendText(peer: Peer, text: String): Boolean = runCatching {
        val bytes = text.toByteArray(Charsets.UTF_8)
        require(bytes.isNotEmpty() && bytes.size <= 64 * 1024)
        java.net.Socket(peer.host, peer.port).use { socket ->
            val out = java.io.DataOutputStream(socket.getOutputStream())
            val input = java.io.DataInputStream(socket.getInputStream())
            out.writeInt(0x4c4e4c31); out.writeByte(1); out.writeInt(bytes.size); out.write(bytes); out.flush()
            input.readBoolean()
        }
    }.getOrDefault(false)

    @Deprecated("Use Activity Result API in production")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != 71 || resultCode != RESULT_OK) return
        val uri: Uri = data?.data ?: return
        val peer = selectedPeer ?: return
        io.execute {
            val size = contentResolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L
            val name = queryName(uri) ?: "shared-file"
            val ok = contentResolver.openInputStream(uri)?.let { input ->
                sendFile(peer, name, input, size)
            } ?: false
            runOnUiThread { status.text = if (ok) "File sent" else "File transfer failed" }
        }
    }

    private fun sendFile(peer: Peer, name: String, input: java.io.InputStream, size: Long): Boolean =
        runCatching {
            require(size in 0..1_500_000_000L)
            val safeName = name.substringAfterLast('/').substringAfterLast('\\').take(180)
                .toByteArray(Charsets.UTF_8)
            require(safeName.isNotEmpty() && safeName.size <= 240)
            java.net.Socket(peer.host, peer.port).use { socket ->
                val out = java.io.DataOutputStream(java.io.BufferedOutputStream(socket.getOutputStream()))
                val ack = java.io.DataInputStream(socket.getInputStream())
                out.writeInt(0x4c4e4c31); out.writeByte(2); out.writeShort(safeName.size)
                out.write(safeName); out.writeLong(size)
                input.use { stream ->
                    val buffer = ByteArray(64 * 1024); var remaining = size
                    while (remaining > 0) {
                        val n = stream.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
                        if (n < 0) throw java.io.EOFException("File changed during transfer")
                        out.write(buffer, 0, n); remaining -= n
                    }
                }
                out.flush(); ack.readBoolean()
            }
        }.getOrDefault(false)

    private fun queryName(uri: Uri): String? = contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)
        ?.use { if (it.moveToFirst()) it.getString(0) else null }

    private fun accept(token: String, name: String) {
        val destination = File(getExternalFilesDir(null), name.replace(Regex("[/\\\\]"), "_"))
        // Incoming payloads remain private until this explicit approval action.
        val staged = sequenceOf(
            File(cacheDir, "incoming-$token.part"),
            File(cacheDir, "incoming-$token.txt")
        ).firstOrNull { it.exists() }
        if (staged != null) {
            runCatching { staged.copyTo(destination, overwrite = false); staged.delete() }
                .onSuccess { status.text = "Saved to app files: ${destination.name}" }
                .onFailure { status.text = "Could not save: ${it.message}" }
        } else status.text = "Incoming item expired"
    }

    private fun reject(token: String) {
        File(cacheDir, "incoming-$token.part").delete()
        File(cacheDir, "incoming-$token.txt").delete()
        status.text = "Incoming item rejected"
    }

    private fun requestPermissionsIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33) {
            val needed = arrayOf(Manifest.permission.POST_NOTIFICATIONS).filter {
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
}
