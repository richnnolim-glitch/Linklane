/** Usual gateway addresses for phone, Windows, and Linux hotspots. */
export const HOTSPOT_GATEWAYS = [
  "192.168.43.1",
  "192.168.49.1",
  "192.168.119.1",
  "192.168.225.1",
  "192.168.137.1",
  "172.20.10.1",
  "10.42.0.1",
  "10.0.0.1",
  "192.168.1.1",
  "192.168.0.1",
];

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export function isPrivateIpv4(ip: string): boolean {
  if (!IPV4.test(ip)) return false;
  const parts = ip.split(".").map(Number);
  if (parts.some((n) => Number.isNaN(n) || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export function isValidLanIp(ip: string): boolean {
  if (!isPrivateIpv4(ip)) return false;
  const [a] = ip.split(".").map(Number);
  return a !== 127 && a !== 0;
}

function partsOf(line: string): string[] | null {
  const raw = line.trim().replace(/^a=/, "");
  if (!raw.startsWith("candidate:")) return null;
  const parts = raw.split(" ");
  if (parts.length < 8) return null;
  return parts;
}

export function candidateType(line: string): string | null {
  const parts = partsOf(line);
  if (!parts) return null;
  const i = parts.indexOf("typ");
  return i >= 0 ? (parts[i + 1] ?? null) : null;
}

/** Drop public-IP candidates so a hotspot does not hairpin file setup onto mobile data. */
export function filterSdp(sdp: string, wifiOnly: boolean): string {
  if (!wifiOnly || !sdp) return sdp;
  const nl = sdp.includes("\r\n") ? "\r\n" : "\n";
  return sdp
    .split(/\r?\n/)
    .filter((line) => {
      if (!line.trim()) return true;
      const typ = candidateType(line);
      if (!typ) return true;
      return typ === "host" || typ === "prflx";
    })
    .join(nl);
}

export function shouldForwardCandidate(candidate: string, wifiOnly: boolean): boolean {
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
export function expandHostCandidate(candidate: string, extraIps: string[]): string[] {
  const parts = partsOf(candidate);
  if (!parts || candidateType(candidate) !== "host") return [];
  const basePri = Number(parts[3]);
  const out: string[] = [];
  const seen = new Set<string>();
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
