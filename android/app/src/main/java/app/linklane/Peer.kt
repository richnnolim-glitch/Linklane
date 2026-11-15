package app.linklane

import java.net.InetAddress

data class Peer(
    val id: String,
    val name: String,
    val device: String,
    val host: InetAddress,
    val port: Int
) {
    val address: String get() = "${host.hostAddress}:$port"
}
