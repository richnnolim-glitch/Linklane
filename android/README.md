# Linklane Android app

This directory contains the first native Android client for the LAN-first Linklane rewrite. It is intentionally independent of the current web deployment so it can be built and tested as an Android app.

## Open and build

1. From the repository root, run `npm install` (Node.js 20+ is required to build the embedded React UI).
2. Open the `android/` directory in Android Studio (Ladybug or newer).
3. Install Android SDK 35 and JDK 17.
4. Let Gradle sync, then run the `app` configuration on two Android devices connected to the same private Wi-Fi. The Gradle `preBuild` task builds and bundles the React UI into the APK.
5. Grant nearby Wi-Fi and notification permissions when prompted. Linklane uses a foreground service while discovery and transfers are active.

No account, cloud service, public-IP lookup, room code or STUN server is used by this Android prototype.

## Current functionality

- mDNS/DNS-SD advertisement and discovery using `_linklane._tcp.`.
- UDP broadcast discovery fallback on port 45821.
- Direct TCP transfer listener, advertised on the discovered port (normally 45822).
- Nearby peer list, text sending and Android document-picker file sending.
- Incoming text/files are staged in app-private cache and require explicit approval before being copied to app-specific external storage.
- Stable local device identifier and multicast lock while discovery runs.

## Important prototype limitations

This is an Android-native MVP, not yet the final production release:

- The Android app now hosts a React interface inside a native WebView bridge. Its Android bridge and desktop Tauri bridge currently have separate implementations, so UI behavior still needs a parity pass.
- The Android and desktop Rust clients now share the initial LNL2 text/file framing and SHA-256 file verification. The TypeScript hosted transport contract remains separate and is not used by these native clients.
- Peer identity is currently a discovery identifier, not a cryptographically authenticated identity. Approval is required for every inbound item, but do not use this prototype on untrusted networks for sensitive files.
- There is no transfer resume, cryptographic peer authentication, pre-transfer receiver approval, aggregate storage quota, multi-file batch UI, persistent trusted-device store, or background transfer recovery yet.
- The listener currently binds to all local interfaces. A production hardening pass must bind only to the active Wi-Fi interface and add authenticated handshakes, request quotas, storage quotas, and integrity verification.
- The app-specific external files directory is used for accepted items. A production UX should use Android's Storage Access Framework to let the user choose a destination.
- Android 13+ notification permission is requested. Android lifecycle, Wi-Fi changes, multicast behavior, OEM battery restrictions and Android 14/15 foreground-service policy still require device testing.

Wi-Fi client isolation, guest networks and VLAN boundaries can prevent peer-to-peer traffic. Linklane cannot bypass those router settings.

## Next Android milestones

1. Add a cryptographic device identity and signed pairing handshake.
2. Add incoming-request quotas and user approval before accepting the payload stream.
3. Add SHA-256 verification, atomic destination writes, cancellation and resumable chunk transfers.
4. Move the transfer protocol into a shared Rust core and bind it to this Activity through JNI/Tauri.
5. Mount the existing React UI into the Android shell after the native transport bridge is stable.
