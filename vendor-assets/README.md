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

## Animated poster workflow

After installing MLBB and its resources manually, use this local workflow:

```sh
bun run posters template
bun run posters record --serial emulator-5554 --duration 180
bun run posters render --ffmpeg /path/to/ffmpeg
bun run posters render --ffmpeg /path/to/ffmpeg --complete
bun run assets:verify --complete
```

Navigate the game yourself while recording. Set each recording path, hero start
time, and crop in ignored `captures/poster-map.json`. Existing posters are
preserved unless `--force` is explicit; `--complete` requires all 133 heroes.

## Draft-slot reference workflow

Record sessions with `bun run posters record`, then create and fill an ignored
map with `bun run draft-refs template --game-build VERSION`. Set one fixed pick
slot crop plus each hero recording and timestamp, then run:

```sh
bun run draft-refs extract --complete
bun run draft-refs verify --output captures/detector-references/VERSION/pick-art --complete
```

Highlight heroes manually. This workflow never sends input to the game and does
not extract package files. Draft-slot PNGs and their timing map stay local.

## Local AI idle posters

Install ComfyUI locally with the `svd_xt_1_1.safetensors` checkpoint and keep it
on loopback. Prepare a deterministic local queue after all portraits exist:

```sh
bun run idle-posters prepare --model-revision svd-xt-1.1 --complete
```

The pipeline uses subtle SVD motion and converts 25 generated frames into a
silent four-second ping-pong VP9 loop. Inspect every poster before broadcast;
use `--force` only when deliberately replacing an existing local result.
