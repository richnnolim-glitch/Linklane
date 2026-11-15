# Linklane LAN-first implementation

## Product target

Linklane is a standalone local-network sharing app for Android, Windows and Linux. Two devices on the same private LAN should discover one another automatically, then exchange text and files directly. No account, cloud relay, public-IP discovery, room code or manual IP entry is required for the normal path.

## Runtime decision

The existing React UI can remain the presentation layer, but browser JavaScript cannot own the required LAN sockets or advertise a service reliably. The app needs a native host. The desktop host now has a Tauri 2/Rust implementation with a standalone React LAN interface. Android currently has a Kotlin foreground-service host and native screen. Both native clients use the initial LNL2 TCP framing for text and files, including SHA-256 file verification; Android and desktop discovery use mDNS with UDP broadcast fallback. The Android UI and desktop React UI are still separate, and the old hosted React LinkEngine has not yet been replaced.

The React layer talks to the host through a narrow adapter. It must not fall back to the existing hosted signaling server when the native bridge is unavailable.

## LAN protocol v1

- DNS-SD service: `_linklane._tcp.local.`
- UDP discovery fallback: broadcast on port `45821`.
- TCP transfer/control listener: advertise its dynamically selected port (default `45822`).
- Discovery payloads contain only protocol version, stable device ID, display name, device kind and listening port.
- Discovery packets are capped at 1 KiB. Unknown protocol versions, invalid IDs, unsupported device kinds and invalid ports are rejected.
- File contents, text contents, access tokens and trust secrets are never sent in discovery packets.
- mDNS and UDP broadcast are discovery mechanisms only. Transfers go directly to the peer's LAN address over the advertised TCP listener.

The TypeScript contract in `src/lib/linklane/lan-contract.ts` is the UI/native boundary and the initial wire-format reference. The Rust implementation must have matching serialization and validation tests.

## Trust and transfer requirements

1. A newly discovered device is visible but cannot silently write files.
2. First contact requires explicit approval on the receiving device. Trust is stored locally against the peer's stable device ID and a cryptographic public-key fingerprint, not just its display name or IP address.
3. Subsequent auto-accept is an explicit per-device setting and is off by default.
4. Every transfer is bounded by configured file-count and total-byte limits, writes to a temporary file, verifies the final byte count and SHA-256 digest, then atomically moves the file into the destination.
5. Interrupted transfers must fail closed or resume from verified chunks. Missing chunks must never be treated as a completed file.
6. Text messages use the same authenticated peer connection and have a strict size limit.
7. Bind the listener to LAN interfaces only. Do not expose it to the public internet. Validate every request and rate-limit unauthenticated handshakes.

## Migration phases

### Phase 1 — native host foundation (in progress)
- Define the versioned discovery packet contract.
- Add a Tauri desktop host, standalone React LAN screen, mDNS and UDP discovery, and direct TCP text/file commands.
- Add the Android foreground service, mDNS/UDP discovery, native screen, and matching LNL2 text/file framing.
- Verify file payload SHA-256 before surfacing an incoming-file request.
- Remaining: stable authenticated identity on both platforms, peer expiry, native UI parity, and a single shared implementation rather than two host implementations.

### Phase 2 — secure direct transfer (not complete)
- Add authenticated TCP control and cryptographic peer identity.
- Obtain receiver approval before the sender transmits file bytes.
- Add aggregate storage/request quotas, progress, cancellation, resume and atomic destination writes.
- Keep the SHA-256 verification already present in the native file framing.

### Phase 3 — remove hosted transport
- Replace `LinkEngine` with a transport adapter backed by native commands.
- Remove room codes, public-IP grouping, STUN, WebRTC signaling and the `/api/link` polling route from the standalone app.
- Retain the old hosted mode only if a separately supported web demo is intentionally kept.

### Phase 4 — packaging and validation
- Android: request nearby-Wi-Fi/multicast permissions as needed, hold a multicast lock while discovery is active, handle app pause/resume and foreground transfer lifecycle.
- Windows: document and test private-network firewall access.
- Linux: test with Avahi/mDNS where available and UDP fallback where it is not.
- Test same-router, phone hotspot, guest Wi-Fi, client-isolated Wi-Fi, sleep/resume, large files and interrupted transfers.

## Known network limitation

A guest network, VLAN or access point with client isolation can block peer-to-peer traffic. Linklane should show a clear “devices cannot reach each other on this Wi-Fi” state; it must not silently route private transfers through a cloud service.
\n\n## Build status\n\nNative build instructions are in `docs/NATIVE-BUILD.md`. The Tauri desktop host and Android project have not yet been compiled or exercised on devices. Keep the pull request in draft until the native builds, cross-platform protocol compatibility, UI integration, and security requirements are completed.\n