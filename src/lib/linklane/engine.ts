import {
  expandHostCandidate,
  filterSdp,
  HOTSPOT_GATEWAYS,
  isPrivateIpv4,
  isValidLanIp,
  shouldForwardCandidate,
} from "./candidates";
import type { DeviceKind } from "./identity";
import {
  CHUNK_BYTES,
  decodeChunk,
  decodeFwd,
  encodeChunk,
  encodeFwd,
  MAX_FILES,
  MAX_NOTE,
  MAX_TRANSFER_BYTES,
  safeFileName,
  type Control,
  type Envelope,
  type FileMeta,
} from "./protocol";

export type Via = "wifi" | "room" | "paired";
export type Link = "linking" | "wifi" | "relay" | "public" | "failed" | "offline";

export type PeerView = {
  id: string;
  name: string;
  device: DeviceKind;
  via: Via;
  link: Link;
  relayName?: string;
  pathLabel: string;
};

export type Incoming = {
  id: string;
  fromId: string;
  fromName: string;
  files: FileMeta[];
};

export type Outgoing = {
  id: string;
  peerId: string;
  peerName: string;
  files: FileMeta[];
  fileIndex: number;
  seq: number;
  count: number;
  status: "waiting" | "sending" | "done" | "declined" | "failed";
  detail?: string;
};

export type Finished = {
  id: string;
  peerName: string;
  files: { name: string; blob: Blob }[];
};

export type Note = {
  id: string;
  peerName: string;
  text: string;
  incoming: boolean;
};

export type InviteView = {
  code: string;
  role: "host" | "guest";
  other: { id: string; name: string; device: string } | null;
} | null;

export type Snapshot = {
  status: "connecting" | "online" | "offline";
  peers: PeerView[];
  invite: InviteView;
  incoming: Incoming[];
  outgoing: Outgoing | null;
  receiving: Outgoing | null;
  finished: Finished[];
  notes: Note[];
};

type RosterPeer = {
  id: string;
  name: string;
  device: string;
  sameNet: boolean;
  sameRoom: boolean;
  paired: boolean;
};

type SignalRow = {
  id: number;
  from: string;
  kind: "offer" | "answer" | "ice";
  payload: unknown;
};

type Slot = {
  id: string;
  name: string;
  pc: RTCPeerConnection;
  dc?: RTCDataChannel;
  makingOffer: boolean;
  ignoreOffer: boolean;
  pending: RTCIceCandidateInit[];
  remoteVia: Set<string>;
  terminal: boolean;
  failedAt: number;
  synthLeft: number;
  path: "wifi" | "public" | null;
  toldIp: boolean;
  recreated: boolean;
};

type Rx = {
  id: string;
  fromId: string;
  files: FileMeta[];
  parts: Map<number, Uint8Array>[];
  counts: number[];
  got: number[];
  bytes: number;
};

type Waiter = { resolve: (ok: boolean) => void };

const RETRY_MS = [250, 800];

function toWire(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function asDevice(value: string): DeviceKind {
  if (
    value === "android" ||
    value === "windows" ||
    value === "linux" ||
    value === "ios" ||
    value === "mac"
  ) {
    return value;
  }
  return "other";
}

export class LinkEngine {
  readonly selfId: string;
  name: string;
  device: DeviceKind;
  room = "";
  lanIp = "";
  learned = "";
  wifiOnly = true;
  bondIds: string[] = [];

  private closed = false;
  private cursor = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private peers = new Map<string, Slot>();
  private roster = new Map<string, RosterPeer>();
  private queues = new Map<string, Promise<void>>();
  private rx = new Map<string, Rx>();
  private waiters = new Map<string, Waiter>();
  private outQueue: { peerId: string; files: File[] }[] = [];
  private pumping = false;
  private cleared = false;
  private viaFp: string | null = null;
  private listeners = new Set<(s: Snapshot) => void>();
  private snap: Snapshot = {
    status: "connecting",
    peers: [],
    invite: null,
    incoming: [],
    outgoing: null,
    receiving: null,
    finished: [],
    notes: [],
  };

  constructor(opts: { id: string; name: string; device: DeviceKind }) {
    this.selfId = opts.id;
    this.name = opts.name;
    this.device = opts.device;
  }

  subscribe(fn: (s: Snapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.snap);
    return () => this.listeners.delete(fn);
  }

  start(): void {
    void this.loop();
  }

  stop(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    for (const slot of this.peers.values()) slot.pc.close();
    this.peers.clear();
    void fetch("/api/link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "leave", peer: this.selfId }),
      keepalive: true,
    }).catch(() => {});
  }

  setRoom(room: string): void {
    this.room = room;
  }

  setName(name: string): void {
    this.name = name;
  }

  setBonds(ids: string[]): void {
    this.bondIds = ids.slice(0, 16);
  }

  setLanIp(ip: string): void {
    if (ip === this.lanIp) return;
    this.lanIp = ip;
    this.restartUnconnected();
  }

  setWifiOnly(on: boolean): void {
    if (on === this.wifiOnly) return;
    this.wifiOnly = on;
    this.restartAll();
  }

  async createInvite(): Promise<string> {
    const res = await this.post({
      op: "invite",
      peer: this.selfId,
      name: this.name,
      device: this.device,
    });
    if (!res.ok) throw new Error("Could not create a pair code.");
    const body = (await res.json()) as { code?: string };
    if (!body.code) throw new Error("Could not create a pair code.");
    return body.code;
  }

  async joinInvite(code: string): Promise<{ id: string; name: string; device: string }> {
    const res = await this.post({
      op: "join",
      peer: this.selfId,
      name: this.name,
      device: this.device,
      code,
    });
    const body = (await res.json()) as {
      error?: string;
      host?: { id: string; name: string; device: string };
    };
    if (!res.ok || !body.host) throw new Error(body.error || "Could not join that code.");
    return body.host;
  }

  async sendText(peerId: string, text: string): Promise<void> {
    const note = text.trim().slice(0, MAX_NOTE);
    if (!note) return;
    const ready = await this.waitRoute(peerId, 8000);
    if (!ready) throw new Error("That device is not on the Wi-Fi link yet.");
    const id = crypto.randomUUID();
    this.deliver(peerId, { t: "text", id, text: note });
    this.pushNote({ id, peerName: this.nameOf(peerId), text: note, incoming: false });
  }

  enqueueFiles(peerId: string, files: File[]): void {
    const list = [...files].slice(0, MAX_FILES).filter((f) => f.size <= MAX_TRANSFER_BYTES);
    if (!list.length) return;
    this.outQueue.push({ peerId, files: list });
    void this.pump();
  }

  respond(id: string, accept: boolean): void {
    const rx = this.rx.get(id);
    if (!rx) return;
    this.snap.incoming = this.snap.incoming.filter((item) => item.id !== id);
    if (!accept) {
      this.deliver(rx.fromId, { t: "decline", id });
      this.rx.delete(id);
      this.emit();
      return;
    }
    this.deliver(rx.fromId, { t: "accept", id });
    this.emit();
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    while (this.outQueue.length && !this.closed) {
      const job = this.outQueue.shift()!;
      await this.runSend(job.peerId, job.files);
    }
    this.pumping = false;
  }

  private async runSend(peerId: string, files: File[]): Promise<void> {
    const id = crypto.randomUUID();
    const metas: FileMeta[] = files.map((f) => ({
      name: safeFileName(f.name),
      size: f.size,
      mime: f.type || "application/octet-stream",
    }));
    const outgoing: Outgoing = {
      id,
      peerId,
      peerName: this.nameOf(peerId),
      files: metas,
      fileIndex: 0,
      seq: 0,
      count: 1,
      status: "waiting",
    };
    this.snap.outgoing = outgoing;
    this.emit();
    const ready = await this.waitRoute(peerId, 12000);
    if (!ready || this.closed) {
      outgoing.status = "failed";
      outgoing.detail = "No Wi-Fi path yet. Open Linklane on the hotspot, or enter its address.";
      this.emit();
      return;
    }
    const accepted = new Promise<boolean>((resolve) => {
      this.waiters.set(id, { resolve });
      setTimeout(() => resolve(false), 120_000);
    });
    this.deliver(peerId, { t: "want", id, files: metas });
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
        const file = files[fi]!;
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
      this.deliver(peerId, { t: "complete", id });
      outgoing.status = "done";
      this.emit();
    } catch (error) {
      outgoing.status = "failed";
      outgoing.detail = error instanceof Error ? error.message : "Transfer stopped.";
      this.deliver(peerId, { t: "cancel", id });
      this.emit();
    }
  }

  private async loop(): Promise<void> {
    if (this.closed) return;
    try {
      if (!this.cleared) {
        this.cleared = true;
        await this.post({ op: "clear", peer: this.selfId });
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

  private async pollOnce(): Promise<void> {
    const params = new URLSearchParams({
      peer: this.selfId,
      name: this.name,
      device: this.device,
      room: this.room,
      bonds: this.bondIds.join(","),
      since: String(this.cursor),
    });
    const res = await fetch(`/api/link?${params}`);
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as {
      peers: RosterPeer[];
      signals: SignalRow[];
      invite: InviteView;
    };
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

  private reconcile(peers: RosterPeer[]): void {
    const alive = new Set(peers.map((p) => p.id));
    for (const peer of peers) {
      const slot = this.peers.get(peer.id);
      if (slot) {
        slot.name = peer.name;
        continue;
      }
      this.connect(peer.id, peer.name, this.selfId > peer.id);
    }
    for (const [id, slot] of this.peers) {
      if (!alive.has(id)) {
        slot.pc.close();
        this.peers.delete(id);
      }
    }
  }

  private connect(peerId: string, name: string, initiator: boolean): Slot | null {
    if (this.closed || typeof RTCPeerConnection === "undefined") return null;
    const pc = new RTCPeerConnection({
      iceServers: this.wifiOnly
        ? []
        : [{ urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }],
    });
    const slot: Slot = {
      id: peerId,
      name,
      pc,
      makingOffer: false,
      ignoreOffer: false,
      pending: [],
      remoteVia: new Set(),
      terminal: false,
      failedAt: 0,
      synthLeft: 18,
      path: null,
      toldIp: false,
      recreated: false,
    };
    this.peers.set(peerId, slot);
    pc.onicecandidate = (event) => {
      void this.onLocalIce(slot, event.candidate);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        slot.terminal = false;
      }
      if (pc.connectionState === "failed") {
        slot.terminal = true;
        slot.failedAt = Date.now();
      }
      this.announce();
      this.emit();
    };
    pc.onnegotiationneeded = () => {
      void this.negotiate(slot);
    };
    pc.ondatachannel = (event) => this.bindDc(slot, event.channel);
    if (initiator) {
      this.bindDc(slot, pc.createDataChannel("files", { ordered: true }));
    }
    return slot;
  }

  private bindDc(slot: Slot, channel: RTCDataChannel): void {
    slot.dc = channel;
    channel.binaryType = "arraybuffer";
    channel.onopen = () => {
      slot.terminal = false;
      this.announce();
      void this.inspect(slot);
      this.emit();
    };
    channel.onclose = () => {
      this.announce();
      this.emit();
    };
    channel.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          this.onEnvelope(JSON.parse(event.data) as Envelope, slot.id);
        } catch {
          /* ignore malformed control */
        }
        return;
      }
      const bytes =
        event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : new Uint8Array();
      this.onBinary(slot.id, bytes);
    };
  }

  private async negotiate(slot: Slot): Promise<void> {
    if (this.closed) return;
    try {
      slot.makingOffer = true;
      await slot.pc.setLocalDescription(await slot.pc.createOffer());
      if (this.closed || !slot.pc.localDescription) return;
      await this.sendSignal(slot.id, "offer", slot.pc.localDescription.toJSON());
    } catch {
      /* next cycle retries */
    } finally {
      slot.makingOffer = false;
    }
  }

  private async onLocalIce(slot: Slot, candidate: RTCIceCandidate | null): Promise<void> {
    if (!candidate) {
      await this.sendSignal(slot.id, "ice", { candidate: "" });
      return;
    }
    const line = candidate.candidate;
    if (shouldForwardCandidate(line, this.wifiOnly)) {
      await this.sendSignal(slot.id, "ice", {
        candidate: line,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
      });
    }
    if (slot.synthLeft <= 0 || candidate.type !== "host") return;
    const extras = expandHostCandidate(line, this.extraIps()).slice(0, slot.synthLeft);
    slot.synthLeft -= extras.length;
    for (const synthetic of extras) {
      await this.sendSignal(slot.id, "ice", {
        candidate: synthetic,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
      });
    }
  }

  private extraIps(): string[] {
    const ips: string[] = [];
    if (isValidLanIp(this.lanIp)) ips.push(this.lanIp);
    if (isValidLanIp(this.learned) && this.learned !== this.lanIp) ips.push(this.learned);
    for (const gateway of HOTSPOT_GATEWAYS) {
      if (!ips.includes(gateway)) ips.push(gateway);
    }
    return ips;
  }

  private async onSignal(
    from: string,
    kind: SignalRow["kind"],
    payload: unknown,
    alive: Set<string>,
  ): Promise<void> {
    let slot = this.peers.get(from);
    if (!slot) {
      if (!alive.has(from)) return;
      slot = this.connect(from, this.nameOf(from), false) ?? undefined;
      if (!slot) return;
    }
    const polite = this.selfId < from;
    try {
      if (kind === "offer" || kind === "answer") {
        const description = payload as RTCSessionDescriptionInit;
        const filtered: RTCSessionDescriptionInit = {
          type: description.type,
          sdp: filterSdp(description.sdp || "", this.wifiOnly),
        };
        const collision =
          kind === "offer" && (slot.makingOffer || slot.pc.signalingState !== "stable");
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
      const ice = payload as RTCIceCandidateInit;
      if (!ice || !ice.candidate) {
        try {
          await slot.pc.addIceCandidate(null as unknown as RTCIceCandidateInit);
        } catch {
          /* end-of-candidates is optional */
        }
        return;
      }
      if (!shouldForwardCandidate(ice.candidate, this.wifiOnly)) return;
      if (!slot.pc.remoteDescription) {
        slot.pending.push(ice);
        return;
      }
      try {
        await slot.pc.addIceCandidate(ice);
      } catch {
        /* stale candidate */
      }
    } catch {
      /* negotiation retries on the next offer */
    }
  }

  private async flush(slot: Slot): Promise<void> {
    while (slot.pending.length) {
      const candidate = slot.pending.shift()!;
      try {
        await slot.pc.addIceCandidate(candidate);
      } catch {
        /* ignore */
      }
    }
  }

  private sendSignal(to: string, kind: SignalRow["kind"], payload: unknown): Promise<void> {
    const prev = this.queues.get(to) ?? Promise.resolve();
    const next = prev.then(() => this.postSignal(to, kind, payload));
    this.queues.set(
      to,
      next.catch(() => {}),
    );
    return next;
  }

  private async postSignal(to: string, kind: SignalRow["kind"], payload: unknown): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      if (this.closed) return;
      try {
        const res = await this.post({ op: "signal", from: this.selfId, to, kind, payload });
        if (res.ok) return;
        throw new Error(String(res.status));
      } catch {
        if (attempt >= RETRY_MS.length) return;
        await sleep(RETRY_MS[attempt] ?? 400);
      }
    }
  }

  private post(body: unknown): Promise<Response> {
    return fetch("/api/link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  private async inspect(slot: Slot): Promise<void> {
    for (let i = 0; i < 8; i += 1) {
      await sleep(350);
      if (this.closed || slot.dc?.readyState !== "open") return;
      const found = await this.readPair(slot.pc);
      if (!found) continue;
      slot.path = found.typ === "srflx" || found.typ === "relay" ? "public" : "wifi";
      this.emit();
      if (found.remoteIp && !slot.toldIp) {
        slot.toldIp = true;
        this.sendDirect(slot, { t: "your-ip", ip: found.remoteIp });
      }
      return;
    }
  }

  private async readPair(
    pc: RTCPeerConnection,
  ): Promise<{ typ: string | null; remoteIp: string | null } | null> {
    const stats = await pc.getStats();
    const rows = [...stats.values()] as {
      type: string;
      state?: string;
      nominated?: boolean;
      selected?: boolean;
      remoteCandidateId?: string;
      localCandidateId?: string;
      address?: string;
      candidateType?: string;
    }[];
    const pair = rows.find(
      (row) =>
        row.type === "candidate-pair" && row.state === "succeeded" && (row.nominated || row.selected),
    );
    if (!pair) return null;
    const remote = pair.remoteCandidateId
      ? (stats.get(pair.remoteCandidateId) as { address?: string; candidateType?: string } | undefined)
      : undefined;
    const local = pair.localCandidateId
      ? (stats.get(pair.localCandidateId) as { candidateType?: string } | undefined)
      : undefined;
    const address = remote?.address || "";
    return {
      typ: local?.candidateType || remote?.candidateType || null,
      remoteIp: isPrivateIpv4(address) ? address : null,
    };
  }

  private announce(): void {
    const via = this.directIds();
    const fp = via.slice().sort().join(",");
    if (fp === this.viaFp) return;
    this.viaFp = fp;
    const msg: Control = { t: "hello", via };
    for (const slot of this.peers.values()) this.sendDirect(slot, msg);
    this.emit();
  }

  private directIds(): string[] {
    const ids: string[] = [];
    for (const [id, slot] of this.peers) {
      if (slot.dc?.readyState === "open") ids.push(id);
    }
    return ids;
  }

  private sendDirect(slot: Slot, msg: Control): void {
    if (slot.dc?.readyState === "open") slot.dc.send(JSON.stringify(msg));
  }

  private route(target: string): { dc: RTCDataChannel; wrap: boolean } | null {
    const direct = this.peers.get(target);
    if (direct?.dc?.readyState === "open") return { dc: direct.dc, wrap: false };
    for (const slot of this.peers.values()) {
      if (slot.dc?.readyState !== "open") continue;
      if (slot.remoteVia.has(target)) return { dc: slot.dc, wrap: true };
    }
    return null;
  }

  private async waitRoute(peerId: string, ms: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (this.closed) return false;
      if (this.route(peerId)) return true;
      await sleep(250);
    }
    return !!this.route(peerId);
  }

  private deliver(target: string, msg: Control): boolean {
    const path = this.route(target);
    if (!path) return false;
    const envelope: Envelope = path.wrap
      ? { t: "fwd", to: target, from: this.selfId, m: msg }
      : msg;
    path.dc.send(JSON.stringify(envelope));
    return true;
  }

  private async sendBinary(target: string, packet: Uint8Array): Promise<void> {
    const path = this.route(target);
    if (!path) throw new Error("Wi-Fi link dropped.");
    const bytes = path.wrap ? encodeFwd(target, this.selfId, packet) : packet;
    await this.drain(path.dc);
    path.dc.send(toWire(bytes));
  }

  private async drain(dc: RTCDataChannel): Promise<void> {
    if (dc.readyState !== "open") throw new Error("Wi-Fi link dropped.");
    if (dc.bufferedAmount < 512 * 1024) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("The link stalled."));
      }, 20_000);
      const onLow = () => {
        cleanup();
        resolve();
      };
      const onClose = () => {
        cleanup();
        reject(new Error("Wi-Fi link dropped."));
      };
      const cleanup = () => {
        clearTimeout(timer);
        dc.removeEventListener("bufferedamountlow", onLow);
        dc.removeEventListener("close", onClose);
      };
      dc.bufferedAmountLowThreshold = 256 * 1024;
      dc.addEventListener("bufferedamountlow", onLow);
      dc.addEventListener("close", onClose);
    });
  }

  private onBinary(viaId: string, bytes: Uint8Array): void {
    if (bytes[0] === 0x03) {
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

  private takeChunk(fromId: string, bytes: Uint8Array): void {
    const chunk = decodeChunk(bytes);
    if (!chunk) return;
    const rx = this.rx.get(chunk.id);
    if (!rx || rx.bytes > MAX_TRANSFER_BYTES) return;
    if (!rx.parts[chunk.fileIndex]) return;
    if (!rx.parts[chunk.fileIndex]!.has(chunk.seq)) {
      rx.parts[chunk.fileIndex]!.set(chunk.seq, chunk.bytes);
      rx.got[chunk.fileIndex] = (rx.got[chunk.fileIndex] ?? 0) + 1;
      rx.bytes += chunk.bytes.byteLength;
    }
    rx.counts[chunk.fileIndex] = chunk.count;
    const outgoingLike: Outgoing = {
      id: chunk.id,
      peerId: fromId,
      peerName: this.nameOf(fromId),
      files: rx.files,
      fileIndex: chunk.fileIndex,
      seq: rx.got[chunk.fileIndex] ?? 0,
      count: chunk.count,
      status: "sending",
    };
    this.snap.receiving = outgoingLike;
    this.emit();
  }

  private onEnvelope(msg: Envelope, viaId: string): void {
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

  private onControl(msg: Control, fromId: string): void {
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
      const files = (msg.files || []).slice(0, MAX_FILES).map((file) => ({
        name: safeFileName(String(file.name || "file")),
        size: Number(file.size) || 0,
        mime: String(file.mime || "application/octet-stream").slice(0, 120),
      }));
      const rx: Rx = {
        id: msg.id,
        fromId,
        files,
        parts: files.map(() => new Map()),
        counts: files.map(() => 0),
        got: files.map(() => 0),
        bytes: 0,
      };
      this.rx.set(msg.id, rx);
      this.snap.incoming = [
        ...this.snap.incoming,
        { id: msg.id, fromId, fromName: this.nameOf(fromId), files },
      ];
      this.emit();
      return;
    }
    if (msg.t === "accept" || msg.t === "decline") {
      this.waiters.get(msg.id)?.resolve(msg.t === "accept");
      if (msg.t === "decline" && this.snap.outgoing?.id === msg.id) {
        this.snap.outgoing = { ...this.snap.outgoing, status: "declined" };
        this.emit();
      }
      return;
    }
    if (msg.t === "cancel") {
      this.rx.delete(msg.id);
      this.snap.incoming = this.snap.incoming.filter((item) => item.id !== msg.id);
      if (this.snap.outgoing?.id === msg.id) {
        this.snap.outgoing = { ...this.snap.outgoing, status: "failed", detail: "The other device cancelled." };
      }
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
      this.pushNote({ id: msg.id, peerName: this.nameOf(fromId), text, incoming: true });
    }
  }

  private finishRx(id: string): void {
    const rx = this.rx.get(id);
    if (!rx) return;
    const files = rx.files.map((file, index) => {
      const parts = rx.parts[index] ?? new Map<number, Uint8Array>();
      const count = file.size === 0 ? 0 : rx.counts[index] || 0;
      const ordered: Uint8Array[] = [];
      for (let seq = 0; seq < count; seq += 1) {
        const part = parts.get(seq);
        if (part) ordered.push(part);
      }
      const blobParts = ordered as unknown as BlobPart[];
      return { name: file.name, blob: new Blob(blobParts, { type: file.mime }) };
    });
    this.rx.delete(id);
    this.snap.finished = [{ id, peerName: this.nameOf(rx.fromId), files }, ...this.snap.finished].slice(0, 8);
    if (this.snap.receiving?.id === id) this.snap.receiving = null;
    this.snap.incoming = this.snap.incoming.filter((item) => item.id !== id);
    this.emit();
  }

  private pushNote(note: Note): void {
    this.snap.notes = [note, ...this.snap.notes].slice(0, 8);
    this.emit();
  }

  private retryDue(): void {
    const now = Date.now();
    for (const [id, slot] of [...this.peers]) {
      if (!slot.terminal || now - slot.failedAt < 10_000) continue;
      if (!this.roster.has(id)) continue;
      const name = slot.name;
      slot.pc.close();
      this.peers.delete(id);
      this.connect(id, name, this.selfId > id);
    }
  }

  private restartUnconnected(): void {
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

  private restartAll(): void {
    for (const slot of this.peers.values()) slot.pc.close();
    this.peers.clear();
    this.viaFp = null;
    this.reconcile([...this.roster.values()]);
    this.emit();
  }

  private anyLinking(): boolean {
    for (const slot of this.peers.values()) {
      if (slot.terminal) continue;
      if (slot.dc?.readyState !== "open") return true;
    }
    return false;
  }

  private nameOf(id: string): string {
    return this.roster.get(id)?.name || this.peers.get(id)?.name || "Device";
  }

  private emit(): void {
    this.snap.peers = this.peerViews();
    const next = { ...this.snap, peers: this.snap.peers.slice() };
    for (const fn of this.listeners) fn(next);
  }

  private peerViews(): PeerView[] {
    const views: PeerView[] = [];
    for (const peer of this.roster.values()) {
      views.push(this.viewOf(peer));
    }
    return views.sort((a, b) => a.name.localeCompare(b.name));
  }

  private viewOf(peer: RosterPeer): PeerView {
    const slot = this.peers.get(peer.id);
    const via: Via = peer.paired ? "paired" : peer.sameRoom && !peer.sameNet ? "room" : "wifi";
    const open = slot?.dc?.readyState === "open";
    let link: Link = "linking";
    let relayName: string | undefined;
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
      device: asDevice(peer.device),
      via,
      link,
      relayName,
      pathLabel,
    };
  }

  private findRelay(target: string): string | null {
    for (const [id, slot] of this.peers) {
      if (id === target) continue;
      if (slot.dc?.readyState !== "open") continue;
      if (slot.remoteVia.has(target)) return id;
    }
    return null;
  }
}
