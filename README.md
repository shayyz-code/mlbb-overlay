# SHAYYZ MLBB OVERLAY

A macOS-first, Bun and TypeScript broadcast overlay for Mobile Legends: Bang Bang tournaments in OBS Studio.

> This is an unofficial community project. It is not endorsed by or affiliated with MOONTON Games. Mobile Legends: Bang Bang and its media remain the property of their respective owners.

## Current milestone

The first SHAYYZ release rebuilds the draft workflow with:

- a fast manual draft controller;
- a transparent 1920x1080 OBS Browser Source overlay;
- a configurable current-standard ten-ban phase sequence;
- typed state, undo, reset, timers, and real-time synchronization;
- centralized broadcast-esports theming;
- an opt-in visual draft detector beta.

Turtle and Lord visual event detection is the next milestone.

## Development

Requirements: macOS, Bun 1.3 or newer, and OBS Studio 28 or newer.

```sh
bun install
bun run dev
```

Open the control dashboard at `http://127.0.0.1:3000/control/draft` and add `http://127.0.0.1:3000/overlay/draft` to OBS as a 1920x1080 Browser Source.

## Assets

The public repository does not ship extracted game resources. Development uses original placeholders until an operator imports an asset pack with documented permission. See [vendor-assets/README.md](vendor-assets/README.md).

## Attribution and license

The original non-empty source snapshot is attributed to FalseJL. The SHAYYZ implementation is copyright Aung Min Khant. Both are distributed under the repository's free-use/modification/no-resale terms; third-party media is excluded. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
