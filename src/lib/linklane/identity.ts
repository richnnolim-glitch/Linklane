export type DeviceKind = "android" | "windows" | "linux" | "ios" | "mac" | "other";

export type Bond = { id: string; name: string; device: DeviceKind };

const ID_KEY = "linklane-id";
const NAME_KEY = "linklane-name";
const BONDS_KEY = "linklane-bonds";
const LAN_KEY = "linklane-lan";
const WIFI_KEY = "linklane-wifi";
const ROOM_KEY = "linklane-room";

const ADJ = [
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
  "Still",
];
const NOUN = [
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
  "Beacon",
];

const ROOM_ALPHABET = "abcdefghjkmnpqrstuvwxyz";

export function randomName(): string {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)] ?? "Quiet";
  const n = NOUN[Math.floor(Math.random() * NOUN.length)] ?? "Lantern";
  return `${a} ${n}`;
}

export function randomRoom(): string {
  let out = "";
  for (let i = 0; i < 5; i += 1) {
    out += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  }
  return out;
}

export function validRoom(code: string): boolean {
  return /^[a-z]{5}$/.test(code);
}

export function detectDevice(ua = ""): DeviceKind {
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac";
  if (/Linux/i.test(ua)) return "linux";
  return "other";
}

export function deviceLabel(device: DeviceKind): string {
  switch (device) {
    case "android":
      return "Android";
    case "windows":
      return "Windows";
    case "linux":
      return "Linux";
    case "ios":
      return "iPhone";
    case "mac":
      return "Mac";
    default:
      return "Device";
  }
}

export type Boot = {
  id: string;
  name: string;
  device: DeviceKind;
  room: string;
  pair: string;
  lan: string;
  wifiOnly: boolean;
  bonds: Bond[];
};

function readBonds(): Bond[] {
  try {
    const raw = JSON.parse(localStorage.getItem(BONDS_KEY) || "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (row): row is Bond =>
          !!row &&
          typeof row === "object" &&
          typeof (row as Bond).id === "string" &&
          typeof (row as Bond).name === "string",
      )
      .slice(0, 16)
      .map((row) => ({
        id: row.id,
        name: row.name.slice(0, 40),
        device: isDevice(row.device) ? row.device : "other",
      }));
  } catch {
    return [];
  }
}

function isDevice(value: unknown): value is DeviceKind {
  return (
    value === "android" ||
    value === "windows" ||
    value === "linux" ||
    value === "ios" ||
    value === "mac" ||
    value === "other"
  );
}

export function loadBoot(): Boot {
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
    bonds: readBonds(),
  };
}

export function saveName(name: string): void {
  localStorage.setItem(NAME_KEY, name.slice(0, 40));
}

export function saveLan(ip: string): void {
  if (ip) localStorage.setItem(LAN_KEY, ip);
  else localStorage.removeItem(LAN_KEY);
}

export function saveWifiOnly(on: boolean): void {
  localStorage.setItem(WIFI_KEY, on ? "1" : "0");
}

export function saveRoom(room: string): void {
  if (room) sessionStorage.setItem(ROOM_KEY, room);
  else sessionStorage.removeItem(ROOM_KEY);
}

export function saveBonds(bonds: Bond[]): void {
  localStorage.setItem(BONDS_KEY, JSON.stringify(bonds.slice(0, 16)));
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;
  if (size < 1024 * 1024 * 1024) return `${Math.round(size / (1024 * 102.4)) / 10} MB`;
  return `${Math.round(size / (1024 * 1024 * 102.4)) / 10} GB`;
}
