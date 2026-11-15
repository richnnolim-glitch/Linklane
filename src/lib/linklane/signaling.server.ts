/**
 * Presence + WebRTC signaling. File bytes never land here.
 * Devices on one public IP (a normal Wi-Fi, or a hotspot and its clients)
 * share a net key. Rooms and pair codes cover the cases where those IPs differ.
 */
import { createHash, randomInt } from "node:crypto";
import { z } from "zod";
import { getSql, type Sql } from "@/lib/db";

const ID = z.string().regex(/^[a-zA-Z0-9-]{8,64}$/);
const DEVICE = z.enum(["android", "windows", "linux", "ios", "mac", "other"]);
const NAME = z.string().max(40);

const signalSchema = z.object({
  op: z.literal("signal"),
  from: ID,
  to: ID,
  kind: z.enum(["offer", "answer", "ice"]),
  payload: z.unknown().refine((v) => v !== undefined && JSON.stringify(v).length <= 48_000, {
    message: "payload too large",
  }),
});

const leaveSchema = z.object({ op: z.literal("leave"), peer: ID });
const clearSchema = z.object({ op: z.literal("clear"), peer: ID });
const inviteSchema = z.object({
  op: z.literal("invite"),
  peer: ID,
  name: NAME,
  device: DEVICE,
});
const joinSchema = z.object({
  op: z.literal("join"),
  peer: ID,
  name: NAME,
  device: DEVICE,
  code: z.string().regex(/^\d{6}$/),
});

const postSchema = z.discriminatedUnion("op", [
  signalSchema,
  leaveSchema,
  clearSchema,
  inviteSchema,
  joinSchema,
]);

const PEER_TTL = "35 seconds";
const SIGNAL_TTL = "60 seconds";
const INVITE_TTL = "10 minutes";

export type ServerPeer = {
  id: string;
  name: string;
  device: string;
  sameNet: boolean;
  sameRoom: boolean;
  paired: boolean;
};

export type ServerInvite = {
  code: string;
  role: "host" | "guest";
  other: { id: string; name: string; device: string } | null;
} | null;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function clientIp(request: Request): string {
  const h = request.headers;
  const cf = h.get("cf-connecting-ip")?.trim();
  if (cf) return strip(cf);
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return strip(first);
  }
  const real = h.get("x-real-ip")?.trim();
  if (real) return strip(real);
  return "local";
}

function strip(ip: string): string {
  return ip.replace(/^::ffff:/i, "");
}

function netKey(ip: string): string {
  return createHash("sha256").update(`linklane|v1|${ip}`).digest("hex").slice(0, 24);
}

function cleanName(name: string): string {
  return name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 40) || "Device";
}

async function prune(sql: Sql) {
  await sql.query(`delete from link_signals where created_at < now() - interval '${SIGNAL_TTL}'`);
  await sql.query(`delete from link_peers where last_seen < now() - interval '${PEER_TTL}'`);
  await sql.query(`delete from link_invites where created_at < now() - interval '${INVITE_TTL}'`);
}

async function touch(
  sql: Sql,
  peer: string,
  name: string,
  device: string,
  net: string,
  room: string,
) {
  await sql.query(
    `insert into link_peers (peer_id, name, device, net_key, room_code, last_seen)
     values ($1, $2, $3, $4, $5, now())
     on conflict (peer_id)
     do update set name = excluded.name, device = excluded.device, net_key = excluded.net_key,
                   room_code = excluded.room_code, last_seen = now()`,
    [peer, name, device, net, room],
  );
}

async function loadInvite(sql: Sql, peer: string): Promise<ServerInvite> {
  const rows = await sql.query<{
    code: string;
    host_id: string;
    host_name: string;
    host_device: string;
    guest_id: string | null;
    guest_name: string | null;
    guest_device: string | null;
  }>(
    `select code, host_id, host_name, host_device, guest_id, guest_name, guest_device
     from link_invites
     where (host_id = $1 or guest_id = $1)
       and created_at > now() - interval '${INVITE_TTL}'
     order by created_at desc
     limit 1`,
    [peer],
  );
  const row = rows[0];
  if (!row) return null;
  const role = row.host_id === peer ? "host" : "guest";
  const other =
    role === "host"
      ? row.guest_id
        ? { id: row.guest_id, name: row.guest_name || "Device", device: row.guest_device || "other" }
        : null
      : { id: row.host_id, name: row.host_name, device: row.host_device };
  return { code: row.code, role, other };
}

async function handleGet(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parsed = z
    .object({
      peer: ID,
      name: z.string().max(40).default(""),
      device: DEVICE.default("other"),
      room: z.string().max(8).default(""),
      bonds: z.string().max(2000).default(""),
      since: z.coerce.number().int().min(0).default(0),
    })
    .safeParse({
      peer: url.searchParams.get("peer"),
      name: url.searchParams.get("name") ?? "",
      device: url.searchParams.get("device") ?? "other",
      room: url.searchParams.get("room") ?? "",
      bonds: url.searchParams.get("bonds") ?? "",
      since: url.searchParams.get("since") ?? 0,
    });
  if (!parsed.success) return json({ error: "invalid query" }, 400);

  const room = /^[a-z]{5}$/.test(parsed.data.room) ? parsed.data.room : "";
  const name = cleanName(parsed.data.name);
  const bondIds = parsed.data.bonds
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-zA-Z0-9-]{8,64}$/.test(s))
    .slice(0, 16);
  const net = netKey(clientIp(request));
  const sql = await getSql();
  if (parsed.data.since === 0 || Math.random() < 0.02) await prune(sql);
  await touch(sql, parsed.data.peer, name, parsed.data.device, net, room);

  const bondParam = bondIds.length ? bondIds.join(",") : "__none__";
  const rows = await sql.query<{
    peer_id: string;
    name: string;
    device: string;
    net_key: string;
    room_code: string;
  }>(
    `select peer_id, name, device, net_key, room_code
     from link_peers
     where last_seen > now() - interval '${PEER_TTL}'
       and peer_id <> $1
       and (
         net_key = $2
         or ($3 <> '' and room_code = $3)
         or peer_id = any(string_to_array($4, ','))
       )
     order by name
     limit 24`,
    [parsed.data.peer, net, room, bondParam],
  );

  const signals = await sql.query<{
    id: number | string;
    from_peer: string;
    kind: "offer" | "answer" | "ice";
    payload: unknown;
  }>(
    `select id, from_peer, kind, payload
     from link_signals
     where to_peer = $1 and id > $2
     order by id
     limit 200`,
    [parsed.data.peer, parsed.data.since],
  );

  const peers: ServerPeer[] = rows.map((r) => ({
    id: r.peer_id,
    name: r.name,
    device: r.device,
    sameNet: r.net_key === net,
    sameRoom: room !== "" && r.room_code === room,
    paired: bondIds.includes(r.peer_id),
  }));

  return json({
    peers,
    signals: signals.map((s) => ({
      id: typeof s.id === "number" ? s.id : Number(s.id),
      from: s.from_peer,
      kind: s.kind,
      payload: typeof s.payload === "string" ? JSON.parse(s.payload) : s.payload,
    })),
    invite: await loadInvite(sql, parsed.data.peer),
  });
}

async function handlePost(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid request" }, 400);
  const msg = parsed.data;
  const sql = await getSql();

  if (msg.op === "signal") {
    await sql.query(
      `insert into link_signals (to_peer, from_peer, kind, payload)
       values ($1, $2, $3, $4::jsonb)`,
      [msg.to, msg.from, msg.kind, JSON.stringify(msg.payload)],
    );
    return json({ ok: true });
  }

  if (msg.op === "leave") {
    await sql.query(`delete from link_peers where peer_id = $1`, [msg.peer]);
    return json({ ok: true });
  }

  if (msg.op === "clear") {
    await sql.query(`delete from link_signals where to_peer = $1 or from_peer = $1`, [msg.peer]);
    return json({ ok: true });
  }

  if (msg.op === "invite") {
    await sql.query(`delete from link_invites where host_id = $1`, [msg.peer]);
    let code = "";
    for (let i = 0; i < 6; i += 1) {
      code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const clash = await sql.query<{ code: string }>(`select code from link_invites where code = $1`, [
        code,
      ]);
      if (!clash.length) break;
    }
    await sql.query(
      `insert into link_invites (code, host_id, host_name, host_device)
       values ($1, $2, $3, $4)`,
      [code, msg.peer, cleanName(msg.name), msg.device],
    );
    return json({ code });
  }

  const rows = await sql.query<{
    host_id: string;
    host_name: string;
    host_device: string;
    guest_id: string | null;
  }>(
    `select host_id, host_name, host_device, guest_id
     from link_invites
     where code = $1 and created_at > now() - interval '${INVITE_TTL}'`,
    [msg.code],
  );
  const row = rows[0];
  if (!row) return json({ error: "That code is not active." }, 404);
  if (row.host_id === msg.peer) return json({ error: "Use this code on the other device." }, 400);
  if (row.guest_id && row.guest_id !== msg.peer) return json({ error: "That code was already used." }, 409);
  await sql.query(
    `update link_invites set guest_id = $1, guest_name = $2, guest_device = $3 where code = $4`,
    [msg.peer, cleanName(msg.name), msg.device, msg.code],
  );
  return json({
    host: { id: row.host_id, name: row.host_name, device: row.host_device },
  });
}

export async function handleLink(request: Request): Promise<Response> {
  try {
    if (request.method === "GET") return await handleGet(request);
    if (request.method === "POST") return await handlePost(request);
    return json({ error: "method not allowed" }, 405);
  } catch (error) {
    console.error("[linklane] signaling error:", error);
    return json({ error: "signaling failed" }, 500);
  }
}
