export type FileMeta = { name: string; size: number; mime: string };

export type Control =
  | { t: "hello"; via: string[] }
  | { t: "your-ip"; ip: string }
  | { t: "want"; id: string; files: FileMeta[] }
  | { t: "accept"; id: string }
  | { t: "decline"; id: string }
  | { t: "cancel"; id: string }
  | { t: "complete"; id: string }
  | { t: "text"; id: string; text: string };

export type Envelope = Control | { t: "fwd"; to: string; from: string; m: Control };

export type Chunk = {
  id: string;
  fileIndex: number;
  seq: number;
  count: number;
  bytes: Uint8Array;
};

const enc = new TextEncoder();
const dec = new TextDecoder();

export function encodeChunk(
  id: string,
  fileIndex: number,
  seq: number,
  count: number,
  bytes: Uint8Array,
): Uint8Array {
  const idBytes = enc.encode(id);
  const out = new Uint8Array(1 + 1 + idBytes.length + 2 + 4 + 4 + bytes.length);
  const view = new DataView(out.buffer);
  let o = 0;
  out[o++] = 0x02;
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

export function decodeChunk(bytes: Uint8Array): Chunk | null {
  if (bytes.length < 12 || bytes[0] !== 0x02) return null;
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
  return { id, fileIndex, seq, count, bytes: bytes.subarray(o) };
}

export function encodeFwd(to: string, from: string, payload: Uint8Array): Uint8Array {
  const toB = enc.encode(to);
  const fromB = enc.encode(from);
  const out = new Uint8Array(1 + 1 + toB.length + 1 + fromB.length + payload.length);
  let o = 0;
  out[o++] = 0x03;
  out[o++] = toB.length;
  out.set(toB, o);
  o += toB.length;
  out[o++] = fromB.length;
  out.set(fromB, o);
  o += fromB.length;
  out.set(payload, o);
  return out;
}

export function decodeFwd(bytes: Uint8Array): { to: string; from: string; payload: Uint8Array } | null {
  if (bytes.length < 3 || bytes[0] !== 0x03) return null;
  const toLen = bytes[1] ?? 0;
  if (bytes.length < 2 + toLen + 1) return null;
  const to = dec.decode(bytes.subarray(2, 2 + toLen));
  const fromLen = bytes[2 + toLen] ?? 0;
  const start = 3 + toLen;
  if (bytes.length < start + fromLen) return null;
  const from = dec.decode(bytes.subarray(start, start + fromLen));
  return { to, from, payload: bytes.subarray(start + fromLen) };
}

export function safeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  const clean = base.replace(/[\u0000-\u001f]/g, "").trim();
  return (clean || "file").slice(0, 180);
}

export const CHUNK_BYTES = 48 * 1024;
export const MAX_FILES = 12;
export const MAX_NOTE = 4000;
export const MAX_TRANSFER_BYTES = 1_500_000_000;
