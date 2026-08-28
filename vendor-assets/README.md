# Operator Asset Packs

This directory is ignored except for this guide. The personal pack lives at
`vendor-assets/mlbb-personal/` and must never be committed or redistributed.

The importer creates a validated manifest containing:

- a stable asset ID and hero ID;
- the relative portrait and optional WebM/MP4 poster paths;
- SHA-256 checksum for each file.

## Local role icons

Role icons are personal operator assets and are never committed. Download the
five official MLBB role PNGs from their attributed source pages, then place
them in one local folder with these exact names:

```text
exp.png
jungle.png
mid.png
gold.png
roam.png
```

Install them into the ignored personal pack and verify the manifest:

```sh
bun run assets:roles --source /absolute/path/to/role-icons \
  --attribution "Source, copyright owner, and personal-use note"
bun run assets:verify
```

The installer validates PNG signatures, records SHA-256 hashes and provenance,
and updates the manifest atomically. The roster uses English text fallbacks
when the local files are unavailable. Do not redistribute or commit the icons.

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

## Synthetic detector dataset

The slot classifier can be trained without collecting or labeling live drafts.
After importing all 133 private portraits, generate close-up pick, ban, empty,
and unknown samples with deterministic face crops, edge fades, team treatments,
blur, and compression:

```sh
bun run detector:synthesize -- \
  --game-build VERSION \
  --attribution "Portrait source and URL" \
  --variants 24 \
  --seed 20260822
```

The command verifies every portrait against the private asset manifest and
writes a balanced dataset to ignored `captures/detector-synthetic/`. It refuses
to overwrite an existing dataset. Use a new output directory for another run.
Neither source portraits nor generated samples belong in the public repository.

After private training and ONNX parity evaluation, package only a model that
passes every release gate:

```sh
bun run detector:release -- \
  --model captures/model-training/RUN/model.onnx \
  --metrics captures/model-training/RUN/metrics.json \
  --output captures/model-release
```

The packager requires 98.5% top-1 accuracy, 97% macro recall, at most 0.5%
unknown false accepts, ONNX parity within 0.001, and a model below 16 MB.

The verified FP32 model is published as
[SHAYYZ MLBB Draft Classifier](https://huggingface.co/shayyzhf/shayyz-mlbb-draft-classifier)
under CC BY 4.0. Install it into the server's ignored default model directory:

```sh
hf download shayyzhf/shayyz-mlbb-draft-classifier \
  --include manifest.json model.onnx \
  --local-dir vendor-assets/mlbb-personal/detector
```

The training dataset remains private. Synthetic holdout results do not replace
the required live replay benchmark, so use proposal mode until the current game
build and OBS profile pass that separate validation.

## Local AI idle posters

Install ComfyUI locally with the `svd_xt_1_1.safetensors` checkpoint and keep it
on loopback. Prepare a deterministic local queue after all portraits exist:

```sh
bun run idle-posters prepare --model-revision svd-xt-1.1 --complete
bun run idle-posters generate --comfy http://127.0.0.1:8188 --limit 1
```

The pipeline uses subtle SVD motion and converts 25 generated frames into a
silent four-second ping-pong VP9 loop. Inspect every poster before broadcast;
use `--force` only when deliberately replacing an existing local result.
