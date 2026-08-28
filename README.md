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
- local-only portraits, animated posters, cues, and opt-in hero voices with geometric fallbacks.

Visual draft detection is being developed as an opt-in beta. Turtle and Lord
event detection remains a later milestone and is not presented as production
ready.

## Tournament draft order

The manual controller follows the standard MLBB ten-ban tournament sequence:

1. Opening bans: Blue, Red, Blue, Red, Blue, Red.
2. First picks: Blue 1; Red 1-2; Blue 2-3; Red 3.
3. Second bans: Red, Blue, Red, Blue.
4. Final picks: Red 4; Blue 4-5; Red 5.

This order is documented by the
[IESF MLBB Tournament Mode Organizer Guide](https://iesf.org/wp-content/uploads/2024/01/MLBB-Organizers-Guideline-1.pdf)
and is visible in the
[official MSC 2025 broadcast](https://www.youtube.com/watch?v=xvTBMaWGK5A&t=2910s).

## Development

Requirements: macOS, Bun 1.3 or newer, and OBS Studio 28 or newer.

```sh
bun install
bun run build
bun run start
```

Open Live Operations at `http://127.0.0.1:3000/control/live`. The organizer
controls are split by purpose:

- **Team Setup** manages reusable teams, starters, substitutes, logos, and
  optional local player photos.
- **Match Setup** prepares the schedule so a matchup is selected instead of
  retyped on air.
- **Overlay Setup** configures event text, HUD framing, countdown, ticker, and
  roster-loop timing.
- **Live Operations** contains the preflight, reviewed series controls, live
  corrections, draft selection, timer, and optional detector beta.

Team, match, and overlay setup changes save automatically. Resolve any save
error before beginning a broadcast.

## Organizer live workflow

1. Prepare teams in Team Setup and matches in Match Setup.
2. Configure the display once in Overlay Setup.
3. Open Live Operations and review its preflight. The app can verify its own
   state, but OBS source visibility and placement must be checked manually.
4. Select a planned matchup, review the teams and best-of value, then press
   **Start Series**. Selecting a match by itself never changes live state.
5. If no schedule is available, open **Quick Series**, review both teams, and
   start it explicitly.
6. Select heroes manually during the draft. Every selection starts the next
   draft turn at 50 seconds; the timer can be paused or restarted.
7. Use the score, game-number, ticker, and **Replay Entrance** actions for
   on-air corrections. Use **Next Game** to clear draft selections while
   preserving the series score.
8. Press **Complete Series** after the deciding game. The final result remains
   available to the result overlay.

Quick Series is a fallback, not a replacement for preparing scheduled matches.
The visual detector is optional and does not block the manual workflow.

## OBS Browser Sources

Add each required overlay as its own 1920x1080 OBS Browser Source. Every page
is transparent, has a stable URL, and updates in real time:

| Surface | URL |
| --- | --- |
| Draft | `http://127.0.0.1:3000/overlay/draft` |
| Gameplay scoreboard and HUD frames | `http://127.0.0.1:3000/overlay/scoreboard` |
| Match introduction | `http://127.0.0.1:3000/overlay/match` |
| Schedule | `http://127.0.0.1:3000/overlay/schedule` |
| Countdown | `http://127.0.0.1:3000/overlay/countdown` |
| Ticker | `http://127.0.0.1:3000/overlay/ticker` |
| Looping rosters | `http://127.0.0.1:3000/overlay/roster` |
| Series result | `http://127.0.0.1:3000/overlay/result` |

The scoreboard source contains only the transparent broadcast UI; gameplay
remains visible beneath it. The roster source follows the saved team order and
supports optional local player photos. This application does not automate OBS.

For development with hot reload, run `bun run dev`. Use `bun run check` before
opening a pull request.

To control the overlay from another device, bind `SHAYYZ_HOST` to a LAN address
and set a strong `SHAYYZ_CONTROL_TOKEN`. Loopback operation does not require a
token.

## Assets

The public repository never ships game resources. Personal media stays in the
ignored `vendor-assets/mlbb-personal/` directory and is served only through the
allowlisted local media API. Import and verify a private pack with:

```sh
bun run assets:import --source /path/to/private/source --game-build VERSION
bun run assets:verify
```

To inspect a connected emulator without copying game files, run
`bun run android:audit`. Reports go to ignored `captures/`. See
[vendor-assets/README.md](vendor-assets/README.md) for the private workflow.

## Attribution and license

The original non-empty source snapshot is attributed to FalseJL and preserved
through the `falsejl-v4.1-import` tag and provenance manifest. The maintained
SHAYYZ implementation is copyright Aung Min Khant. Both are distributed under
the repository's free-use/modification/no-resale terms; third-party media is
excluded. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
