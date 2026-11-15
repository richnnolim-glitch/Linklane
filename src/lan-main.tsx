import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
declare global {
  interface Window {
    __TAURI__: {
      core: { invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T> };
      event: { listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<() => void> };
      dialog: {
        open(options?: Record<string, unknown>): Promise<string | string[] | null>;
        save(options?: Record<string, unknown>): Promise<string | null>;
      };
    };
  }
}
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { open, save } = window.__TAURI__.dialog;

type Peer = { id: string; name: string; device: string; address: string; port: number };
type Incoming = { token: string; peer_id: string; peer_name: string; name: string; size: number; sha256: string; kind: string };

function App() {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("Starting local discovery…");
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const [activity, setActivity] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    const unlisten: Array<() => void> = [];
    void invoke<Peer[]>("list_peers").then(rows => { if (alive) setPeers(rows); }).catch(() => {});
    void listen<Peer>("linklane://peer", event => {
      if (!alive) return;
      setPeers(current => [...current.filter(p => p.id !== event.payload.id), event.payload].sort((a,b) => a.name.localeCompare(b.name)));
    }).then(fn => unlisten.push(fn));
    void listen<string>("linklane://status", event => { if (alive) setStatus(event.payload); }).then(fn => unlisten.push(fn));
    void listen<Incoming>("linklane://incoming", event => { if (alive) setIncoming(current => [...current, event.payload]); }).then(fn => unlisten.push(fn));
    void listen<{peerName:string;text:string}>("linklane://text-incoming", event => {
      if (alive) setActivity(current => [event.payload.peerName + ": " + event.payload.text, ...current].slice(0,30));
    }).then(fn => unlisten.push(fn));
    return () => { alive = false; unlisten.forEach(fn => fn()); };
  }, []);
  async function sendText() {
    if (!selected || !message.trim()) return;
    try {
      await invoke("send_text", { peerId: selected, text: message });
      setActivity(current => ["You: " + message, ...current].slice(0,30));
      setMessage(""); setStatus("Text sent directly over Wi-Fi");
    } catch (error) { setStatus(String(error)); }
  }
  async function sendFile() {
    if (!selected) return;
    const path = await open({ multiple: false, directory: false });
    if (typeof path !== "string") return;
    try { await invoke("send_file", { peerId: selected, path }); setStatus("File sent directly over Wi-Fi"); }
    catch (error) { setStatus(String(error)); }
  }
  async function accept(item: Incoming) {
    const path = await save({ defaultPath: item.name });
    if (!path) return;
    try { await invoke("approve_incoming", { token: item.token, destination: path }); setIncoming(rows => rows.filter(row => row.token !== item.token)); setStatus("File saved"); }
    catch (error) { setStatus(String(error)); }
  }
  async function reject(item: Incoming) {
    try { await invoke("reject_incoming", { token: item.token }); } catch {}
    setIncoming(rows => rows.filter(row => row.token !== item.token));
  }
  const panel: React.CSSProperties = { background: "#fffdf8", border: "1px solid #e4ddd0", borderRadius: 18, padding: 18 };
  const button: React.CSSProperties = { border: 0, borderRadius: 12, padding: "12px 16px", background: "#9d442c", color: "white", cursor: "pointer", fontWeight: 600 };
  return <main style={{fontFamily:"Inter,system-ui,sans-serif",background:"#f3efe6",color:"#24231f",minHeight:"100vh",padding:28,boxSizing:"border-box"}}>
    <div style={{maxWidth:1000,margin:"0 auto"}}>
      <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:20,marginBottom:24}}>
        <div><div style={{fontSize:32,fontWeight:750,letterSpacing:-1}}>Linklane</div><div style={{color:"#706b61"}}>Direct sharing on your local Wi-Fi</div></div>
        <div style={{fontSize:13,color:"#5c574f",textAlign:"right"}}><strong>LAN mode</strong><br/>No account · No cloud relay</div>
      </header>
      <p style={{...panel,marginBottom:18,color:"#625d54"}}>{status}</p>
      <section style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(280px,.8fr)",gap:18}}>
        <div style={panel}><h2 style={{marginTop:0}}>Nearby devices ({peers.length})</h2>
          {peers.length===0?<p style={{color:"#777"}}>No devices found yet. Keep Linklane open on another device connected to this same private Wi-Fi.</p>:peers.map(peer=><button key={peer.id} onClick={()=>setSelected(peer.id)} style={{display:"block",width:"100%",textAlign:"left",padding:14,marginBottom:8,borderRadius:12,border:selected===peer.id?"2px solid #9d442c":"1px solid #e4ddd0",background:selected===peer.id?"#f7e9df":"#fff",color:"#24231f",cursor:"pointer"}}>
            <strong>{peer.name}</strong><div style={{fontSize:12,color:"#777"}}>{peer.device} · {peer.address}:{peer.port}</div>
          </button>)}
          <button style={{...button,marginTop:14}} disabled={!selected} onClick={()=>void sendFile()}>Choose file</button>
        </div>
        <div style={panel}><h2 style={{marginTop:0}}>Send a message</h2>
          <textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Write a text message…" rows={5} style={{width:"100%",boxSizing:"border-box",border:"1px solid #e4ddd0",borderRadius:12,padding:12,font:"inherit",resize:"vertical"}}/>
          <button style={{...button,marginTop:10,width:"100%"}} disabled={!selected||!message.trim()} onClick={()=>void sendText()}>Send text</button>
        </div>
      </section>
      {incoming.length>0&&<section style={{...panel,marginTop:18}}><h2 style={{marginTop:0}}>Incoming files — approval required</h2>
        {incoming.map(item=><div key={item.token} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,borderTop:"1px solid #eee5d9",padding:"12px 0"}}>
          <div><strong>{item.name}</strong><div style={{fontSize:12,color:"#777"}}>{item.peer_name} · {Math.ceil(item.size/1024)} KB · SHA-256 verified</div></div>
          <div style={{display:"flex",gap:8}}><button style={button} onClick={()=>void accept(item)}>Save</button><button style={{...button,background:"#777"}} onClick={()=>void reject(item)}>Reject</button></div>
        </div>)}
      </section>}
      <section style={{...panel,marginTop:18}}><h2 style={{marginTop:0}}>Recent messages</h2>
        {activity.length===0?<p style={{color:"#777"}}>Messages will appear here.</p>:activity.map((line,i)=><p key={i} style={{borderBottom:"1px solid #eee5d9",paddingBottom:8,overflowWrap:"anywhere"}}>{line}</p>)}
      </section>
      <p style={{fontSize:12,color:"#777",marginTop:20}}>A Wi-Fi guest network or router with client isolation may prevent devices from reaching one another.</p>
    </div>
  </main>;
}
createRoot(document.getElementById("root")!).render(<App />);
