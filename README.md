# SHAYYZ MLBB OVERLAY

A macOS-first, Bun and TypeScript broadcast overlay for Mobile Legends: Bang Bang tournaments in OBS Studio.

> This is an unofficial community project. It is not endorsed by or affiliated with MOONTON Games. Mobile Legends: Bang Bang and its media remain the property of their respective owners.

## Current release

The first SHAYYZ release rebuilds the draft workflow with:

- a fast manual draft controller;
- a transparent 1920x1080 OBS Browser Source overlay;
- a configurable current-standard ten-ban phase sequence;
- typed state, undo, reset, timers, and real-time synchronization;
- centralized broadcast-esports theming;
- media-free geometric hero placeholders.

Visual draft detection is being developed as an opt-in beta. Turtle and Lord
event detection remains a later milestone and is not presented as production
ready.

## Development

Requirements: macOS, Bun 1.3 or newer, and OBS Studio 28 or newer.

```sh
bun install
bun run build
bun run start
```

Open the control dashboard at `http://127.0.0.1:3000/control/draft`. Add
`http://127.0.0.1:3000/overlay/draft` to OBS as a 1920x1080 Browser Source.
The OBS page has a transparent background and updates in real time.

For development with hot reload, run `bun run dev`. Use `bun run check` before
opening a pull request.

To control the overlay from another device, bind `SHAYYZ_HOST` to a LAN address
and set a strong `SHAYYZ_CONTROL_TOKEN`. Loopback operation does not require a
token.

## Assets

The public repository does not ship extracted game resources. Development uses original placeholders until an operator imports an asset pack with documented permission. See [vendor-assets/README.md](vendor-assets/README.md).

## Attribution and license

The original non-empty source snapshot is attributed to FalseJL and preserved
through the `falsejl-v4.1-import` tag and provenance manifest. The maintained
SHAYYZ implementation is copyright Aung Min Khant. Both are distributed under
the repository's free-use/modification/no-resale terms; third-party media is
excluded. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
