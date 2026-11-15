# Linklane native build paths

This branch is moving Linklane from its hosted browser transport to standalone LAN-native clients.

## Desktop: Windows and Linux

Requirements: Node.js 20+, Rust stable, and the platform prerequisites listed in the Tauri v2 setup guide.

From the repository root:

```bash
npm install
npm run desktop:dev
```

Create a release bundle:

```bash
npm run desktop:build
```

Tauri packages Windows installers (NSIS and MSI) when built on Windows, and Linux DEB/AppImage packages when built on Linux. Build each target on its native operating system. Windows may prompt for private-network firewall access; allow Linklane on trusted private networks. Linux discovery uses mDNS/DNS-SD and UDP broadcast fallback.

## Android

From the repository root, run `npm install` with Node.js 20+. Open `android/` in Android Studio with JDK 17 and Android SDK 35 installed. Sync Gradle and run the `app` configuration on an Android device. The Gradle `preBuild` task runs `npm run lan:android-build` and embeds the React UI into the APK. The Android app uses a native JavaScript bridge and foreground service for LAN discovery and transfers.

## Current shared transport framing

The Android and Rust desktop hosts now use the same LNL2 TCP framing for text and files. File frames include the expected SHA-256 digest; receivers verify the received bytes before raising the incoming-file approval event. Discovery uses `_linklane._tcp.` mDNS plus UDP broadcast port 45821, and TCP port 45822.

## Not release-ready yet

The desktop React shell is currently a standalone LAN interface; the existing hosted React experience has not yet been fully migrated to this native transport. Android currently uses its native screen rather than that React interface. The current LNL2 transport does not yet authenticate device identity, negotiate approval before the sender streams the file, implement transfer cancellation/resume, or enforce aggregate storage quotas. The listeners and router/firewall behavior still need platform-specific hardening. Do not use this build for sensitive transfers on untrusted networks.

No Android, Windows, or Linux build has been executed for this change set yet. The next integration pass must unify the desktop and Android UI behavior, persist and verify cryptographic device identities, add pre-transfer approval and resource limits, then build installers/APKs before device testing.
