# Operator Asset Packs

This directory is ignored except for this guide. The personal pack lives at
`vendor-assets/mlbb-personal/` and must never be committed or redistributed.

The importer creates a validated manifest containing:

- a stable asset ID and hero ID;
- the relative portrait and optional WebM/MP4 poster paths;
- SHA-256 checksum for each file.

Set `SHAYYZ_ASSET_PACK` only when using a non-default pack location. The server
rejects symbolic links and serves only manifest-listed files. The application
falls back to original geometric placeholders when the private pack is absent.

Run `bun run android:audit` before choosing an acquisition path. A Play Store
emulator cannot provide `adb root`; use manual screen recording as the primary
path. A separate AOSP AVD can provide root for local troubleshooting, but it has
no Play Store and may not run the game. Never inspect game memory, capture
traffic, extract keys, bypass encryption, or automate game input.
