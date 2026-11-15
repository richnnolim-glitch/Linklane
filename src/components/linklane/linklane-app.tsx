import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Check,
  Download,
  Hash,
  Laptop,
  Link2,
  MessageSquare,
  Monitor,
  Pencil,
  Smartphone,
  Wifi,
  X,
} from "lucide-react";
import { isValidLanIp } from "@/lib/linklane/candidates";
import { LinkEngine, type PeerView, type Snapshot } from "@/lib/linklane/engine";
import {
  deviceLabel,
  formatBytes,
  loadBoot,
  randomRoom,
  saveBonds,
  saveLan,
  saveName,
  saveRoom,
  saveWifiOnly,
  validRoom,
  type Bond,
  type Boot,
  type DeviceKind,
} from "@/lib/linklane/identity";

const emptySnap: Snapshot = {
  status: "connecting",
  peers: [],
  invite: null,
  incoming: [],
  outgoing: null,
  receiving: null,
  finished: [],
  notes: [],
};

const PRESETS = [
  { label: "Android hotspot", ip: "192.168.43.1" },
  { label: "Windows hotspot", ip: "192.168.137.1" },
  { label: "Linux hotspot", ip: "10.42.0.1" },
  { label: "iPhone hotspot", ip: "172.20.10.1" },
];

export function LinklaneApp() {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [snap, setSnap] = useState<Snapshot>(emptySnap);
  const [bonds, setBonds] = useState<Bond[]>([]);
  const [room, setRoom] = useState("");
  const [lan, setLan] = useState("");
  const [lanDraft, setLanDraft] = useState("");
  const [wifiOnly, setWifiOnly] = useState(true);
  const [nameDraft, setNameDraft] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [notice, setNotice] = useState("");
  const [pairOpen, setPairOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const [hotOpen, setHotOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [notePeer, setNotePeer] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [pairError, setPairError] = useState("");
  const [dropFiles, setDropFiles] = useState<File[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const engineRef = useRef<LinkEngine | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<string | null>(null);
  const autoPair = useRef(false);
  const seenFiles = useRef(new Set<string>());

  useEffect(() => {
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

  useEffect(() => {
    if (!boot) return;
    const engine = new LinkEngine({ id: boot.id, name: boot.name, device: boot.device });
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

  useEffect(() => {
    const other = snap.invite?.other;
    if (!other || !boot) return;
    setBonds((prev) => {
      if (prev.some((bond) => bond.id === other.id)) return prev;
      const next = [
        ...prev,
        { id: other.id, name: other.name, device: asDevice(other.device) },
      ].slice(-16);
      saveBonds(next);
      engineRef.current?.setBonds(next.map((bond) => bond.id));
      return next;
    });
  }, [snap.invite, boot]);

  useEffect(() => {
    if (!boot || autoPair.current || boot.pair.length !== 6) return;
    const engine = engineRef.current;
    if (!engine) return;
    autoPair.current = true;
    setJoinCode(boot.pair);
    void engine
      .joinInvite(boot.pair)
      .then((host) => {
        setBonds((prev) => {
          if (prev.some((item) => item.id === host.id)) return prev;
          const next = [
            ...prev,
            { id: host.id, name: host.name, device: asDevice(host.device) },
          ].slice(-16);
          saveBonds(next);
          engine.setBonds(next.map((item) => item.id));
          return next;
        });
        setNotice(`Paired with ${host.name}.`);
      })
      .catch((error: unknown) => {
        setPairError(error instanceof Error ? error.message : "Could not join that code.");
      });
  }, [boot, snap.status]);

  useEffect(() => {
    for (const item of snap.finished) {
      if (seenFiles.current.has(item.id)) continue;
      seenFiles.current.add(item.id);
      item.files.forEach((file, index) => {
        window.setTimeout(() => saveBlob(file.blob, file.name), index * 350);
      });
    }
  }, [snap.finished]);

  useEffect(() => {
    const busy =
      snap.outgoing?.status === "sending" || snap.outgoing?.status === "waiting" || !!snap.receiving;
    if (!busy || !("wakeLock" in navigator)) return;
    let released = false;
    let lock: { release: () => Promise<void> } | null = null;
    void navigator.wakeLock
      .request("screen")
      .then((sent) => {
        if (released) void sent.release();
        else lock = sent;
      })
      .catch(() => {});
    return () => {
      released = true;
      void lock?.release();
    };
  }, [snap.outgoing?.status, snap.receiving]);

  const peers = useMemo(() => {
    const online = new Set(snap.peers.map((peer) => peer.id));
    const offline: PeerView[] = bonds
      .filter((bond) => !online.has(bond.id))
      .map((bond) => ({
        id: bond.id,
        name: bond.name,
        device: bond.device,
        via: "paired",
        link: "offline",
        pathLabel: "Paired · not here right now",
      }));
    return [...snap.peers, ...offline];
  }, [snap.peers, bonds]);

  const stuck = snap.peers.some((peer) => peer.link === "failed");
  const you = boot ? nameDraft || boot.name : "This device";

  function remember(bond: Bond) {
    setBonds((prev) => {
      if (prev.some((item) => item.id === bond.id)) return prev;
      const next = [...prev, bond].slice(-16);
      saveBonds(next);
      engineRef.current?.setBonds(next.map((item) => item.id));
      return next;
    });
  }

  function pickFiles(peerId: string) {
    const peer = peers.find((item) => item.id === peerId);
    if (!peer || peer.link === "offline") return;
    targetRef.current = peerId;
    fileRef.current?.click();
  }

  function openNote(peerId: string) {
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

  function applyRoom(next: string) {
    const code = next.toLowerCase().replace(/[^a-z]/g, "").slice(0, 5);
    setRoom(code);
    if (validRoom(code) || code === "") {
      saveRoom(code);
      engineRef.current?.setRoom(code);
    }
  }

  function applyLan(ip: string) {
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
      remember({ id: host.id, name: host.name, device: asDevice(host.device) });
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

  return (
    <div
      className="flex min-h-dvh flex-col bg-paper text-ink"
      onDragOver={(event) => {
        if (![...event.dataTransfer.types].includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const files = [...event.dataTransfer.files];
        if (!files.length) return;
        const reachable = peers.filter((peer) => peer.link !== "offline");
        if (reachable.length === 1) engineRef.current?.enqueueFiles(reachable[0]!.id, files);
        else setDropFiles(files);
      }}
    >
      <header className="mx-auto flex w-full max-w-3xl items-start justify-between gap-4 px-5 pt-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Mark />
            <div>
              <p className="font-serif text-2xl leading-none font-medium tracking-tight">Linklane</p>
              <p className="mt-1 text-sm text-muted">Windows, Linux, and Android</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm">
            {editingName ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  commitName();
                }}
              >
                <input
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  className="h-11 w-44 rounded-xl border border-line bg-card px-3 text-ink"
                  aria-label="Your device name"
                  autoFocus
                  maxLength={40}
                />
                <button type="submit" className="grid size-11 place-items-center rounded-xl bg-ember-deep text-on-ember">
                  <Check className="size-4" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setNameDraft(you);
                  setEditingName(true);
                }}
                className="inline-flex h-11 items-center gap-2 rounded-xl px-1 text-left"
              >
                <span className="text-muted">You are</span>
                <span className="font-medium">{you}</span>
                <Pencil className="size-3.5 text-muted" />
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            const next = !wifiOnly;
            setWifiOnly(next);
            saveWifiOnly(next);
            engineRef.current?.setWifiOnly(next);
          }}
          className={
            "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-medium " +
            (wifiOnly ? "border-ember bg-ember-deep text-on-ember" : "border-line bg-card text-ink")
          }
        >
          <Wifi className="size-4" />
          {wifiOnly ? "Wi-Fi only" : "Public IP on"}
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-6">
        {snap.status === "offline" ? (
          <p className="mb-4 rounded-2xl border border-line bg-card px-4 py-3 text-sm text-muted">
            Reconnecting to the introduction service. Files still will not be uploaded.
          </p>
        ) : null}
        {stuck ? (
          <button
            type="button"
            onClick={() => setHotOpen(true)}
            className="mb-4 rounded-2xl border border-line bg-card px-4 py-3 text-left text-sm"
          >
            <span className="font-medium">No direct Wi-Fi path yet.</span>{" "}
            <span className="text-muted">
              Open Linklane on the device sharing the hotspot — Android, Windows, or Linux — or enter its
              address.
            </span>
          </button>
        ) : null}
        {room ? (
          <p className="mb-4 text-sm text-muted">
            Room <span className="font-medium text-ink">{room}</span>
            <button type="button" className="ml-3 underline" onClick={() => applyRoom("")}>
              Leave
            </button>
          </p>
        ) : null}

        {peers.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {peers.map((peer) => (
              <li key={peer.id}>
                <PeerCard
                  peer={peer}
                  progress={
                    snap.outgoing?.peerId === peer.id
                      ? snap.outgoing
                      : snap.receiving?.peerId === peer.id
                        ? snap.receiving
                        : null
                  }
                  onSend={() => pickFiles(peer.id)}
                  onNote={() => openNote(peer.id)}
                />
              </li>
            ))}
          </ul>
        )}

        <Activity
          notes={snap.notes}
          finished={snap.finished}
          onCopy={(text) => {
            void navigator.clipboard?.writeText(text);
            setNotice("Copied.");
          }}
        />
      </main>

      <footer className="dock sticky bottom-0 border-t border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl gap-2 overflow-x-auto px-4 py-3">
          <DockButton icon={<Link2 className="size-4" />} label="Pair" onClick={() => setPairOpen(true)} />
          <DockButton icon={<Hash className="size-4" />} label="Room" onClick={() => setRoomOpen(true)} />
          <DockButton icon={<Wifi className="size-4" />} label="Hotspot" onClick={() => setHotOpen(true)} />
          <DockButton
            icon={<Download className="size-4" />}
            label="Install"
            onClick={() => setInstallOpen(true)}
          />
        </div>
      </footer>

      {notice ? (
        <button
          type="button"
          onClick={() => setNotice("")}
          className="fixed inset-x-4 bottom-24 z-30 mx-auto max-w-sm rounded-2xl bg-ink px-4 py-3 text-left text-sm text-paper"
        >
          {notice}
        </button>
      ) : null}

      {dragging ? (
        <div className="pointer-events-none fixed inset-0 z-30 grid place-items-center bg-ink/40 px-6 text-center text-paper">
          <p className="font-serif text-3xl">Drop to send</p>
        </div>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        multiple
        className="sr-only"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          const peerId = targetRef.current;
          if (peerId && files.length) engineRef.current?.enqueueFiles(peerId, files);
        }}
      />

      <Sheet open={pairOpen} onOpenChange={setPairOpen} title="Pair a device">
        <p className="text-sm text-muted">
          Pairing remembers this device. Next time you are both online — any network — you will see each
          other, and the file still prefers Wi-Fi.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void makePair()}
            className="h-12 rounded-xl bg-ember-deep px-4 text-sm font-medium text-on-ember"
          >
            {pairCode ? "New code" : "Show my code"}
          </button>
        </div>
        {pairCode ? (
          <CodeBlock
            label="Read this on the other device"
            value={pairCode.slice(0, 3) + " " + pairCode.slice(3)}
            qr={pageUrl("pair", pairCode)}
          />
        ) : null}
        <label className="mt-5 block text-sm font-medium">
          Or enter a code
          <input
            inputMode="numeric"
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value)}
            className="mt-2 h-12 w-full rounded-xl border border-line bg-paper px-3 tracking-widest"
            placeholder="000 000"
          />
        </label>
        {pairError ? <p className="mt-2 text-sm text-ember-deep">{pairError}</p> : null}
        <button
          type="button"
          onClick={() => void submitJoin()}
          className="mt-3 h-12 w-full rounded-xl border border-line bg-card text-sm font-medium"
        >
          Pair
        </button>
      </Sheet>

      <Sheet
        open={roomOpen}
        onOpenChange={(open) => {
          setRoomOpen(open);
          if (open && !validRoom(room)) {
            const code = randomRoom();
            applyRoom(code);
          }
        }}
        title="A room for right now"
      >
        <p className="text-sm text-muted">
          Use a room when the devices do not share a public address — a phone on mobile data next to a
          laptop, or a hotspot that splits IPv4 and IPv6. The bytes still go over Wi-Fi if a local path
          exists.
        </p>
        {validRoom(room) ? (
          <CodeBlock label="Room" value={room} qr={pageUrl("room", room)} />
        ) : null}
        <label className="mt-4 block text-sm font-medium">
          Join a room
          <input
            value={room}
            onChange={(event) => applyRoom(event.target.value)}
            className="mt-2 h-12 w-full rounded-xl border border-line bg-paper px-3 tracking-widest lowercase"
            placeholder="abcde"
            maxLength={5}
          />
        </label>
        <button
          type="button"
          onClick={() => applyRoom(randomRoom())}
          className="mt-3 h-12 w-full rounded-xl bg-ember-deep text-sm font-medium text-on-ember"
        >
          New room
        </button>
      </Sheet>

      <Sheet open={hotOpen} onOpenChange={setHotOpen} title="Whoever is sharing">
        <p className="text-sm text-muted">
          Linklane already tries the usual hotspot addresses, so it does not matter whether the Android
          phone, the Windows PC, or the Linux machine is the one sharing. If the link still fails, type the
          Wi-Fi address of that device — the gateway if it is sharing, or its own address if it joined.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.ip}
              type="button"
              onClick={() => applyLan(preset.ip)}
              className="h-11 rounded-full border border-line bg-card px-3 text-sm"
            >
              {preset.label}
            </button>
          ))}
        </div>
        <label className="mt-4 block text-sm font-medium">
          Wi-Fi address
          <input
            value={lanDraft}
            onChange={(event) => setLanDraft(event.target.value)}
            className="mt-2 h-12 w-full rounded-xl border border-line bg-paper px-3"
            placeholder="192.168.43.1"
            inputMode="decimal"
          />
        </label>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => applyLan(lanDraft)}
            className="h-12 flex-1 rounded-xl bg-ember-deep text-sm font-medium text-on-ember"
          >
            Use this address
          </button>
          <button
            type="button"
            onClick={() => applyLan("")}
            className="h-12 rounded-xl border border-line px-4 text-sm"
          >
            Automatic
          </button>
        </div>
        {lan ? <p className="mt-3 text-sm text-muted">Pinned to {lan}.</p> : null}
      </Sheet>

      <Sheet open={installOpen} onOpenChange={setInstallOpen} title="Install on this system">
        <p className="text-sm text-muted">
          One app, installed from the browser. There is no separate store download. Keep it open on the
          device that is sharing the hotspot while files move.
        </p>
        <ol className="mt-4 grid gap-3">
          <InstallStep
            icon={<Monitor className="size-5" />}
            title="Windows"
            body="Chrome or Edge: use the install icon in the address bar, then Install Linklane. It opens in its own window."
          />
          <InstallStep
            icon={<Laptop className="size-5" />}
            title="Linux"
            body="Chrome, Chromium, or Edge: menu, then Install Linklane or Install page as app."
          />
          <InstallStep
            icon={<Smartphone className="size-5" />}
            title="Android"
            body="Chrome menu, then Install app or Add to Home screen. Pin it on the phone that shares the connection."
          />
        </ol>
      </Sheet>

      <Sheet open={noteOpen} onOpenChange={setNoteOpen} title="Send a note">
        <textarea
          value={noteText}
          onChange={(event) => setNoteText(event.target.value)}
          maxLength={4000}
          rows={5}
          className="mt-1 w-full resize-none rounded-xl border border-line bg-paper p-3 text-sm"
          placeholder="A line of text. It is not stored on the server."
        />
        <button
          type="button"
          onClick={() => void submitNote()}
          className="mt-3 h-12 w-full rounded-xl bg-ember-deep text-sm font-medium text-on-ember"
        >
          Send
        </button>
      </Sheet>

      <Dialog.Root open={snap.incoming.length > 0}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
          {snap.incoming[0] ? (
            <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-dvh overflow-y-auto rounded-t-3xl border-t border-line bg-card p-5 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border">
              <Dialog.Title className="font-serif text-2xl">Incoming</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted">
                From {snap.incoming[0].fromName}
              </Dialog.Description>
              <ul className="mt-4 grid gap-2">
                {snap.incoming[0].files.map((file) => (
                  <li key={file.name + String(file.size)} className="rounded-xl border border-line px-3 py-3 text-sm">
                    <p className="font-medium">{file.name}</p>
                    <p className="text-muted">{formatBytes(file.size)}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => engineRef.current?.respond(snap.incoming[0]!.id, false)}
                  className="h-12 flex-1 rounded-xl border border-line text-sm font-medium"
                >
                  Decline
                </button>
                <button
                  type="button"
                  onClick={() => engineRef.current?.respond(snap.incoming[0]!.id, true)}
                  className="h-12 flex-1 rounded-xl bg-ember-deep text-sm font-medium text-on-ember"
                >
                  Accept
                </button>
              </div>
            </Dialog.Content>
          ) : null}
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={!!dropFiles} onOpenChange={(open) => !open && setDropFiles(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border-t border-line bg-card p-5 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border">
            <Dialog.Title className="font-serif text-2xl">Send to</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted">
              {dropFiles?.length ?? 0} file{(dropFiles?.length ?? 0) === 1 ? "" : "s"}
            </Dialog.Description>
            <ul className="mt-4 grid gap-2">
              {peers
                .filter((peer) => peer.link !== "offline")
                .map((peer) => (
                  <li key={peer.id}>
                    <button
                      type="button"
                      className="flex h-12 w-full items-center justify-between rounded-xl border border-line px-3 text-sm"
                      onClick={() => {
                        if (dropFiles) engineRef.current?.enqueueFiles(peer.id, dropFiles);
                        setDropFiles(null);
                      }}
                    >
                      {peer.name}
                      <span className="text-muted">{peer.pathLabel}</span>
                    </button>
                  </li>
                ))}
            </ul>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
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

function pageUrl(key: "pair" | "room", value: string): string {
  if (typeof window === "undefined") return value;
  const url = new URL(window.location.href);
  url.searchParams.set(key, value);
  return url.toString();
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="size-10 text-ember" aria-hidden>
      <rect width="32" height="32" rx="10" fill="currentColor" />
      <g className="text-on-ember" fill="currentColor" stroke="currentColor">
        <circle cx="10" cy="16" r="3" stroke="none" />
        <circle cx="22" cy="16" r="3" stroke="none" />
        <path d="M13 16h6" strokeWidth="2" fill="none" />
      </g>
    </svg>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
      <div className="relative grid size-48 place-items-center">
        <span className="radar-ring absolute inset-0 rounded-full border border-ember" />
        <span className="radar-ring radar-ring-2 absolute inset-0 rounded-full border border-ember" />
        <span className="radar-ring radar-ring-3 absolute inset-0 rounded-full border border-ember" />
        <span className="relative grid size-16 place-items-center rounded-full bg-ember-deep text-on-ember">
          <Wifi className="size-7" />
        </span>
      </div>
      <h1 className="mt-6 max-w-sm font-serif text-3xl leading-tight font-medium">
        Open Linklane on the other device
      </h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
        Same Wi-Fi, or a hotspot. It does not matter which device is sharing — the Android phone, the
        Windows PC, or the Linux machine. Files go device to device. They are not uploaded.
      </p>
    </div>
  );
}

function PeerCard({
  peer,
  progress,
  onSend,
  onNote,
}: {
  peer: PeerView;
  progress: Snapshot["outgoing"];
  onSend: () => void;
  onNote: () => void;
}) {
  const offline = peer.link === "offline";
  return (
    <div className="flex items-stretch gap-2 rounded-2xl border border-line bg-card p-3">
      <button
        type="button"
        disabled={offline}
        onClick={onSend}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 text-left disabled:opacity-60"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-paper text-ink">
          <DeviceGlyph device={peer.device} />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{peer.name}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
            <Dot link={peer.link} />
            {deviceLabel(peer.device)} · {peer.pathLabel}
          </span>
          {progress && progress.status !== "done" ? (
            <span className="mt-2 block">
              <span className="mb-1 block text-xs text-muted">
                {progress.status === "waiting"
                  ? "Waiting for them to accept"
                  : progress.status === "declined"
                    ? "Declined"
                    : progress.status === "failed"
                      ? progress.detail || "Stopped"
                      : `${progress.files[progress.fileIndex]?.name ?? "File"}`}
              </span>
              <span className="block h-1.5 overflow-hidden rounded-full bg-line">
                <span
                  className="block h-full bg-ember"
                  style={{ width: `${percent(progress)}%` }}
                />
              </span>
            </span>
          ) : null}
        </span>
      </button>
      <button
        type="button"
        disabled={offline}
        onClick={onNote}
        className="grid size-12 shrink-0 place-items-center rounded-xl border border-line disabled:opacity-40"
        aria-label={`Send a note to ${peer.name}`}
      >
        <MessageSquare className="size-4" />
      </button>
    </div>
  );
}

function percent(progress: NonNullable<Snapshot["outgoing"]>): number {
  const files = progress.files.length || 1;
  const part = progress.count ? progress.seq / progress.count : 0;
  return Math.max(0, Math.min(100, Math.round(((progress.fileIndex + part) / files) * 100)));
}

function Dot({ link }: { link: PeerView["link"] }) {
  const on = link === "wifi" || link === "relay";
  return (
    <span
      className={"inline-block size-2 rounded-full " + (on ? "bg-ember" : link === "failed" ? "bg-ember-deep" : "bg-line")}
    />
  );
}

function DeviceGlyph({ device }: { device: DeviceKind }) {
  if (device === "android" || device === "ios") return <Smartphone className="size-5" />;
  if (device === "linux" || device === "windows" || device === "mac") return <Laptop className="size-5" />;
  return <Monitor className="size-5" />;
}

function DockButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-medium"
    >
      {icon}
      {label}
    </button>
  );
}

function Sheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-dvh overflow-y-auto rounded-t-3xl border-t border-line bg-card p-5 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border">
          <div className="mb-3 flex items-start justify-between gap-3">
            <Dialog.Title className="font-serif text-2xl leading-tight">{title}</Dialog.Title>
            <Dialog.Close className="grid size-11 place-items-center rounded-full border border-line" aria-label="Close">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CodeBlock({ label, value, qr }: { label: string; value: string; qr: string }) {
  return (
    <div className="mt-4 flex items-center gap-4 rounded-2xl border border-line bg-paper p-3">
      <Qr text={qr} />
      <div>
        <p className="text-sm text-muted">{label}</p>
        <p className="font-serif text-3xl tracking-wide">{value}</p>
      </div>
    </div>
  );
}

function Qr({ text }: { text: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let cancel = false;
    void import("qrcode")
      .then((mod) => {
        const api = (mod.default ?? mod) as {
          toDataURL: (value: string, opts?: object) => Promise<string>;
        };
        return api.toDataURL(text, {
          margin: 1,
          width: 280,
          color: { dark: "#1a1814", light: "#fffdf8" },
        });
      })
      .then((data) => {
        if (!cancel) setUrl(data);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [text]);
  if (!url) return <div className="size-24 rounded-xl bg-line" />;
  return <img src={url} alt="" className="size-24 rounded-xl" />;
}

function InstallStep({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <li className="flex gap-3 rounded-2xl border border-line bg-paper p-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-card">{icon}</span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="mt-1 block text-sm leading-relaxed text-muted">{body}</span>
      </span>
    </li>
  );
}

function Activity({
  notes,
  finished,
  onCopy,
}: {
  notes: Snapshot["notes"];
  finished: Snapshot["finished"];
  onCopy: (text: string) => void;
}) {
  if (!notes.length && !finished.length) return null;
  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium text-muted">Recent</h2>
      <ul className="mt-2 grid gap-2">
        {notes.map((note) => (
          <li key={note.id} className="rounded-2xl border border-line bg-card px-4 py-3">
            <p className="text-xs text-muted">{note.incoming ? `From ${note.peerName}` : "Sent"}</p>
            <p className="mt-1 text-sm whitespace-pre-wrap">{note.text}</p>
            <button type="button" className="mt-2 text-sm font-medium text-ember-deep" onClick={() => onCopy(note.text)}>
              Copy
            </button>
          </li>
        ))}
        {finished.map((item) => (
          <li key={item.id} className="rounded-2xl border border-line bg-card px-4 py-3">
            <p className="text-xs text-muted">From {item.peerName}</p>
            <ul className="mt-2 grid gap-2">
              {item.files.map((file) => (
                <li key={file.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full bg-ember-deep px-3 text-on-ember"
                    onClick={() => saveBlob(file.blob, file.name)}
                  >
                    <Download className="size-4" />
                    Save
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
