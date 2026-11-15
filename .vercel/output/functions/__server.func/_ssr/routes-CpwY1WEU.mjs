import { o as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { a as Pencil, c as Link2, d as Download, f as Check, i as Smartphone, l as Laptop, n as Wifi, o as Monitor, s as MessageSquare, t as X, u as Hash } from "../_libs/lucide-react.mjs";
import { a as DialogOverlay, i as DialogDescription, n as DialogClose, o as DialogPortal, r as DialogContent, s as DialogTitle, t as Dialog } from "../_libs/@radix-ui/react-dialog+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-CpwY1WEU.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/** Usual gateway addresses for phone, Windows, and Linux hotspots. */
var HOTSPOT_GATEWAYS = [
	"192.168.43.1",
	"192.168.49.1",
	"192.168.119.1",
	"192.168.225.1",
	"192.168.137.1",
	"172.20.10.1",
	"10.42.0.1",
	"10.0.0.1",
	"192.168.1.1",
	"192.168.0.1"
];
var IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
function isPrivateIpv4(ip) {
	if (!IPV4.test(ip)) return false;
	const parts = ip.split(".").map(Number);
	if (parts.some((n) => Number.isNaN(n) || n > 255)) return false;
	const [a, b] = parts;
	if (a === 10) return true;
	if (a === 192 && b === 168) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	return false;
}
function isValidLanIp(ip) {
	if (!isPrivateIpv4(ip)) return false;
	const [a] = ip.split(".").map(Number);
	return a !== 127 && a !== 0;
}
function partsOf(line) {
	const raw = line.trim().replace(/^a=/, "");
	if (!raw.startsWith("candidate:")) return null;
	const parts = raw.split(" ");
	if (parts.length < 8) return null;
	return parts;
}
function candidateType(line) {
	const parts = partsOf(line);
	if (!parts) return null;
	const i = parts.indexOf("typ");
	return i >= 0 ? parts[i + 1] ?? null : null;
}
/** Drop public-IP candidates so a hotspot does not hairpin file setup onto mobile data. */
function filterSdp(sdp, wifiOnly) {
	if (!wifiOnly || !sdp) return sdp;
	const nl = sdp.includes("\r\n") ? "\r\n" : "\n";
	return sdp.split(/\r?\n/).filter((line) => {
		if (!line.trim()) return true;
		const typ = candidateType(line);
		if (!typ) return true;
		return typ === "host" || typ === "prflx";
	}).join(nl);
}
function shouldForwardCandidate(candidate, wifiOnly) {
	const typ = candidateType(candidate);
	if (!typ) return false;
	if (wifiOnly) return typ === "host" || typ === "prflx";
	return typ === "host" || typ === "srflx" || typ === "prflx";
}
/**
* Advertise this same listening port on known hotspot gateways.
* The browser hides the real interface behind a .local name; unicast to the
* numeric gateway still lands if this device is the one sharing Wi-Fi.
* Priority stays below the real host candidate so a normal LAN prefers mDNS.
*/
function expandHostCandidate(candidate, extraIps) {
	const parts = partsOf(candidate);
	if (!parts || candidateType(candidate) !== "host") return [];
	const basePri = Number(parts[3]);
	const out = [];
	const seen = /* @__PURE__ */ new Set();
	extraIps.forEach((ip, index) => {
		if (!isValidLanIp(ip)) return;
		const key = `${ip}:${parts[5]}`;
		if (seen.has(key)) return;
		seen.add(key);
		const copy = parts.slice();
		copy[0] = `candidate:gw${index}${parts[5]}`;
		copy[4] = ip;
		if (Number.isFinite(basePri)) copy[3] = String(Math.max(1, basePri - 4096 - index * 64));
		out.push(copy.join(" "));
	});
	return out;
}
var enc = new TextEncoder();
var dec = new TextDecoder();
function encodeChunk(id, fileIndex, seq, count, bytes) {
	const idBytes = enc.encode(id);
	const out = new Uint8Array(2 + idBytes.length + 2 + 4 + 4 + bytes.length);
	const view = new DataView(out.buffer);
	let o = 0;
	out[o++] = 2;
	out[o++] = idBytes.length;
	out.set(idBytes, o);
	o += idBytes.length;
	view.setUint16(o, fileIndex);
	o += 2;
	view.setUint32(o, seq);
	o += 4;
	view.setUint32(o, count);
	o += 4;
	out.set(bytes, o);
	return out;
}
function decodeChunk(bytes) {
	if (bytes.length < 12 || bytes[0] !== 2) return null;
	const idLen = bytes[1] ?? 0;
	if (idLen < 1 || bytes.length < 2 + idLen + 10) return null;
	const id = dec.decode(bytes.subarray(2, 2 + idLen));
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let o = 2 + idLen;
	const fileIndex = view.getUint16(o);
	o += 2;
	const seq = view.getUint32(o);
	o += 4;
	const count = view.getUint32(o);
	o += 4;
	return {
		id,
		fileIndex,
		seq,
		count,
		bytes: bytes.subarray(o)
	};
}
function encodeFwd(to, from, payload) {
	const toB = enc.encode(to);
	const fromB = enc.encode(from);
	const out = new Uint8Array(2 + toB.length + 1 + fromB.length + payload.length);
	let o = 0;
	out[o++] = 3;
	out[o++] = toB.length;
	out.set(toB, o);
	o += toB.length;
	out[o++] = fromB.length;
	out.set(fromB, o);
	o += fromB.length;
	out.set(payload, o);
	return out;
}
function decodeFwd(bytes) {
	if (bytes.length < 3 || bytes[0] !== 3) return null;
	const toLen = bytes[1] ?? 0;
	if (bytes.length < 2 + toLen + 1) return null;
	const to = dec.decode(bytes.subarray(2, 2 + toLen));
	const fromLen = bytes[2 + toLen] ?? 0;
	const start = 3 + toLen;
	if (bytes.length < start + fromLen) return null;
	return {
		to,
		from: dec.decode(bytes.subarray(start, start + fromLen)),
		payload: bytes.subarray(start + fromLen)
	};
}
function safeFileName(name) {
	return ((name.split(/[/\\]/).pop() ?? "file").replace(/[\u0000-\u001f]/g, "").trim() || "file").slice(0, 180);
}
var CHUNK_BYTES = 49152;
var MAX_NOTE = 4e3;
var MAX_TRANSFER_BYTES = 15e8;
var RETRY_MS = [250, 800];
function toWire(bytes) {
	const copy = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(copy).set(bytes);
	return copy;
}
function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}
function asDevice$1(value) {
	if (value === "android" || value === "windows" || value === "linux" || value === "ios" || value === "mac") return value;
	return "other";
}
var LinkEngine = class {
	selfId;
	name;
	device;
	room = "";
	lanIp = "";
	learned = "";
	wifiOnly = true;
	bondIds = [];
	closed = false;
	cursor = 0;
	timer = null;
	peers = /* @__PURE__ */ new Map();
	roster = /* @__PURE__ */ new Map();
	queues = /* @__PURE__ */ new Map();
	rx = /* @__PURE__ */ new Map();
	waiters = /* @__PURE__ */ new Map();
	outQueue = [];
	pumping = false;
	cleared = false;
	viaFp = null;
	listeners = /* @__PURE__ */ new Set();
	snap = {
		status: "connecting",
		peers: [],
		invite: null,
		incoming: [],
		outgoing: null,
		receiving: null,
		finished: [],
		notes: []
	};
	constructor(opts) {
		this.selfId = opts.id;
		this.name = opts.name;
		this.device = opts.device;
	}
	subscribe(fn) {
		this.listeners.add(fn);
		fn(this.snap);
		return () => this.listeners.delete(fn);
	}
	start() {
		this.loop();
	}
	stop() {
		this.closed = true;
		if (this.timer) clearTimeout(this.timer);
		for (const slot of this.peers.values()) slot.pc.close();
		this.peers.clear();
		fetch("/api/link", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				op: "leave",
				peer: this.selfId
			}),
			keepalive: true
		}).catch(() => {});
	}
	setRoom(room) {
		this.room = room;
	}
	setName(name) {
		this.name = name;
	}
	setBonds(ids) {
		this.bondIds = ids.slice(0, 16);
	}
	setLanIp(ip) {
		if (ip === this.lanIp) return;
		this.lanIp = ip;
		this.restartUnconnected();
	}
	setWifiOnly(on) {
		if (on === this.wifiOnly) return;
		this.wifiOnly = on;
		this.restartAll();
	}
	async createInvite() {
		const res = await this.post({
			op: "invite",
			peer: this.selfId,
			name: this.name,
			device: this.device
		});
		if (!res.ok) throw new Error("Could not create a pair code.");
		const body = await res.json();
		if (!body.code) throw new Error("Could not create a pair code.");
		return body.code;
	}
	async joinInvite(code) {
		const res = await this.post({
			op: "join",
			peer: this.selfId,
			name: this.name,
			device: this.device,
			code
		});
		const body = await res.json();
		if (!res.ok || !body.host) throw new Error(body.error || "Could not join that code.");
		return body.host;
	}
	async sendText(peerId, text) {
		const note = text.trim().slice(0, MAX_NOTE);
		if (!note) return;
		if (!await this.waitRoute(peerId, 8e3)) throw new Error("That device is not on the Wi-Fi link yet.");
		const id = crypto.randomUUID();
		this.deliver(peerId, {
			t: "text",
			id,
			text: note
		});
		this.pushNote({
			id,
			peerName: this.nameOf(peerId),
			text: note,
			incoming: false
		});
	}
	enqueueFiles(peerId, files) {
		const list = [...files].slice(0, 12).filter((f) => f.size <= MAX_TRANSFER_BYTES);
		if (!list.length) return;
		this.outQueue.push({
			peerId,
			files: list
		});
		this.pump();
	}
	respond(id, accept) {
		const rx = this.rx.get(id);
		if (!rx) return;
		this.snap.incoming = this.snap.incoming.filter((item) => item.id !== id);
		if (!accept) {
			this.deliver(rx.fromId, {
				t: "decline",
				id
			});
			this.rx.delete(id);
			this.emit();
			return;
		}
		this.deliver(rx.fromId, {
			t: "accept",
			id
		});
		this.emit();
	}
	async pump() {
		if (this.pumping) return;
		this.pumping = true;
		while (this.outQueue.length && !this.closed) {
			const job = this.outQueue.shift();
			await this.runSend(job.peerId, job.files);
		}
		this.pumping = false;
	}
	async runSend(peerId, files) {
		const id = crypto.randomUUID();
		const metas = files.map((f) => ({
			name: safeFileName(f.name),
			size: f.size,
			mime: f.type || "application/octet-stream"
		}));
		const outgoing = {
			id,
			peerId,
			peerName: this.nameOf(peerId),
			files: metas,
			fileIndex: 0,
			seq: 0,
			count: 1,
			status: "waiting"
		};
		this.snap.outgoing = outgoing;
		this.emit();
		if (!await this.waitRoute(peerId, 12e3) || this.closed) {
			outgoing.status = "failed";
			outgoing.detail = "No Wi-Fi path yet. Open Linklane on the hotspot, or enter its address.";
			this.emit();
			return;
		}
		const accepted = new Promise((resolve) => {
			this.waiters.set(id, { resolve });
			setTimeout(() => resolve(false), 12e4);
		});
		this.deliver(peerId, {
			t: "want",
			id,
			files: metas
		});
		const ok = await accepted;
		this.waiters.delete(id);
		if (!ok || this.closed) {
			if (this.snap.outgoing?.id === id && this.snap.outgoing.status === "waiting") {
				outgoing.status = "declined";
				this.emit();
			}
			return;
		}
		outgoing.status = "sending";
		this.emit();
		try {
			for (let fi = 0; fi < files.length; fi += 1) {
				const file = files[fi];
				const count = Math.max(1, Math.ceil(file.size / CHUNK_BYTES));
				outgoing.fileIndex = fi;
				outgoing.count = file.size === 0 ? 1 : count;
				outgoing.seq = 0;
				this.emit();
				if (file.size === 0) continue;
				let seq = 0;
				for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
					const slice = new Uint8Array(await file.slice(offset, offset + CHUNK_BYTES).arrayBuffer());
					const packet = encodeChunk(id, fi, seq, count, slice);
					await this.sendBinary(peerId, packet);
					seq += 1;
					outgoing.seq = seq;
					if (seq % 2 === 0) this.emit();
				}
			}
			this.deliver(peerId, {
				t: "complete",
				id
			});
			outgoing.status = "done";
			this.emit();
		} catch (error) {
			outgoing.status = "failed";
			outgoing.detail = error instanceof Error ? error.message : "Transfer stopped.";
			this.deliver(peerId, {
				t: "cancel",
				id
			});
			this.emit();
		}
	}
	async loop() {
		if (this.closed) return;
		try {
			if (!this.cleared) {
				this.cleared = true;
				await this.post({
					op: "clear",
					peer: this.selfId
				});
			}
			await this.pollOnce();
			if (this.closed) return;
			this.snap.status = "online";
		} catch {
			if (this.closed) return;
			this.snap.status = "offline";
			this.emit();
		}
		this.retryDue();
		const delay = this.anyLinking() ? 450 : 1500;
		this.timer = setTimeout(() => void this.loop(), delay);
	}
	async pollOnce() {
		const params = new URLSearchParams({
			peer: this.selfId,
			name: this.name,
			device: this.device,
			room: this.room,
			bonds: this.bondIds.join(","),
			since: String(this.cursor)
		});
		const res = await fetch(`/api/link?${params}`);
		if (!res.ok) throw new Error(String(res.status));
		const body = await res.json();
		if (this.closed) return;
		this.roster = new Map(body.peers.map((p) => [p.id, p]));
		this.snap.invite = body.invite;
		this.reconcile(body.peers);
		const alive = new Set(body.peers.map((p) => p.id));
		for (const sig of body.signals) {
			this.cursor = Math.max(this.cursor, sig.id);
			await this.onSignal(sig.from, sig.kind, sig.payload, alive);
			if (this.closed) return;
		}
		this.emit();
	}
	reconcile(peers) {
		const alive = new Set(peers.map((p) => p.id));
		for (const peer of peers) {
			const slot = this.peers.get(peer.id);
			if (slot) {
				slot.name = peer.name;
				continue;
			}
			this.connect(peer.id, peer.name, this.selfId > peer.id);
		}
		for (const [id, slot] of this.peers) if (!alive.has(id)) {
			slot.pc.close();
			this.peers.delete(id);
		}
	}
	connect(peerId, name, initiator) {
		if (this.closed || typeof RTCPeerConnection === "undefined") return null;
		const pc = new RTCPeerConnection({ iceServers: this.wifiOnly ? [] : [{ urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }] });
		const slot = {
			id: peerId,
			name,
			pc,
			makingOffer: false,
			ignoreOffer: false,
			pending: [],
			remoteVia: /* @__PURE__ */ new Set(),
			terminal: false,
			failedAt: 0,
			synthLeft: 18,
			path: null,
			toldIp: false,
			recreated: false
		};
		this.peers.set(peerId, slot);
		pc.onicecandidate = (event) => {
			this.onLocalIce(slot, event.candidate);
		};
		pc.onconnectionstatechange = () => {
			if (pc.connectionState === "connected") slot.terminal = false;
			if (pc.connectionState === "failed") {
				slot.terminal = true;
				slot.failedAt = Date.now();
			}
			this.announce();
			this.emit();
		};
		pc.onnegotiationneeded = () => {
			this.negotiate(slot);
		};
		pc.ondatachannel = (event) => this.bindDc(slot, event.channel);
		if (initiator) this.bindDc(slot, pc.createDataChannel("files", { ordered: true }));
		return slot;
	}
	bindDc(slot, channel) {
		slot.dc = channel;
		channel.binaryType = "arraybuffer";
		channel.onopen = () => {
			slot.terminal = false;
			this.announce();
			this.inspect(slot);
			this.emit();
		};
		channel.onclose = () => {
			this.announce();
			this.emit();
		};
		channel.onmessage = (event) => {
			if (typeof event.data === "string") {
				try {
					this.onEnvelope(JSON.parse(event.data), slot.id);
				} catch {}
				return;
			}
			const bytes = event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : /* @__PURE__ */ new Uint8Array();
			this.onBinary(slot.id, bytes);
		};
	}
	async negotiate(slot) {
		if (this.closed) return;
		try {
			slot.makingOffer = true;
			await slot.pc.setLocalDescription(await slot.pc.createOffer());
			if (this.closed || !slot.pc.localDescription) return;
			await this.sendSignal(slot.id, "offer", slot.pc.localDescription.toJSON());
		} catch {} finally {
			slot.makingOffer = false;
		}
	}
	async onLocalIce(slot, candidate) {
		if (!candidate) {
			await this.sendSignal(slot.id, "ice", { candidate: "" });
			return;
		}
		const line = candidate.candidate;
		if (shouldForwardCandidate(line, this.wifiOnly)) await this.sendSignal(slot.id, "ice", {
			candidate: line,
			sdpMid: candidate.sdpMid,
			sdpMLineIndex: candidate.sdpMLineIndex
		});
		if (slot.synthLeft <= 0 || candidate.type !== "host") return;
		const extras = expandHostCandidate(line, this.extraIps()).slice(0, slot.synthLeft);
		slot.synthLeft -= extras.length;
		for (const synthetic of extras) await this.sendSignal(slot.id, "ice", {
			candidate: synthetic,
			sdpMid: candidate.sdpMid,
			sdpMLineIndex: candidate.sdpMLineIndex
		});
	}
	extraIps() {
		const ips = [];
		if (isValidLanIp(this.lanIp)) ips.push(this.lanIp);
		if (isValidLanIp(this.learned) && this.learned !== this.lanIp) ips.push(this.learned);
		for (const gateway of HOTSPOT_GATEWAYS) if (!ips.includes(gateway)) ips.push(gateway);
		return ips;
	}
	async onSignal(from, kind, payload, alive) {
		let slot = this.peers.get(from);
		if (!slot) {
			if (!alive.has(from)) return;
			slot = this.connect(from, this.nameOf(from), false) ?? void 0;
			if (!slot) return;
		}
		const polite = this.selfId < from;
		try {
			if (kind === "offer" || kind === "answer") {
				const description = payload;
				const filtered = {
					type: description.type,
					sdp: filterSdp(description.sdp || "", this.wifiOnly)
				};
				const collision = kind === "offer" && (slot.makingOffer || slot.pc.signalingState !== "stable");
				slot.ignoreOffer = !polite && collision;
				if (slot.ignoreOffer) return;
				try {
					await slot.pc.setRemoteDescription(filtered);
				} catch {
					if (kind !== "offer" || slot.recreated) return;
					const name = slot.name;
					slot.pc.close();
					this.peers.delete(from);
					const fresh = this.connect(from, name, false);
					if (!fresh) return;
					fresh.recreated = true;
					slot = fresh;
					await slot.pc.setRemoteDescription(filtered);
				}
				if (this.closed) return;
				await this.flush(slot);
				if (kind === "offer") {
					await slot.pc.setLocalDescription(await slot.pc.createAnswer());
					if (!slot.pc.localDescription || this.closed) return;
					await this.sendSignal(from, "answer", slot.pc.localDescription.toJSON());
				}
				return;
			}
			const ice = payload;
			if (!ice || !ice.candidate) {
				try {
					await slot.pc.addIceCandidate(null);
				} catch {}
				return;
			}
			if (!shouldForwardCandidate(ice.candidate, this.wifiOnly)) return;
			if (!slot.pc.remoteDescription) {
				slot.pending.push(ice);
				return;
			}
			try {
				await slot.pc.addIceCandidate(ice);
			} catch {}
		} catch {}
	}
	async flush(slot) {
		while (slot.pending.length) {
			const candidate = slot.pending.shift();
			try {
				await slot.pc.addIceCandidate(candidate);
			} catch {}
		}
	}
	sendSignal(to, kind, payload) {
		const next = (this.queues.get(to) ?? Promise.resolve()).then(() => this.postSignal(to, kind, payload));
		this.queues.set(to, next.catch(() => {}));
		return next;
	}
	async postSignal(to, kind, payload) {
		for (let attempt = 0;; attempt += 1) {
			if (this.closed) return;
			try {
				const res = await this.post({
					op: "signal",
					from: this.selfId,
					to,
					kind,
					payload
				});
				if (res.ok) return;
				throw new Error(String(res.status));
			} catch {
				if (attempt >= RETRY_MS.length) return;
				await sleep(RETRY_MS[attempt] ?? 400);
			}
		}
	}
	post(body) {
		return fetch("/api/link", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body)
		});
	}
	async inspect(slot) {
		for (let i = 0; i < 8; i += 1) {
			await sleep(350);
			if (this.closed || slot.dc?.readyState !== "open") return;
			const found = await this.readPair(slot.pc);
			if (!found) continue;
			slot.path = found.typ === "srflx" || found.typ === "relay" ? "public" : "wifi";
			this.emit();
			if (found.remoteIp && !slot.toldIp) {
				slot.toldIp = true;
				this.sendDirect(slot, {
					t: "your-ip",
					ip: found.remoteIp
				});
			}
			return;
		}
	}
	async readPair(pc) {
		const stats = await pc.getStats();
		const pair = [...stats.values()].find((row) => row.type === "candidate-pair" && row.state === "succeeded" && (row.nominated || row.selected));
		if (!pair) return null;
		const remote = pair.remoteCandidateId ? stats.get(pair.remoteCandidateId) : void 0;
		const local = pair.localCandidateId ? stats.get(pair.localCandidateId) : void 0;
		const address = remote?.address || "";
		return {
			typ: local?.candidateType || remote?.candidateType || null,
			remoteIp: isPrivateIpv4(address) ? address : null
		};
	}
	announce() {
		const via = this.directIds();
		const fp = via.slice().sort().join(",");
		if (fp === this.viaFp) return;
		this.viaFp = fp;
		const msg = {
			t: "hello",
			via
		};
		for (const slot of this.peers.values()) this.sendDirect(slot, msg);
		this.emit();
	}
	directIds() {
		const ids = [];
		for (const [id, slot] of this.peers) if (slot.dc?.readyState === "open") ids.push(id);
		return ids;
	}
	sendDirect(slot, msg) {
		if (slot.dc?.readyState === "open") slot.dc.send(JSON.stringify(msg));
	}
	route(target) {
		const direct = this.peers.get(target);
		if (direct?.dc?.readyState === "open") return {
			dc: direct.dc,
			wrap: false
		};
		for (const slot of this.peers.values()) {
			if (slot.dc?.readyState !== "open") continue;
			if (slot.remoteVia.has(target)) return {
				dc: slot.dc,
				wrap: true
			};
		}
		return null;
	}
	async waitRoute(peerId, ms) {
		const start = Date.now();
		while (Date.now() - start < ms) {
			if (this.closed) return false;
			if (this.route(peerId)) return true;
			await sleep(250);
		}
		return !!this.route(peerId);
	}
	deliver(target, msg) {
		const path = this.route(target);
		if (!path) return false;
		const envelope = path.wrap ? {
			t: "fwd",
			to: target,
			from: this.selfId,
			m: msg
		} : msg;
		path.dc.send(JSON.stringify(envelope));
		return true;
	}
	async sendBinary(target, packet) {
		const path = this.route(target);
		if (!path) throw new Error("Wi-Fi link dropped.");
		const bytes = path.wrap ? encodeFwd(target, this.selfId, packet) : packet;
		await this.drain(path.dc);
		path.dc.send(toWire(bytes));
	}
	async drain(dc) {
		if (dc.readyState !== "open") throw new Error("Wi-Fi link dropped.");
		if (dc.bufferedAmount < 524288) return;
		await new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				cleanup();
				reject(/* @__PURE__ */ new Error("The link stalled."));
			}, 2e4);
			const onLow = () => {
				cleanup();
				resolve();
			};
			const onClose = () => {
				cleanup();
				reject(/* @__PURE__ */ new Error("Wi-Fi link dropped."));
			};
			const cleanup = () => {
				clearTimeout(timer);
				dc.removeEventListener("bufferedamountlow", onLow);
				dc.removeEventListener("close", onClose);
			};
			dc.bufferedAmountLowThreshold = 262144;
			dc.addEventListener("bufferedamountlow", onLow);
			dc.addEventListener("close", onClose);
		});
	}
	onBinary(viaId, bytes) {
		if (bytes[0] === 3) {
			const fwd = decodeFwd(bytes);
			if (!fwd) return;
			if (fwd.to === this.selfId) {
				this.takeChunk(fwd.from, fwd.payload);
				return;
			}
			const dest = this.peers.get(fwd.to);
			if (dest?.dc?.readyState === "open") dest.dc.send(toWire(bytes));
			return;
		}
		this.takeChunk(viaId, bytes);
	}
	takeChunk(fromId, bytes) {
		const chunk = decodeChunk(bytes);
		if (!chunk) return;
		const rx = this.rx.get(chunk.id);
		if (!rx || rx.bytes > 15e8) return;
		if (!rx.parts[chunk.fileIndex]) return;
		if (!rx.parts[chunk.fileIndex].has(chunk.seq)) {
			rx.parts[chunk.fileIndex].set(chunk.seq, chunk.bytes);
			rx.got[chunk.fileIndex] = (rx.got[chunk.fileIndex] ?? 0) + 1;
			rx.bytes += chunk.bytes.byteLength;
		}
		rx.counts[chunk.fileIndex] = chunk.count;
		const outgoingLike = {
			id: chunk.id,
			peerId: fromId,
			peerName: this.nameOf(fromId),
			files: rx.files,
			fileIndex: chunk.fileIndex,
			seq: rx.got[chunk.fileIndex] ?? 0,
			count: chunk.count,
			status: "sending"
		};
		this.snap.receiving = outgoingLike;
		this.emit();
	}
	onEnvelope(msg, viaId) {
		if (msg.t === "fwd") {
			if (msg.to === this.selfId) this.onControl(msg.m, msg.from);
			else {
				const dest = this.peers.get(msg.to);
				if (dest?.dc?.readyState === "open") dest.dc.send(JSON.stringify(msg));
			}
			return;
		}
		this.onControl(msg, viaId);
	}
	onControl(msg, fromId) {
		if (msg.t === "hello") {
			const slot = this.peers.get(fromId);
			if (!slot) return;
			slot.remoteVia = new Set(msg.via.filter((id) => id !== this.selfId && id !== fromId));
			this.emit();
			return;
		}
		if (msg.t === "your-ip") {
			if (!isValidLanIp(msg.ip) || this.lanIp) return;
			if (this.learned === msg.ip) return;
			this.learned = msg.ip;
			this.restartUnconnected();
			return;
		}
		if (msg.t === "want") {
			const files = (msg.files || []).slice(0, 12).map((file) => ({
				name: safeFileName(String(file.name || "file")),
				size: Number(file.size) || 0,
				mime: String(file.mime || "application/octet-stream").slice(0, 120)
			}));
			const rx = {
				id: msg.id,
				fromId,
				files,
				parts: files.map(() => /* @__PURE__ */ new Map()),
				counts: files.map(() => 0),
				got: files.map(() => 0),
				bytes: 0
			};
			this.rx.set(msg.id, rx);
			this.snap.incoming = [...this.snap.incoming, {
				id: msg.id,
				fromId,
				fromName: this.nameOf(fromId),
				files
			}];
			this.emit();
			return;
		}
		if (msg.t === "accept" || msg.t === "decline") {
			this.waiters.get(msg.id)?.resolve(msg.t === "accept");
			if (msg.t === "decline" && this.snap.outgoing?.id === msg.id) {
				this.snap.outgoing = {
					...this.snap.outgoing,
					status: "declined"
				};
				this.emit();
			}
			return;
		}
		if (msg.t === "cancel") {
			this.rx.delete(msg.id);
			this.snap.incoming = this.snap.incoming.filter((item) => item.id !== msg.id);
			if (this.snap.outgoing?.id === msg.id) this.snap.outgoing = {
				...this.snap.outgoing,
				status: "failed",
				detail: "The other device cancelled."
			};
			this.emit();
			return;
		}
		if (msg.t === "complete") {
			this.finishRx(msg.id);
			return;
		}
		if (msg.t === "text") {
			const text = msg.text.slice(0, MAX_NOTE);
			if (!text) return;
			this.pushNote({
				id: msg.id,
				peerName: this.nameOf(fromId),
				text,
				incoming: true
			});
		}
	}
	finishRx(id) {
		const rx = this.rx.get(id);
		if (!rx) return;
		const files = rx.files.map((file, index) => {
			const parts = rx.parts[index] ?? /* @__PURE__ */ new Map();
			const count = file.size === 0 ? 0 : rx.counts[index] || 0;
			const ordered = [];
			for (let seq = 0; seq < count; seq += 1) {
				const part = parts.get(seq);
				if (part) ordered.push(part);
			}
			const blobParts = ordered;
			return {
				name: file.name,
				blob: new Blob(blobParts, { type: file.mime })
			};
		});
		this.rx.delete(id);
		this.snap.finished = [{
			id,
			peerName: this.nameOf(rx.fromId),
			files
		}, ...this.snap.finished].slice(0, 8);
		if (this.snap.receiving?.id === id) this.snap.receiving = null;
		this.snap.incoming = this.snap.incoming.filter((item) => item.id !== id);
		this.emit();
	}
	pushNote(note) {
		this.snap.notes = [note, ...this.snap.notes].slice(0, 8);
		this.emit();
	}
	retryDue() {
		const now = Date.now();
		for (const [id, slot] of [...this.peers]) {
			if (!slot.terminal || now - slot.failedAt < 1e4) continue;
			if (!this.roster.has(id)) continue;
			const name = slot.name;
			slot.pc.close();
			this.peers.delete(id);
			this.connect(id, name, this.selfId > id);
		}
	}
	restartUnconnected() {
		for (const [id, slot] of [...this.peers]) {
			if (slot.dc?.readyState === "open") continue;
			const name = slot.name;
			slot.pc.close();
			this.peers.delete(id);
			if (this.roster.has(id)) this.connect(id, name, this.selfId > id);
		}
		this.viaFp = null;
		this.announce();
	}
	restartAll() {
		for (const slot of this.peers.values()) slot.pc.close();
		this.peers.clear();
		this.viaFp = null;
		this.reconcile([...this.roster.values()]);
		this.emit();
	}
	anyLinking() {
		for (const slot of this.peers.values()) {
			if (slot.terminal) continue;
			if (slot.dc?.readyState !== "open") return true;
		}
		return false;
	}
	nameOf(id) {
		return this.roster.get(id)?.name || this.peers.get(id)?.name || "Device";
	}
	emit() {
		this.snap.peers = this.peerViews();
		const next = {
			...this.snap,
			peers: this.snap.peers.slice()
		};
		for (const fn of this.listeners) fn(next);
	}
	peerViews() {
		const views = [];
		for (const peer of this.roster.values()) views.push(this.viewOf(peer));
		return views.sort((a, b) => a.name.localeCompare(b.name));
	}
	viewOf(peer) {
		const slot = this.peers.get(peer.id);
		const via = peer.paired ? "paired" : peer.sameRoom && !peer.sameNet ? "room" : "wifi";
		const open = slot?.dc?.readyState === "open";
		let link = "linking";
		let relayName;
		let pathLabel = "Linking over Wi-Fi…";
		if (open) {
			if (slot?.path === "public") {
				link = "public";
				pathLabel = "Public IP — may use mobile data";
			} else {
				link = "wifi";
				pathLabel = "On Wi-Fi";
			}
		} else {
			const relay = this.findRelay(peer.id);
			if (relay) {
				link = "relay";
				relayName = this.nameOf(relay);
				pathLabel = `Through ${relayName}`;
			} else if (slot?.terminal) {
				link = "failed";
				pathLabel = "No Wi-Fi path yet";
			}
		}
		return {
			id: peer.id,
			name: peer.name,
			device: asDevice$1(peer.device),
			via,
			link,
			relayName,
			pathLabel
		};
	}
	findRelay(target) {
		for (const [id, slot] of this.peers) {
			if (id === target) continue;
			if (slot.dc?.readyState !== "open") continue;
			if (slot.remoteVia.has(target)) return id;
		}
		return null;
	}
};
var ID_KEY = "linklane-id";
var NAME_KEY = "linklane-name";
var BONDS_KEY = "linklane-bonds";
var LAN_KEY = "linklane-lan";
var WIFI_KEY = "linklane-wifi";
var ROOM_KEY = "linklane-room";
var ADJ = [
	"Copper",
	"Quiet",
	"Amber",
	"Brisk",
	"North",
	"Keen",
	"Rust",
	"Clear",
	"Low",
	"Even",
	"Warm",
	"Still"
];
var NOUN = [
	"Lantern",
	"Modem",
	"Harbor",
	"Radio",
	"Sparrow",
	"Compass",
	"Ferry",
	"Signal",
	"Pocket",
	"Bridge",
	"Switch",
	"Beacon"
];
var ROOM_ALPHABET = "abcdefghjkmnpqrstuvwxyz";
function randomName() {
	return `${ADJ[Math.floor(Math.random() * ADJ.length)] ?? "Quiet"} ${NOUN[Math.floor(Math.random() * NOUN.length)] ?? "Lantern"}`;
}
function randomRoom() {
	let out = "";
	for (let i = 0; i < 5; i += 1) out += ROOM_ALPHABET[Math.floor(Math.random() * 23)];
	return out;
}
function validRoom(code) {
	return /^[a-z]{5}$/.test(code);
}
function detectDevice(ua = "") {
	if (/Android/i.test(ua)) return "android";
	if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
	if (/Windows/i.test(ua)) return "windows";
	if (/Macintosh|Mac OS X/i.test(ua)) return "mac";
	if (/Linux/i.test(ua)) return "linux";
	return "other";
}
function deviceLabel(device) {
	switch (device) {
		case "android": return "Android";
		case "windows": return "Windows";
		case "linux": return "Linux";
		case "ios": return "iPhone";
		case "mac": return "Mac";
		default: return "Device";
	}
}
function readBonds() {
	try {
		const raw = JSON.parse(localStorage.getItem(BONDS_KEY) || "[]");
		if (!Array.isArray(raw)) return [];
		return raw.filter((row) => !!row && typeof row === "object" && typeof row.id === "string" && typeof row.name === "string").slice(0, 16).map((row) => ({
			id: row.id,
			name: row.name.slice(0, 40),
			device: isDevice(row.device) ? row.device : "other"
		}));
	} catch {
		return [];
	}
}
function isDevice(value) {
	return value === "android" || value === "windows" || value === "linux" || value === "ios" || value === "mac" || value === "other";
}
function loadBoot() {
	let id = localStorage.getItem(ID_KEY);
	if (!id || !/^[a-zA-Z0-9-]{8,64}$/.test(id)) {
		id = crypto.randomUUID();
		localStorage.setItem(ID_KEY, id);
	}
	let name = localStorage.getItem(NAME_KEY)?.trim() ?? "";
	if (!name) {
		name = randomName();
		localStorage.setItem(NAME_KEY, name);
	}
	const url = new URL(window.location.href);
	const fromUrl = (url.searchParams.get("room") || "").toLowerCase();
	const stored = (sessionStorage.getItem(ROOM_KEY) || "").toLowerCase();
	const room = validRoom(fromUrl) ? fromUrl : validRoom(stored) ? stored : "";
	if (room) sessionStorage.setItem(ROOM_KEY, room);
	return {
		id,
		name: name.slice(0, 40),
		device: detectDevice(navigator.userAgent),
		room,
		pair: (url.searchParams.get("pair") || "").replace(/\D/g, "").slice(0, 6),
		lan: localStorage.getItem(LAN_KEY) || "",
		wifiOnly: localStorage.getItem(WIFI_KEY) !== "0",
		bonds: readBonds()
	};
}
function saveName(name) {
	localStorage.setItem(NAME_KEY, name.slice(0, 40));
}
function saveLan(ip) {
	if (ip) localStorage.setItem(LAN_KEY, ip);
	else localStorage.removeItem(LAN_KEY);
}
function saveWifiOnly(on) {
	localStorage.setItem(WIFI_KEY, on ? "1" : "0");
}
function saveRoom(room) {
	if (room) sessionStorage.setItem(ROOM_KEY, room);
	else sessionStorage.removeItem(ROOM_KEY);
}
function saveBonds(bonds) {
	localStorage.setItem(BONDS_KEY, JSON.stringify(bonds.slice(0, 16)));
}
function formatBytes(size) {
	if (!Number.isFinite(size) || size < 0) return "—";
	if (size < 1024) return `${size} B`;
	if (size < 1048576) return `${Math.round(size / 102.4) / 10} KB`;
	if (size < 1073741824) return `${Math.round(size / 104857.6) / 10} MB`;
	return `${Math.round(size / 107374182.4) / 10} GB`;
}
var emptySnap = {
	status: "connecting",
	peers: [],
	invite: null,
	incoming: [],
	outgoing: null,
	receiving: null,
	finished: [],
	notes: []
};
var PRESETS = [
	{
		label: "Android hotspot",
		ip: "192.168.43.1"
	},
	{
		label: "Windows hotspot",
		ip: "192.168.137.1"
	},
	{
		label: "Linux hotspot",
		ip: "10.42.0.1"
	},
	{
		label: "iPhone hotspot",
		ip: "172.20.10.1"
	}
];
function LinklaneApp() {
	const [boot, setBoot] = (0, import_react.useState)(null);
	const [snap, setSnap] = (0, import_react.useState)(emptySnap);
	const [bonds, setBonds] = (0, import_react.useState)([]);
	const [room, setRoom] = (0, import_react.useState)("");
	const [lan, setLan] = (0, import_react.useState)("");
	const [lanDraft, setLanDraft] = (0, import_react.useState)("");
	const [wifiOnly, setWifiOnly] = (0, import_react.useState)(true);
	const [nameDraft, setNameDraft] = (0, import_react.useState)("");
	const [editingName, setEditingName] = (0, import_react.useState)(false);
	const [notice, setNotice] = (0, import_react.useState)("");
	const [pairOpen, setPairOpen] = (0, import_react.useState)(false);
	const [roomOpen, setRoomOpen] = (0, import_react.useState)(false);
	const [hotOpen, setHotOpen] = (0, import_react.useState)(false);
	const [installOpen, setInstallOpen] = (0, import_react.useState)(false);
	const [noteOpen, setNoteOpen] = (0, import_react.useState)(false);
	const [notePeer, setNotePeer] = (0, import_react.useState)(null);
	const [noteText, setNoteText] = (0, import_react.useState)("");
	const [pairCode, setPairCode] = (0, import_react.useState)("");
	const [joinCode, setJoinCode] = (0, import_react.useState)("");
	const [pairError, setPairError] = (0, import_react.useState)("");
	const [dropFiles, setDropFiles] = (0, import_react.useState)(null);
	const [dragging, setDragging] = (0, import_react.useState)(false);
	const engineRef = (0, import_react.useRef)(null);
	const fileRef = (0, import_react.useRef)(null);
	const targetRef = (0, import_react.useRef)(null);
	const autoPair = (0, import_react.useRef)(false);
	const seenFiles = (0, import_react.useRef)(/* @__PURE__ */ new Set());
	(0, import_react.useEffect)(() => {
		const next = loadBoot();
		setBoot(next);
		setBonds(next.bonds);
		setRoom(next.room);
		setLan(next.lan);
		setLanDraft(next.lan);
		setWifiOnly(next.wifiOnly);
		setNameDraft(next.name);
		if (next.pair.length === 6) setPairOpen(true);
	}, []);
	(0, import_react.useEffect)(() => {
		if (!boot) return;
		const engine = new LinkEngine({
			id: boot.id,
			name: boot.name,
			device: boot.device
		});
		engine.room = boot.room;
		engine.lanIp = boot.lan;
		engine.wifiOnly = boot.wifiOnly;
		engine.setBonds(boot.bonds.map((bond) => bond.id));
		engineRef.current = engine;
		const unsub = engine.subscribe(setSnap);
		engine.start();
		return () => {
			unsub();
			engine.stop();
			if (engineRef.current === engine) engineRef.current = null;
		};
	}, [boot]);
	(0, import_react.useEffect)(() => {
		const other = snap.invite?.other;
		if (!other || !boot) return;
		setBonds((prev) => {
			if (prev.some((bond) => bond.id === other.id)) return prev;
			const next = [...prev, {
				id: other.id,
				name: other.name,
				device: asDevice(other.device)
			}].slice(-16);
			saveBonds(next);
			engineRef.current?.setBonds(next.map((bond) => bond.id));
			return next;
		});
	}, [snap.invite, boot]);
	(0, import_react.useEffect)(() => {
		if (!boot || autoPair.current || boot.pair.length !== 6) return;
		const engine = engineRef.current;
		if (!engine) return;
		autoPair.current = true;
		setJoinCode(boot.pair);
		engine.joinInvite(boot.pair).then((host) => {
			setBonds((prev) => {
				if (prev.some((item) => item.id === host.id)) return prev;
				const next = [...prev, {
					id: host.id,
					name: host.name,
					device: asDevice(host.device)
				}].slice(-16);
				saveBonds(next);
				engine.setBonds(next.map((item) => item.id));
				return next;
			});
			setNotice(`Paired with ${host.name}.`);
		}).catch((error) => {
			setPairError(error instanceof Error ? error.message : "Could not join that code.");
		});
	}, [boot, snap.status]);
	(0, import_react.useEffect)(() => {
		for (const item of snap.finished) {
			if (seenFiles.current.has(item.id)) continue;
			seenFiles.current.add(item.id);
			item.files.forEach((file, index) => {
				window.setTimeout(() => saveBlob(file.blob, file.name), index * 350);
			});
		}
	}, [snap.finished]);
	(0, import_react.useEffect)(() => {
		if (!(snap.outgoing?.status === "sending" || snap.outgoing?.status === "waiting" || !!snap.receiving) || !("wakeLock" in navigator)) return;
		let released = false;
		let lock = null;
		navigator.wakeLock.request("screen").then((sent) => {
			if (released) sent.release();
			else lock = sent;
		}).catch(() => {});
		return () => {
			released = true;
			lock?.release();
		};
	}, [snap.outgoing?.status, snap.receiving]);
	const peers = (0, import_react.useMemo)(() => {
		const online = new Set(snap.peers.map((peer) => peer.id));
		const offline = bonds.filter((bond) => !online.has(bond.id)).map((bond) => ({
			id: bond.id,
			name: bond.name,
			device: bond.device,
			via: "paired",
			link: "offline",
			pathLabel: "Paired · not here right now"
		}));
		return [...snap.peers, ...offline];
	}, [snap.peers, bonds]);
	const stuck = snap.peers.some((peer) => peer.link === "failed");
	const you = boot ? nameDraft || boot.name : "This device";
	function remember(bond) {
		setBonds((prev) => {
			if (prev.some((item) => item.id === bond.id)) return prev;
			const next = [...prev, bond].slice(-16);
			saveBonds(next);
			engineRef.current?.setBonds(next.map((item) => item.id));
			return next;
		});
	}
	function pickFiles(peerId) {
		const peer = peers.find((item) => item.id === peerId);
		if (!peer || peer.link === "offline") return;
		targetRef.current = peerId;
		fileRef.current?.click();
	}
	function openNote(peerId) {
		setNotePeer(peerId);
		setNoteText("");
		setNoteOpen(true);
	}
	async function submitNote() {
		if (!notePeer) return;
		try {
			await engineRef.current?.sendText(notePeer, noteText);
			setNoteOpen(false);
			setNoteText("");
		} catch (error) {
			setNotice(error instanceof Error ? error.message : "Note was not sent.");
		}
	}
	function applyRoom(next) {
		const code = next.toLowerCase().replace(/[^a-z]/g, "").slice(0, 5);
		setRoom(code);
		if (validRoom(code) || code === "") {
			saveRoom(code);
			engineRef.current?.setRoom(code);
		}
	}
	function applyLan(ip) {
		const trimmed = ip.trim();
		if (trimmed && !isValidLanIp(trimmed)) {
			setNotice("Use a private Wi-Fi address, like 192.168.43.1.");
			return;
		}
		setLan(trimmed);
		setLanDraft(trimmed);
		saveLan(trimmed);
		engineRef.current?.setLanIp(trimmed);
		setHotOpen(false);
		setNotice(trimmed ? `Using ${trimmed} on the Wi-Fi link.` : "Back to automatic hotspot addresses.");
	}
	async function makePair() {
		setPairError("");
		try {
			const code = await engineRef.current?.createInvite();
			if (code) setPairCode(code);
		} catch (error) {
			setPairError(error instanceof Error ? error.message : "Could not create a code.");
		}
	}
	async function submitJoin() {
		const code = joinCode.replace(/\D/g, "").slice(0, 6);
		if (code.length !== 6) {
			setPairError("Enter all six digits.");
			return;
		}
		setPairError("");
		try {
			const host = await engineRef.current?.joinInvite(code);
			if (!host) return;
			remember({
				id: host.id,
				name: host.name,
				device: asDevice(host.device)
			});
			setNotice(`Paired with ${host.name}.`);
			setPairOpen(false);
		} catch (error) {
			setPairError(error instanceof Error ? error.message : "Could not join that code.");
		}
	}
	function commitName() {
		const next = nameDraft.trim().slice(0, 40);
		if (!next) {
			setEditingName(false);
			return;
		}
		saveName(next);
		setNameDraft(next);
		engineRef.current?.setName(next);
		setEditingName(false);
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex min-h-dvh flex-col bg-paper text-ink",
		onDragOver: (event) => {
			if (![...event.dataTransfer.types].includes("Files")) return;
			event.preventDefault();
			setDragging(true);
		},
		onDragLeave: () => setDragging(false),
		onDrop: (event) => {
			event.preventDefault();
			setDragging(false);
			const files = [...event.dataTransfer.files];
			if (!files.length) return;
			const reachable = peers.filter((peer) => peer.link !== "offline");
			if (reachable.length === 1) engineRef.current?.enqueueFiles(reachable[0].id, files);
			else setDropFiles(files);
		},
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "mx-auto flex w-full max-w-3xl items-start justify-between gap-4 px-5 pt-6",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Mark, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "font-serif text-2xl leading-none font-medium tracking-tight",
							children: "Linklane"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-sm text-muted",
							children: "Windows, Linux, and Android"
						})] })]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-4 flex items-center gap-2 text-sm",
						children: editingName ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
							className: "flex items-center gap-2",
							onSubmit: (event) => {
								event.preventDefault();
								commitName();
							},
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								value: nameDraft,
								onChange: (event) => setNameDraft(event.target.value),
								className: "h-11 w-44 rounded-xl border border-line bg-card px-3 text-ink",
								"aria-label": "Your device name",
								autoFocus: true,
								maxLength: 40
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "submit",
								className: "grid size-11 place-items-center rounded-xl bg-ember-deep text-on-ember",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "size-4" })
							})]
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => {
								setNameDraft(you);
								setEditingName(true);
							},
							className: "inline-flex h-11 items-center gap-2 rounded-xl px-1 text-left",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-muted",
									children: "You are"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-medium",
									children: you
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pencil, { className: "size-3.5 text-muted" })
							]
						})
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: () => {
						const next = !wifiOnly;
						setWifiOnly(next);
						saveWifiOnly(next);
						engineRef.current?.setWifiOnly(next);
					},
					className: "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-medium " + (wifiOnly ? "border-ember bg-ember-deep text-on-ember" : "border-line bg-card text-ink"),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wifi, { className: "size-4" }), wifiOnly ? "Wi-Fi only" : "Public IP on"]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
				className: "mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-6",
				children: [
					snap.status === "offline" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mb-4 rounded-2xl border border-line bg-card px-4 py-3 text-sm text-muted",
						children: "Reconnecting to the introduction service. Files still will not be uploaded."
					}) : null,
					stuck ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => setHotOpen(true),
						className: "mb-4 rounded-2xl border border-line bg-card px-4 py-3 text-left text-sm",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-medium",
								children: "No direct Wi-Fi path yet."
							}),
							" ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-muted",
								children: "Open Linklane on the device sharing the hotspot — Android, Windows, or Linux — or enter its address."
							})
						]
					}) : null,
					room ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mb-4 text-sm text-muted",
						children: [
							"Room ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-medium text-ink",
								children: room
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "ml-3 underline",
								onClick: () => applyRoom(""),
								children: "Leave"
							})
						]
					}) : null,
					peers.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyState, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "grid gap-3 sm:grid-cols-2",
						children: peers.map((peer) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PeerCard, {
							peer,
							progress: snap.outgoing?.peerId === peer.id ? snap.outgoing : snap.receiving?.peerId === peer.id ? snap.receiving : null,
							onSend: () => pickFiles(peer.id),
							onNote: () => openNote(peer.id)
						}) }, peer.id))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Activity, {
						notes: snap.notes,
						finished: snap.finished,
						onCopy: (text) => {
							navigator.clipboard?.writeText(text);
							setNotice("Copied.");
						}
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("footer", {
				className: "dock sticky bottom-0 border-t border-line bg-paper/95 backdrop-blur",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto flex w-full max-w-3xl gap-2 overflow-x-auto px-4 py-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DockButton, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link2, { className: "size-4" }),
							label: "Pair",
							onClick: () => setPairOpen(true)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DockButton, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Hash, { className: "size-4" }),
							label: "Room",
							onClick: () => setRoomOpen(true)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DockButton, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wifi, { className: "size-4" }),
							label: "Hotspot",
							onClick: () => setHotOpen(true)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DockButton, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, { className: "size-4" }),
							label: "Install",
							onClick: () => setInstallOpen(true)
						})
					]
				})
			}),
			notice ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => setNotice(""),
				className: "fixed inset-x-4 bottom-24 z-30 mx-auto max-w-sm rounded-2xl bg-ink px-4 py-3 text-left text-sm text-paper",
				children: notice
			}) : null,
			dragging ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "pointer-events-none fixed inset-0 z-30 grid place-items-center bg-ink/40 px-6 text-center text-paper",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "font-serif text-3xl",
					children: "Drop to send"
				})
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				ref: fileRef,
				type: "file",
				multiple: true,
				className: "sr-only",
				onChange: (event) => {
					const files = [...event.target.files ?? []];
					event.target.value = "";
					const peerId = targetRef.current;
					if (peerId && files.length) engineRef.current?.enqueueFiles(peerId, files);
				}
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Sheet, {
				open: pairOpen,
				onOpenChange: setPairOpen,
				title: "Pair a device",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm text-muted",
						children: "Pairing remembers this device. Next time you are both online — any network — you will see each other, and the file still prefers Wi-Fi."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-4 flex flex-wrap gap-2",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => void makePair(),
							className: "h-12 rounded-xl bg-ember-deep px-4 text-sm font-medium text-on-ember",
							children: pairCode ? "New code" : "Show my code"
						})
					}),
					pairCode ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CodeBlock, {
						label: "Read this on the other device",
						value: pairCode.slice(0, 3) + " " + pairCode.slice(3),
						qr: pageUrl("pair", pairCode)
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "mt-5 block text-sm font-medium",
						children: ["Or enter a code", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							inputMode: "numeric",
							value: joinCode,
							onChange: (event) => setJoinCode(event.target.value),
							className: "mt-2 h-12 w-full rounded-xl border border-line bg-paper px-3 tracking-widest",
							placeholder: "000 000"
						})]
					}),
					pairError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-sm text-ember-deep",
						children: pairError
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => void submitJoin(),
						className: "mt-3 h-12 w-full rounded-xl border border-line bg-card text-sm font-medium",
						children: "Pair"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Sheet, {
				open: roomOpen,
				onOpenChange: (open) => {
					setRoomOpen(open);
					if (open && !validRoom(room)) applyRoom(randomRoom());
				},
				title: "A room for right now",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm text-muted",
						children: "Use a room when the devices do not share a public address — a phone on mobile data next to a laptop, or a hotspot that splits IPv4 and IPv6. The bytes still go over Wi-Fi if a local path exists."
					}),
					validRoom(room) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CodeBlock, {
						label: "Room",
						value: room,
						qr: pageUrl("room", room)
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "mt-4 block text-sm font-medium",
						children: ["Join a room", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							value: room,
							onChange: (event) => applyRoom(event.target.value),
							className: "mt-2 h-12 w-full rounded-xl border border-line bg-paper px-3 tracking-widest lowercase",
							placeholder: "abcde",
							maxLength: 5
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => applyRoom(randomRoom()),
						className: "mt-3 h-12 w-full rounded-xl bg-ember-deep text-sm font-medium text-on-ember",
						children: "New room"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Sheet, {
				open: hotOpen,
				onOpenChange: setHotOpen,
				title: "Whoever is sharing",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm text-muted",
						children: "Linklane already tries the usual hotspot addresses, so it does not matter whether the Android phone, the Windows PC, or the Linux machine is the one sharing. If the link still fails, type the Wi-Fi address of that device — the gateway if it is sharing, or its own address if it joined."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-4 flex flex-wrap gap-2",
						children: PRESETS.map((preset) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => applyLan(preset.ip),
							className: "h-11 rounded-full border border-line bg-card px-3 text-sm",
							children: preset.label
						}, preset.ip))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "mt-4 block text-sm font-medium",
						children: ["Wi-Fi address", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							value: lanDraft,
							onChange: (event) => setLanDraft(event.target.value),
							className: "mt-2 h-12 w-full rounded-xl border border-line bg-paper px-3",
							placeholder: "192.168.43.1",
							inputMode: "decimal"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-3 flex gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => applyLan(lanDraft),
							className: "h-12 flex-1 rounded-xl bg-ember-deep text-sm font-medium text-on-ember",
							children: "Use this address"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => applyLan(""),
							className: "h-12 rounded-xl border border-line px-4 text-sm",
							children: "Automatic"
						})]
					}),
					lan ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-3 text-sm text-muted",
						children: [
							"Pinned to ",
							lan,
							"."
						]
					}) : null
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Sheet, {
				open: installOpen,
				onOpenChange: setInstallOpen,
				title: "Install on this system",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted",
					children: "One app, installed from the browser. There is no separate store download. Keep it open on the device that is sharing the hotspot while files move."
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ol", {
					className: "mt-4 grid gap-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(InstallStep, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Monitor, { className: "size-5" }),
							title: "Windows",
							body: "Chrome or Edge: use the install icon in the address bar, then Install Linklane. It opens in its own window."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(InstallStep, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Laptop, { className: "size-5" }),
							title: "Linux",
							body: "Chrome, Chromium, or Edge: menu, then Install Linklane or Install page as app."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(InstallStep, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Smartphone, { className: "size-5" }),
							title: "Android",
							body: "Chrome menu, then Install app or Add to Home screen. Pin it on the phone that shares the connection."
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Sheet, {
				open: noteOpen,
				onOpenChange: setNoteOpen,
				title: "Send a note",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
					value: noteText,
					onChange: (event) => setNoteText(event.target.value),
					maxLength: 4e3,
					rows: 5,
					className: "mt-1 w-full resize-none rounded-xl border border-line bg-paper p-3 text-sm",
					placeholder: "A line of text. It is not stored on the server."
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => void submitNote(),
					className: "mt-3 h-12 w-full rounded-xl bg-ember-deep text-sm font-medium text-on-ember",
					children: "Send"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open: snap.incoming.length > 0,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogPortal, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogOverlay, { className: "fixed inset-0 z-40 bg-ink/40" }), snap.incoming[0] ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
					className: "fixed inset-x-0 bottom-0 z-50 max-h-dvh overflow-y-auto rounded-t-3xl border-t border-line bg-card p-5 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, {
							className: "font-serif text-2xl",
							children: "Incoming"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogDescription, {
							className: "mt-1 text-sm text-muted",
							children: ["From ", snap.incoming[0].fromName]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "mt-4 grid gap-2",
							children: snap.incoming[0].files.map((file) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "rounded-xl border border-line px-3 py-3 text-sm",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "font-medium",
									children: file.name
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-muted",
									children: formatBytes(file.size)
								})]
							}, file.name + String(file.size)))
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-4 flex gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => engineRef.current?.respond(snap.incoming[0].id, false),
								className: "h-12 flex-1 rounded-xl border border-line text-sm font-medium",
								children: "Decline"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => engineRef.current?.respond(snap.incoming[0].id, true),
								className: "h-12 flex-1 rounded-xl bg-ember-deep text-sm font-medium text-on-ember",
								children: "Accept"
							})]
						})
					]
				}) : null] })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open: !!dropFiles,
				onOpenChange: (open) => !open && setDropFiles(null),
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogPortal, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogOverlay, { className: "fixed inset-0 z-40 bg-ink/40" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
					className: "fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border-t border-line bg-card p-5 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, {
							className: "font-serif text-2xl",
							children: "Send to"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogDescription, {
							className: "mt-1 text-sm text-muted",
							children: [
								dropFiles?.length ?? 0,
								" file",
								(dropFiles?.length ?? 0) === 1 ? "" : "s"
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "mt-4 grid gap-2",
							children: peers.filter((peer) => peer.link !== "offline").map((peer) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "flex h-12 w-full items-center justify-between rounded-xl border border-line px-3 text-sm",
								onClick: () => {
									if (dropFiles) engineRef.current?.enqueueFiles(peer.id, dropFiles);
									setDropFiles(null);
								},
								children: [peer.name, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-muted",
									children: peer.pathLabel
								})]
							}) }, peer.id))
						})
					]
				})] })
			})
		]
	});
}
function asDevice(value) {
	if (value === "android" || value === "windows" || value === "linux" || value === "ios" || value === "mac") return value;
	return "other";
}
function pageUrl(key, value) {
	if (typeof window === "undefined") return value;
	const url = new URL(window.location.href);
	url.searchParams.set(key, value);
	return url.toString();
}
function saveBlob(blob, name) {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = name;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 3e4);
}
function Mark() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		viewBox: "0 0 32 32",
		className: "size-10 text-ember",
		"aria-hidden": true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
			width: "32",
			height: "32",
			rx: "10",
			fill: "currentColor"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
			className: "text-on-ember",
			fill: "currentColor",
			stroke: "currentColor",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
					cx: "10",
					cy: "16",
					r: "3",
					stroke: "none"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
					cx: "22",
					cy: "16",
					r: "3",
					stroke: "none"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
					d: "M13 16h6",
					strokeWidth: "2",
					fill: "none"
				})
			]
		})]
	});
}
function EmptyState() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-1 flex-col items-center justify-center py-10 text-center",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "relative grid size-48 place-items-center",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "radar-ring absolute inset-0 rounded-full border border-ember" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "radar-ring radar-ring-2 absolute inset-0 rounded-full border border-ember" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "radar-ring radar-ring-3 absolute inset-0 rounded-full border border-ember" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "relative grid size-16 place-items-center rounded-full bg-ember-deep text-on-ember",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wifi, { className: "size-7" })
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "mt-6 max-w-sm font-serif text-3xl leading-tight font-medium",
				children: "Open Linklane on the other device"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 max-w-sm text-sm leading-relaxed text-muted",
				children: "Same Wi-Fi, or a hotspot. It does not matter which device is sharing — the Android phone, the Windows PC, or the Linux machine. Files go device to device. They are not uploaded."
			})
		]
	});
}
function PeerCard({ peer, progress, onSend, onNote }) {
	const offline = peer.link === "offline";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-stretch gap-2 rounded-2xl border border-line bg-card p-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
			type: "button",
			disabled: offline,
			onClick: onSend,
			className: "flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 text-left disabled:opacity-60",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "grid size-12 shrink-0 place-items-center rounded-full bg-paper text-ink",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeviceGlyph, { device: peer.device })
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "min-w-0",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "block truncate font-medium",
						children: peer.name
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "mt-0.5 flex items-center gap-1.5 text-sm text-muted",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dot, { link: peer.link }),
							deviceLabel(peer.device),
							" · ",
							peer.pathLabel
						]
					}),
					progress && progress.status !== "done" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "mt-2 block",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "mb-1 block text-xs text-muted",
							children: progress.status === "waiting" ? "Waiting for them to accept" : progress.status === "declined" ? "Declined" : progress.status === "failed" ? progress.detail || "Stopped" : `${progress.files[progress.fileIndex]?.name ?? "File"}`
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "block h-1.5 overflow-hidden rounded-full bg-line",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "block h-full bg-ember",
								style: { width: `${percent(progress)}%` }
							})
						})]
					}) : null
				]
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			disabled: offline,
			onClick: onNote,
			className: "grid size-12 shrink-0 place-items-center rounded-xl border border-line disabled:opacity-40",
			"aria-label": `Send a note to ${peer.name}`,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MessageSquare, { className: "size-4" })
		})]
	});
}
function percent(progress) {
	const files = progress.files.length || 1;
	const part = progress.count ? progress.seq / progress.count : 0;
	return Math.max(0, Math.min(100, Math.round((progress.fileIndex + part) / files * 100)));
}
function Dot({ link }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "inline-block size-2 rounded-full " + (link === "wifi" || link === "relay" ? "bg-ember" : link === "failed" ? "bg-ember-deep" : "bg-line") });
}
function DeviceGlyph({ device }) {
	if (device === "android" || device === "ios") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Smartphone, { className: "size-5" });
	if (device === "linux" || device === "windows" || device === "mac") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Laptop, { className: "size-5" });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Monitor, { className: "size-5" });
}
function DockButton({ icon, label, onClick }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		onClick,
		className: "inline-flex h-12 shrink-0 items-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-medium",
		children: [icon, label]
	});
}
function Sheet({ open, onOpenChange, title, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
		open,
		onOpenChange,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogPortal, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogOverlay, { className: "fixed inset-0 z-40 bg-ink/40" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
			className: "fixed inset-x-0 bottom-0 z-50 max-h-dvh overflow-y-auto rounded-t-3xl border-t border-line bg-card p-5 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-3 flex items-start justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, {
					className: "font-serif text-2xl leading-tight",
					children: title
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogClose, {
					className: "grid size-11 place-items-center rounded-full border border-line",
					"aria-label": "Close",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "size-4" })
				})]
			}), children]
		})] })
	});
}
function CodeBlock({ label, value, qr }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-4 flex items-center gap-4 rounded-2xl border border-line bg-paper p-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Qr, { text: qr }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-sm text-muted",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "font-serif text-3xl tracking-wide",
			children: value
		})] })]
	});
}
function Qr({ text }) {
	const [url, setUrl] = (0, import_react.useState)("");
	(0, import_react.useEffect)(() => {
		let cancel = false;
		import("../_libs/qrcode.mjs").then((n) => /* @__PURE__ */ __toESM(n.t())).then((mod) => {
			return (mod.default ?? mod).toDataURL(text, {
				margin: 1,
				width: 280,
				color: {
					dark: "#1a1814",
					light: "#fffdf8"
				}
			});
		}).then((data) => {
			if (!cancel) setUrl(data);
		}).catch(() => {});
		return () => {
			cancel = true;
		};
	}, [text]);
	if (!url) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "size-24 rounded-xl bg-line" });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
		src: url,
		alt: "",
		className: "size-24 rounded-xl"
	});
}
function InstallStep({ icon, title, body }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
		className: "flex gap-3 rounded-2xl border border-line bg-paper p-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "grid size-11 shrink-0 place-items-center rounded-full bg-card",
			children: icon
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "block font-medium",
			children: title
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "mt-1 block text-sm leading-relaxed text-muted",
			children: body
		})] })]
	});
}
function Activity({ notes, finished, onCopy }) {
	if (!notes.length && !finished.length) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "mt-8",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
			className: "text-sm font-medium text-muted",
			children: "Recent"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
			className: "mt-2 grid gap-2",
			children: [notes.map((note) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
				className: "rounded-2xl border border-line bg-card px-4 py-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs text-muted",
						children: note.incoming ? `From ${note.peerName}` : "Sent"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-sm whitespace-pre-wrap",
						children: note.text
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "mt-2 text-sm font-medium text-ember-deep",
						onClick: () => onCopy(note.text),
						children: "Copy"
					})
				]
			}, note.id)), finished.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
				className: "rounded-2xl border border-line bg-card px-4 py-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "text-xs text-muted",
					children: ["From ", item.peerName]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-2 grid gap-2",
					children: item.files.map((file) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex items-center justify-between gap-3 text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "truncate",
							children: file.name
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "inline-flex h-11 shrink-0 items-center gap-1 rounded-full bg-ember-deep px-3 text-on-ember",
							onClick: () => saveBlob(file.blob, file.name),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, { className: "size-4" }), "Save"]
						})]
					}, file.name))
				})]
			}, item.id))]
		})]
	});
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LinklaneApp, {});
}
//#endregion
export { Home as component };
