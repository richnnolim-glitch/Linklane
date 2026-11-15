import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

type Peer = { id: string; name: string; device: string; address: string; port: number };
type Incoming = { token: string; name: string; size: number; peer_name: string; kind: string };
declare global {
  interface Window {
    Linklane: {
      getPeers(): string;
      sendText(peerId: string, text: string): void;
      chooseFile(peerId: string): void;
      accept(token: string, name: string): void;
      reject(token: string): void;
    };
    linklanePeer(peer: Peer): void;
    linklaneStatus(message: string): void;
    linklaneIncoming(item: Incoming): void;
    linklaneTextIncoming(item: {peerName:string;text:string}): void;
  }
}

function App() {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("Starting local discovery…");
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const [activity, setActivity] = useState<string[]>([]);
  useEffect(() => {
    try { setPeers(JSON.parse(window.Linklane.getPeers()) as Peer[]); } catch {}
    window.linklanePeer = peer => setPeers(rows => [...rows.filter(row => row.id !== peer.id), peer].sort((a,b)=>a.name.localeCompare(b.name)));
    window.linklaneStatus = setStatus;
    window.linklaneIncoming = item => setIncoming(rows => [...rows, item]);
    window.linklaneTextIncoming = item => setActivity(rows => [item.peerName + ": " + item.text, ...rows].slice(0,30));
    return () => {
      window.linklanePeer = () => {};
      window.linklaneStatus = () => {};
      window.linklaneIncoming = () => {};
      window.linklaneTextIncoming = () => {};
    };
  }, []);
  const panel: React.CSSProperties = { background:"#fffdf8",border:"1px solid #e4ddd0",borderRadius:18,padding:16 };
  const button: React.CSSProperties = { border:0,borderRadius:12,padding:"12px 14px",background:"#9d442c",color:"white",fontWeight:600 };
  return <main style={{fontFamily:"system-ui,sans-serif",background:"#f3efe6",color:"#24231f",minHeight:"100vh",padding:18,boxSizing:"border-box"}}>
    <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
      <div><div style={{fontSize:30,fontWeight:800,letterSpacing:-1}}>Linklane</div><div style={{fontSize:13,color:"#706b61"}}>Direct sharing on your local Wi-Fi</div></div>
      <div style={{fontSize:12,color:"#5c574f",textAlign:"right"}}>LAN only<br/>No cloud relay</div>
    </header>
    <p style={{...panel,fontSize:13,color:"#625d54"}}>{status}</p>
    <section style={{...panel,marginTop:14}}>
      <h2 style={{marginTop:0}}>Nearby devices ({peers.length})</h2>
      {peers.length===0?<p style={{color:"#777",fontSize:14}}>No devices found yet. Keep Linklane open on another device connected to this same private Wi-Fi.</p>:peers.map(peer=><button key={peer.id} onClick={()=>setSelected(peer.id)} style={{display:"block",width:"100%",textAlign:"left",padding:13,marginBottom:8,borderRadius:12,border:selected===peer.id?"2px solid #9d442c":"1px solid #e4ddd0",background:selected===peer.id?"#f7e9df":"#fff",color:"#24231f"}}>
        <strong>{peer.name}</strong><div style={{fontSize:12,color:"#777",fontWeight:400}}>{peer.device} · {peer.address}:{peer.port}</div>
      </button>)}
      <button style={{...button,width:"100%",marginTop:8}} disabled={!selected} onClick={()=>window.Linklane.chooseFile(selected)}>Choose file</button>
    </section>
    <section style={{...panel,marginTop:14}}>
      <h2 style={{marginTop:0}}>Send a message</h2>
      <textarea value={message} onChange={e=>setMessage(e.target.value)} rows={4} placeholder="Write a text message…" style={{width:"100%",boxSizing:"border-box",border:"1px solid #e4ddd0",borderRadius:12,padding:12,font:"inherit"}}/>
      <button style={{...button,width:"100%",marginTop:8}} disabled={!selected||!message.trim()} onClick={()=>{window.Linklane.sendText(selected,message);setActivity(rows=>["You: "+message,...rows].slice(0,30));setMessage("");}}>Send text</button>
    </section>
    {incoming.length>0&&<section style={{...panel,marginTop:14}}><h2 style={{marginTop:0}}>Incoming files</h2>
      {incoming.map(item=><div key={item.token} style={{borderTop:"1px solid #eee5d9",padding:"12px 0"}}>
        <strong>{item.name}</strong><div style={{fontSize:12,color:"#777"}}>{item.peer_name} · {Math.ceil(item.size/1024)} KB</div>
        <div style={{display:"flex",gap:8,marginTop:8}}><button style={button} onClick={()=>{window.Linklane.accept(item.token,item.name);setIncoming(rows=>rows.filter(row=>row.token!==item.token));}}>Save</button><button style={{...button,background:"#777"}} onClick={()=>{window.Linklane.reject(item.token);setIncoming(rows=>rows.filter(row=>row.token!==item.token));}}>Reject</button></div>
      </div>)}
    </section>}
    <section style={{...panel,marginTop:14}}><h2 style={{marginTop:0}}>Recent messages</h2>
      {activity.length===0?<p style={{fontSize:13,color:"#777"}}>Messages will appear here.</p>:activity.map((line,i)=><p key={i} style={{fontSize:14,overflowWrap:"anywhere",borderBottom:"1px solid #eee5d9",paddingBottom:8}}>{line}</p>)}
    </section>
    <p style={{fontSize:12,color:"#777",marginTop:16}}>Guest Wi-Fi and client isolation can block direct device connections.</p>
  </main>;
}
createRoot(document.getElementById("root")!).render(<App />);
