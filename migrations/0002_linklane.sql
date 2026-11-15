-- Ephemeral rendezvous only. Rows expire in seconds or minutes.
-- No accounts, no file bytes, no message text.

create table if not exists link_peers (
  peer_id text primary key,
  name text not null,
  device text not null default 'other',
  net_key text not null default '',
  room_code text not null default '',
  last_seen timestamptz not null default now()
);

create index if not exists link_peers_net_idx on link_peers (net_key);
create index if not exists link_peers_room_idx on link_peers (room_code);

create table if not exists link_signals (
  id bigserial primary key,
  to_peer text not null,
  from_peer text not null,
  kind text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists link_signals_inbox on link_signals (to_peer, id);

create table if not exists link_invites (
  code text primary key,
  host_id text not null,
  host_name text not null,
  host_device text not null,
  guest_id text,
  guest_name text,
  guest_device text,
  created_at timestamptz not null default now()
);

create index if not exists link_invites_host_idx on link_invites (host_id);
