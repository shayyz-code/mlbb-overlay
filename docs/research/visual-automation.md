# Visual Automation Research

Status: detector foundation implemented; production automation not enabled.

## Decision

Use frames already passing through OBS as the primary detector input. OBS Studio
28 and newer includes obs-websocket, and its `GetSourceScreenshot` request can
return a source frame without adding an in-game integration. Keep authentication
enabled and the service on loopback unless the production network is trusted.

The detector must only create a proposal after at least three matching frames at
98% confidence. The operator accepts the proposal before draft state changes.
This avoids silently committing a visually plausible but incorrect result.

## Android and emulator capture

The preferred production path is an emulator or Android device captured as an
OBS source. Android's MediaProjection API is also viable for a dedicated capture
companion, but Android requires explicit user consent and lets the user revoke a
capture session. `adb screenrecord` is suitable for collecting benchmark clips,
not low-latency triggering; it produces MP4 recordings and has a three-minute
limit. `adb exec-out screencap -p` can collect individual development frames.

The system must not read game memory, inject touch input, bypass capture
protections, or call an undocumented game endpoint.

## Hero recognition

Start with OCR of the hero name and fixed draft-slot crops. This needs no shipped
portrait library. An optional local classifier may use operator-captured
references under the ignored `models/` and `captures/` directories. Profiles
must be versioned by game build, language, resolution, and interface scale.

Animated hero posters should not be extracted from the installed game for
redistribution. Modern Android games may receive textures through optimized,
split, fast-follow, or on-demand asset packs, so file extraction is brittle in
addition to the permission problem. Safe options are:

1. crop the live hero presentation from the emulator inside OBS;
2. import an operator-owned pack with written redistribution permission; or
3. keep the original geometric fallback shipped by this repository.

No public MOONTON media license authorizing this repository to redistribute hero
posters was found during this research. Request written permission through the
official MLBB support contact before publishing any extracted or promotional
media.

## Turtle and Lord milestone

Objective events need a separate model and benchmark. Candidate signals are the
kill-feed banner crop, objective icon, team-color treatment, game clock, and
score transition. Require temporal agreement across those signals and expose a
manual correction path. Do not infer an objective kill from audio alone.

Promotion targets:

- draft proposals: at least 99.5% precision, 98% recall, and one-second p95;
- objective proposals: at least 99.9% precision and two-second p95;
- 50 complete drafts and 100 objective events across supported profiles;
- zero automatic state commits until the operator-acceptance workflow ships.

## Primary sources

- [OBS WebSocket project and security guidance](https://github.com/obsproject/obs-websocket)
- [OBS WebSocket protocol](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md)
- [Android MediaProjection capture](https://developer.android.com/media/platform/av-capture)
- [Android Debug Bridge screen recording](https://developer.android.com/tools/adb)
- [Google Play Asset Delivery](https://developer.android.com/guide/playcore/asset-delivery)
- [Official MLBB Google Play listing and support contact](https://play.google.com/store/apps/details?id=com.mobile.legends)
