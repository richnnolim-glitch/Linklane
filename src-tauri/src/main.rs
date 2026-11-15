#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs::{self, File},
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream, UdpSocket},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

const SERVICE_TYPE: &str = "_linklane._tcp.local.";
const UDP_PORT: u16 = 45821;
const TCP_PORT: u16 = 45822;
const MAGIC: &[u8; 4] = b"LNL2";
const MAX_TEXT: usize = 64 * 1024;
const MAX_FILE: u64 = 1_500_000_000;
const MAX_NAME: usize = 240;

#[derive(Clone, Serialize, Deserialize)]
struct Peer {
    id: String,
    name: String,
    device: String,
    address: String,
    port: u16,
}

#[derive(Clone, Serialize)]
struct Incoming {
    token: String,
    peer_id: String,
    peer_name: String,
    name: String,
    size: u64,
    sha256: String,
    kind: String,
}

#[derive(Default)]
struct LanState {
    device_id: String,
    device_name: String,
    peers: Mutex<HashMap<String, Peer>>,
    pending: Mutex<HashMap<String, PathBuf>>,
    running: Mutex<bool>,
}

fn emit_status(app: &AppHandle, message: &str) {
    let _ = app.emit("linklane://status", message.to_string());
}

fn safe_name(input: &str) -> String {
    let name = Path::new(input).file_name().and_then(|v| v.to_str()).unwrap_or("shared-file");
    let clean: String = name.chars().filter(|c| !c.is_control() && *c != '/' && *c != '\\').take(180).collect();
    if clean.trim().is_empty() { "shared-file".into() } else { clean }
}

fn hash_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 { break; }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn handle_client(mut stream: TcpStream, app: AppHandle, state: Arc<LanState>) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(60)));
    let mut magic = [0u8; 4];
    if stream.read_exact(&mut magic).is_err() || &magic != MAGIC { return; }
    let mut kind = [0u8; 1];
    if stream.read_exact(&mut kind).is_err() { return; }

    if kind[0] == 1 {
        let mut len = [0u8; 4];
        if stream.read_exact(&mut len).is_err() { return; }
        let size = u32::from_be_bytes(len) as usize;
        if !(1..=MAX_TEXT).contains(&size) { return; }
        let mut bytes = vec![0u8; size];
        if stream.read_exact(&mut bytes).is_err() { return; }
        let text = String::from_utf8_lossy(&bytes).to_string();
        let _ = app.emit("linklane://text-incoming", serde_json::json!({
            "peerName": "Nearby device",
            "text": text
        }));
        let _ = stream.write_all(&[1]);
        return;
    }

    if kind[0] != 2 { return; }
    let mut nbuf = [0u8; 2];
    if stream.read_exact(&mut nbuf).is_err() { return; }
    let name_len = u16::from_be_bytes(nbuf) as usize;
    if !(1..=MAX_NAME).contains(&name_len) { return; }
    let mut name_bytes = vec![0u8; name_len];
    if stream.read_exact(&mut name_bytes).is_err() { return; }
    let name = safe_name(&String::from_utf8_lossy(&name_bytes));
    let mut size_buf = [0u8; 8];
    if stream.read_exact(&mut size_buf).is_err() { return; }
    let size = u64::from_be_bytes(size_buf);
    if size > MAX_FILE { return; }
    let mut expected_hash = [0u8; 32];
    if stream.read_exact(&mut expected_hash).is_err() { return; }

    let token = Uuid::new_v4().to_string();
    let temp = std::env::temp_dir().join(format!("linklane-{}.part", token));
    let mut output = match File::create(&temp) { Ok(f) => f, Err(_) => return };
    let mut hasher = Sha256::new();
    let mut remaining = size;
    let mut buffer = [0u8; 64 * 1024];
    while remaining > 0 {
        let want = std::cmp::min(buffer.len() as u64, remaining) as usize;
        let n = match stream.read(&mut buffer[..want]) { Ok(0) | Err(_) => { let _ = fs::remove_file(&temp); return; }, Ok(n) => n };
        if output.write_all(&buffer[..n]).is_err() { let _ = fs::remove_file(&temp); return; }
        hasher.update(&buffer[..n]);
        remaining -= n as u64;
    }
    let actual = hasher.finalize();
    if actual.as_slice() != expected_hash { let _ = fs::remove_file(&temp); return; }
    let digest = format!("{:x}", actual);
    if let Ok(mut pending) = state.pending.lock() { pending.insert(token.clone(), temp); }
    let request = Incoming {
        token, peer_id: "unverified".into(), peer_name: "Nearby device".into(),
        name, size, sha256: digest, kind: "file".into()
    };
    let _ = app.emit("linklane://incoming", request);
    let _ = stream.write_all(&[1]);
}

fn start_tcp(app: AppHandle, state: Arc<LanState>) {
    thread::spawn(move || {
        let listener = match TcpListener::bind(("0.0.0.0", TCP_PORT)) {
            Ok(v) => v,
            Err(e) => { emit_status(&app, &format!("Local listener unavailable: {e}")); return; }
        };
        emit_status(&app, "Local transfer service is running");
        for stream in listener.incoming() {
            if let Ok(socket) = stream {
                let app2 = app.clone();
                let state2 = state.clone();
                thread::spawn(move || handle_client(socket, app2, state2));
            }
        }
    });
}

fn start_discovery(app: AppHandle, state: Arc<LanState>) {
    thread::spawn(move || {
        let mdns = match ServiceDaemon::new() {
            Ok(v) => v,
            Err(e) => { emit_status(&app, &format!("mDNS unavailable: {e}")); return; }
        };
        let host = format!("linklane-{}.local.", &state.device_id[..8]);
        let service = match ServiceInfo::new(
            SERVICE_TYPE, &format!("Linklane-{}", &state.device_id[..8]), &host,
            "0.0.0.0", TCP_PORT, &[("v", "2"), ("id", &state.device_id), ("device", "desktop")]
        ) {
            Ok(v) => v,
            Err(e) => { emit_status(&app, &format!("Could not advertise Linklane: {e}")); return; }
        };
        let _ = mdns.register(service);
        let receiver = match mdns.browse(SERVICE_TYPE) {
            Ok(v) => v,
            Err(e) => { emit_status(&app, &format!("mDNS browse failed: {e}")); return; }
        };
        let udp = UdpSocket::bind(("0.0.0.0", UDP_PORT)).ok();
        if let Some(socket) = &udp { let _ = socket.set_broadcast(true); let _ = socket.set_read_timeout(Some(Duration::from_millis(700))); }
        loop {
            match receiver.recv_timeout(Duration::from_millis(500)) {
                Ok(ServiceEvent::ServiceResolved(info)) => {
                    let id = info.get_property_val_str("id").unwrap_or("").to_string();
                    if id.is_empty() || id == state.device_id { continue; }
                    let address = info.get_addresses().iter().next().map(|a| a.to_string()).unwrap_or_default();
                    if address.is_empty() { continue; }
                    let peer = Peer {
                        id: id.clone(),
                        name: info.get_fullname().split('.').next().unwrap_or("Nearby device").to_string(),
                        device: info.get_property_val_str("device").unwrap_or("other").to_string(),
                        address,
                        port: info.get_port()
                    };
                    if let Ok(mut peers) = state.peers.lock() { peers.insert(id, peer.clone()); }
                    let _ = app.emit("linklane://peer", peer);
                }
                _ => {}
            }
            if let Some(socket) = &udp {
                let request = serde_json::json!({"type":"discover","version":2,"id":state.device_id});
                let bytes = request.to_string();
                let _ = socket.send_to(bytes.as_bytes(), "255.255.255.255:45821");
            }
        }
    });
}

#[tauri::command]
fn list_peers(state: State<'_, Arc<LanState>>) -> Vec<Peer> {
    state.peers.lock().map(|p| p.values().cloned().collect()).unwrap_or_default()
}

#[tauri::command]
fn send_text(peer_id: String, text: String, state: State<'_, Arc<LanState>>) -> Result<(), String> {
    if text.trim().is_empty() || text.len() > MAX_TEXT { return Err("Text is empty or exceeds 64 KiB.".into()); }
    let peer = state.peers.lock().map_err(|e| e.to_string())?.get(&peer_id).cloned().ok_or("Device is not online")?;
    let address: SocketAddr = format!("{}:{}", peer.address, peer.port).parse().map_err(|e: std::net::AddrParseError| e.to_string())?;
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(5)).map_err(|e| e.to_string())?;
    stream.write_all(MAGIC).map_err(|e| e.to_string())?;
    stream.write_all(&[1]).map_err(|e| e.to_string())?;
    stream.write_all(&(text.len() as u32).to_be_bytes()).map_err(|e| e.to_string())?;
    stream.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    let mut ack = [0u8; 1]; stream.read_exact(&mut ack).map_err(|e| e.to_string())?;
    if ack[0] != 1 { return Err("Peer rejected the message.".into()); }
    Ok(())
}

#[tauri::command]
fn approve_incoming(token: String, destination: String, state: State<'_, Arc<LanState>>) -> Result<(), String> {
    let source = state.pending.lock().map_err(|e| e.to_string())?.remove(&token).ok_or("Incoming transfer expired")?;
    let target = PathBuf::from(destination);
    if target.exists() { return Err("A file with that name already exists.".into()); }
    fs::copy(&source, &target).map_err(|e| e.to_string())?;
    fs::remove_file(source).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn reject_incoming(token: String, state: State<'_, Arc<LanState>>) -> Result<(), String> {
    if let Some(path) = state.pending.lock().map_err(|e| e.to_string())?.remove(&token) { let _ = fs::remove_file(path); }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let state = Arc::new(LanState {
                device_id: Uuid::new_v4().to_string(),
                device_name: "Linklane desktop".into(),
                ..Default::default()
            });
            app.manage(state.clone());
            start_tcp(app.handle().clone(), state.clone());
            start_discovery(app.handle().clone(), state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![list_peers, send_text, approve_incoming, reject_incoming])
        .run(tauri::generate_context!())
        .expect("error while running Linklane");
}
