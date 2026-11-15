# Linklane LAN-first implementation

## Product target

Linklane is a standalone local-network sharing app for Android, Windows and Linux. Two devices on the same private LAN should discover one another automatically, then exchange text and files directly. No account, cloud relay, public-IP discovery, room code or manual IP entry is required for the normal path.

## Runtime decision

The existing React UI can remain the presentation layer, but browser JavaScript cannot own the required LAN sockets or advertise a service reliably. The app needs a native host. The planned host boundary is Tauri 2 with a Rust networking core shared by desktop and Android. Android-specific lifecycle and Wi-Fi multicast handling must be implemented natively; desktop packaging must include Windows and Linux firewall/network guidance.

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

### Phase 1 — contract and native boundary
- Define and test the versioned discovery packet contract.
- Add the Tauri host and Rust networking crate.
- Implement mDNS discovery with UDP broadcast fallback and peer expiry.
- Expose native commands/events to React.

### Phase 2 — direct transfer
- Add authenticated TCP control and file streaming.
- Add receive approval, progress, cancellation, hashes and safe temporary-file handling.
- Move text sharing off the WebRTC data channel.

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
