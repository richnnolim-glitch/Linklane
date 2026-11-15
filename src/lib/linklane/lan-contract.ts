/**
 * LAN discovery wire contract shared by the native host and the React UI.
 *
 * The browser UI must never implement discovery itself. A native adapter
 * (Tauri/Rust on desktop and Android) owns sockets, mDNS and the transfer
 * listener, then forwards validated peer records to the UI.
 */
export const LAN_PROTOCOL_VERSION = 1 as const;
export const LAN_MDNS_SERVICE = "_linklane._tcp.local.";
export const LAN_DISCOVERY_UDP_PORT = 45821;
export const LAN_DISCOVERY_MAX_PACKET_BYTES = 1024;
export const LAN_DEFAULT_TRANSFER_PORT = 45822;
export const LAN_MAX_DEVICE_NAME_LENGTH = 40;

export type LanDeviceKind = "android" | "windows" | "linux" | "other";

export type LanPeerAdvertisement = {
  version: typeof LAN_PROTOCOL_VERSION;
  id: string;
  name: string;
  device: LanDeviceKind;
  port: number;
};

export type LanDiscoveryPacket =
  | { type: "discover"; version: typeof LAN_PROTOCOL_VERSION; id: string }
  | { type: "advertise"; peer: LanPeerAdvertisement };

const DEVICE_KINDS = new Set<string>(["android", "windows", "linux", "other"]);
const DEVICE_ID = /^[a-zA-Z0-9-]{8,64}$/;

function validPort(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 65535;
}

export function validatePeerAdvertisement(value: unknown): LanPeerAdvertisement | null {
  if (!value || typeof value !== "object") return null;
  const peer = value as Record<string, unknown>;
  if (peer.version !== LAN_PROTOCOL_VERSION) return null;
  if (typeof peer.id !== "string" || !DEVICE_ID.test(peer.id)) return null;
  if (typeof peer.name !== "string" || !peer.name.trim()) return null;
  if (peer.name.length > LAN_MAX_DEVICE_NAME_LENGTH) return null;
  if (typeof peer.device !== "string" || !DEVICE_KINDS.has(peer.device)) return null;
  if (!validPort(peer.port)) return null;
  return {
    version: LAN_PROTOCOL_VERSION,
    id: peer.id,
    name: peer.name.replace(/[\\u0000-\\u001f]/g, "").trim(),
    device: peer.device as LanDeviceKind,
    port: peer.port,
  };
}

/** Parse only the tiny discovery envelope; file bytes and private data never belong here. */
export function parseLanDiscoveryPacket(input: string | Uint8Array): LanDiscoveryPacket | null {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  if (bytes.byteLength === 0 || bytes.byteLength > LAN_DISCOVERY_MAX_PACKET_BYTES) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
  if (!decoded || typeof decoded !== "object") return null;
  const packet = decoded as Record<string, unknown>;
  if (packet.version !== LAN_PROTOCOL_VERSION) return null;
  if (packet.type === "discover") {
    if (typeof packet.id !== "string" || !DEVICE_ID.test(packet.id)) return null;
    return { type: "discover", version: LAN_PROTOCOL_VERSION, id: packet.id };
  }
  if (packet.type === "advertise") {
    const peer = validatePeerAdvertisement(packet.peer);
    return peer ? { type: "advertise", peer } : null;
  }
  return null;
}

export function encodeLanDiscoveryPacket(packet: LanDiscoveryPacket): Uint8Array {
  const validated = parseLanDiscoveryPacket(JSON.stringify(packet));
  if (!validated) throw new Error("Invalid Linklane discovery packet.");
  return new TextEncoder().encode(JSON.stringify(validated));
}
