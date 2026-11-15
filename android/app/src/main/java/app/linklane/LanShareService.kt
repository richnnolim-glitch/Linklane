package app.linklane

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketTimeoutException
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * LAN-only transport service.
 *
 * Discovery: DNS-SD (_linklane._tcp) plus UDP broadcast fallback.
 * Transfer: direct TCP framed protocol. No cloud relay or public-IP lookup.
 *
 * Incoming payloads are always staged in cache until the Activity explicitly
 * approves them. Do not change this to auto-save untrusted senders.
 */
class LanShareService : Service() {
    companion object {
        const val ACTION_PEER = "app.linklane.PEER"
        const val ACTION_INCOMING = "app.linklane.INCOMING"
        const val ACTION_STATUS = "app.linklane.STATUS"
        const val EXTRA_PEER = "peer"
        const val EXTRA_NAME = "name"
        const val EXTRA_KIND = "kind"
        const val EXTRA_SIZE = "size"
        const val EXTRA_TOKEN = "token"
        const val EXTRA_TEXT = "text"
        const val EXTRA_FILE = "file"
        private const val CHANNEL = "linklane_lan"
        private const val SERVICE_TYPE = "_linklane._tcp."
        private const val UDP_PORT = 45821
        private const val DEFAULT_TCP_PORT = 45822
        private const val MAGIC = 0x4c4e4c31 // LNL1
        private const val MAX_TEXT_BYTES = 64 * 1024
        private const val MAX_FILE_BYTES = 1_500_000_000L
        private const val MAX_NAME_BYTES = 240
    }

    private val running = AtomicBoolean(false)
    private val io = Executors.newCachedThreadPool()
    private val peers = ConcurrentHashMap<String, Peer>()
    private val pending = ConcurrentHashMap<String, java.io.File>()
    private lateinit var nsd: NsdManager
    private lateinit var wifi: WifiManager
    private var multicastLock: WifiManager.MulticastLock? = null
    private var server: ServerSocket? = null
    private var registration: NsdManager.RegistrationListener? = null
    private var discovery: NsdManager.DiscoveryListener? = null
    private var deviceId = ""
    private var deviceName = "Android device"
    private var port = DEFAULT_TCP_PORT

    override fun onCreate() {
        super.onCreate()
        nsd = getSystemService(NSD_SERVICE) as NsdManager
        wifi = applicationContext.getSystemService(WIFI_SERVICE) as WifiManager
        deviceId = getSharedPreferences("linklane", MODE_PRIVATE)
            .getString("device_id", null) ?: UUID.randomUUID().toString().also {
                getSharedPreferences("linklane", MODE_PRIVATE).edit().putString("device_id", it).apply()
            }
        deviceName = Build.MODEL?.take(40)?.ifBlank { "Android device" } ?: "Android device"
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(41, notification("Discovering devices on this Wi-Fi"))
        startNetworking()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startNetworking() {
        if (!running.compareAndSet(false, true)) return
        multicastLock = wifi.createMulticastLock("linklane-mdns").apply {
            setReferenceCounted(false)
            acquire()
        }
        io.execute { runServer() }
        io.execute { udpDiscoveryLoop() }
        broadcastStatus("Searching this local network")
    }

    private fun registerService() {
        val info = NsdServiceInfo().apply {
            serviceName = "Linklane-${deviceId.take(8)}"
            serviceType = SERVICE_TYPE
            port = this@LanShareService.port
            setAttribute("v", "1")
            setAttribute("id", deviceId)
            setAttribute("device", "android")
        }
        val listener = object : NsdManager.RegistrationListener {
            override fun onServiceRegistered(serviceInfo: NsdServiceInfo) {}
            override fun onRegistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                broadcastStatus("mDNS registration failed; UDP discovery remains active")
            }
            override fun onServiceUnregistered(serviceInfo: NsdServiceInfo) {}
            override fun onUnregistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {}
        }
        registration = listener
        nsd.registerService(info, NsdManager.PROTOCOL_DNS_SD, listener)
    }

    private fun discoverServices() {
        val listener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) {}
            override fun onServiceFound(info: NsdServiceInfo) {
                if (info.serviceName.startsWith("Linklane-")) {
                    nsd.resolveService(info, object : NsdManager.ResolveListener {
                        override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {}
                        override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                            val id = serviceInfo.attributes["id"]?.toString(Charsets.UTF_8) ?: return
                            if (id == deviceId || !id.matches(Regex("[a-zA-Z0-9-]{8,64}"))) return
                            val kind = serviceInfo.attributes["device"]?.toString(Charsets.UTF_8) ?: "other"
                            val peer = Peer(id, serviceInfo.serviceName.removePrefix("Linklane-"), kind,
                                serviceInfo.host, serviceInfo.port)
                            peers[id] = peer
                            sendBroadcast(Intent(ACTION_PEER).setPackage(packageName).putExtra(EXTRA_PEER, peer.id)
                                .putExtra(EXTRA_NAME, peer.name).putExtra("address", peer.address))
                        }
                    })
                }
            }
            override fun onServiceLost(info: NsdServiceInfo) {
                peers.entries.removeIf { it.value.name == info.serviceName }
            }
            override fun onDiscoveryStopped(serviceType: String) {}
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                runCatching { nsd.stopServiceDiscovery(this) }
            }
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
        }
        discovery = listener
        nsd.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
    }

    /** Broadcast discovery is a fallback for routers with broken multicast DNS. */
    private fun udpDiscoveryLoop() {
        while (running.get()) {
            try {
                DatagramSocket(null).use { receiver ->
                    receiver.reuseAddress = true
                    receiver.broadcast = true
                    receiver.soTimeout = 1000
                    receiver.bind(InetSocketAddress(UDP_PORT))
                    val request = JSONObject().put("type", "discover").put("version", 1).put("id", deviceId)
                        .toString().toByteArray()
                    DatagramSocket().use { sender ->
                        sender.broadcast = true
                        sender.send(DatagramPacket(request, request.size,
                            InetAddress.getByName("255.255.255.255"), UDP_PORT))
                    }
                    val buffer = ByteArray(1024)
                    val until = System.currentTimeMillis() + 1800
                    while (running.get() && System.currentTimeMillis() < until) {
                        try {
                            val packet = DatagramPacket(buffer, buffer.size)
                            receiver.receive(packet)
                            val json = JSONObject(String(packet.data, packet.offset, packet.length))
                            if (json.optInt("version") != 1) continue
                            if (json.optString("type") == "discover") {
                                if (json.optString("id") == deviceId) continue
                                val advert = JSONObject().put("type", "advertise").put("version", 1)
                                    .put("id", deviceId).put("name", deviceName)
                                    .put("device", "android").put("port", port).toString().toByteArray()
                                receiver.send(DatagramPacket(advert, advert.size, packet.address, packet.port))
                            } else if (json.optString("type") == "advertise") {
                                val id = json.optString("id")
                                val name = json.optString("name").take(40)
                                val p = json.optInt("port")
                                if (id != deviceId && id.matches(Regex("[a-zA-Z0-9-]{8,64}")) &&
                                    p in 1..65535 && name.isNotBlank()) {
                                    val peer = Peer(id, name, json.optString("device", "other"), packet.address, p)
                                    peers[id] = peer
                                    sendBroadcast(Intent(ACTION_PEER).setPackage(packageName)
                                        .putExtra(EXTRA_PEER, id).putExtra(EXTRA_NAME, name)
                                        .putExtra("address", peer.address))
                                }
                            }
                        } catch (_: SocketTimeoutException) { break }
                    }
                }
            } catch (_: Exception) { /* Wi-Fi may be switching; retry */ }
            try { Thread.sleep(1800) } catch (_: InterruptedException) { return }
        }
    }

    private fun runServer() {
        try {
            ServerSocket(DEFAULT_TCP_PORT, 32, InetAddress.getByName("0.0.0.0")).use { listener ->
                server = listener
                port = listener.localPort
                registerService()
                discoverServices()
                while (running.get()) {
                    val socket = listener.accept()
                    io.execute { handleClient(socket) }
                }
            }
        } catch (e: Exception) {
            if (running.get()) broadcastStatus("Local transfer listener failed: ${e.message}")
        }
    }

    private fun handleClient(socket: Socket) {
        socket.use { client ->
            client.soTimeout = 30_000
            val input = DataInputStream(BufferedInputStream(client.getInputStream()))
            val output = DataOutputStream(BufferedOutputStream(client.getOutputStream()))
            if (input.readInt() != MAGIC) return
            when (input.readUnsignedByte()) {
                1 -> {
                    val length = input.readInt()
                    if (length !in 1..MAX_TEXT_BYTES) return
                    val text = ByteArray(length)
                    input.readFully(text)
                    val token = UUID.randomUUID().toString()
                    val staged = File(cacheDir, "incoming-$token.txt")
                    staged.writeBytes(text)
                    pending[token] = staged
                    sendIncoming(token, "Text message", length.toLong(), "text")
                    output.writeBoolean(true); output.flush()
                }
                2 -> {
                    val nameLength = input.readUnsignedShort()
                    if (nameLength !in 1..MAX_NAME_BYTES) return
                    val nameBytes = ByteArray(nameLength); input.readFully(nameBytes)
                    val name = String(nameBytes).replace(Regex("[\\\\/\\u0000-\\u001f]"), "_").take(180)
                    val size = input.readLong()
                    if (size !in 0..MAX_FILE_BYTES) return
                    val token = UUID.randomUUID().toString()
                    val staged = File(cacheDir, "incoming-$token.part")
                    FileOutputStream(staged).use { fileOut ->
                        val buffer = ByteArray(64 * 1024)
                        var remaining = size
                        while (remaining > 0) {
                            val n = input.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
                            if (n < 0) throw java.io.EOFException("Transfer ended early")
                            fileOut.write(buffer, 0, n)
                            remaining -= n
                        }
                        fileOut.fd.sync()
                    }
                    pending[token] = staged
                    sendIncoming(token, name, size, "file")
                    output.writeBoolean(true); output.flush()
                }
                else -> return
            }
        }
    }

    private fun sendIncoming(token: String, name: String, size: Long, kind: String) {
        sendBroadcast(Intent(ACTION_INCOMING).setPackage(packageName)
            .putExtra(EXTRA_TOKEN, token).putExtra(EXTRA_NAME, name)
            .putExtra(EXTRA_SIZE, size).putExtra(EXTRA_KIND, kind))
    }

    /** Called by Activity only after the user taps Accept. */
    fun acceptPending(token: String, destination: java.io.File): Boolean {
        val source = pending.remove(token) ?: return false
        return runCatching {
            source.copyTo(destination, overwrite = false)
            source.delete()
            true
        }.getOrDefault(false)
    }

    fun rejectPending(token: String) { pending.remove(token)?.delete() }

    fun sendText(peer: Peer, text: String): Boolean = runCatching {
        val bytes = text.toByteArray(Charsets.UTF_8)
        require(bytes.isNotEmpty() && bytes.size <= MAX_TEXT_BYTES)
        Socket(peer.host, peer.port).use { socket ->
            val out = DataOutputStream(BufferedOutputStream(socket.getOutputStream()))
            val input = DataInputStream(BufferedInputStream(socket.getInputStream()))
            out.writeInt(MAGIC); out.writeByte(1); out.writeInt(bytes.size); out.write(bytes); out.flush()
            input.readBoolean()
        }
    }.getOrDefault(false)

    fun sendFile(peer: Peer, name: String, source: java.io.InputStream, size: Long): Boolean = runCatching {
        require(size in 0..MAX_FILE_BYTES)
        val safe = name.substringAfterLast('/').substringAfterLast('\\').take(180)
            .toByteArray(Charsets.UTF_8).also { require(it.size in 1..MAX_NAME_BYTES) }
        Socket(peer.host, peer.port).use { socket ->
            val out = DataOutputStream(BufferedOutputStream(socket.getOutputStream()))
            val input = DataInputStream(BufferedInputStream(socket.getInputStream()))
            out.writeInt(MAGIC); out.writeByte(2); out.writeShort(safe.size); out.write(safe); out.writeLong(size)
            source.use { it.copyTo(out, 64 * 1024) }; out.flush()
            input.readBoolean()
        }
    }.getOrDefault(false)

    private fun broadcastStatus(message: String) {
        sendBroadcast(Intent(ACTION_STATUS).setPackage(packageName).putExtra("message", message))
    }

    private fun notification(text: String): Notification =
        NotificationCompat.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentTitle("Linklane").setContentText(text).setOngoing(true).build()

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(CHANNEL, "Local sharing", NotificationManager.IMPORTANCE_LOW))
        }
    }

    override fun onDestroy() {
        running.set(false)
        runCatching { discovery?.let { nsd.stopServiceDiscovery(it) } }
        runCatching { registration?.let { nsd.unregisterService(it) } }
        runCatching { server?.close() }
        runCatching { multicastLock?.release() }
        pending.values.forEach { it.delete() }
        pending.clear()
        io.shutdownNow()
        super.onDestroy()
    }
}
