# SHAYYZ MLBB OVERLAY Agent Guide

## Product

SHAYYZ MLBB OVERLAY is a macOS-first, local OBS Studio broadcast overlay. The current release focuses on a reliable manual MLBB draft workflow and an opt-in visual detector beta.

## Required Workflow

1. Create or reference a GitHub issue before changing code.
2. Branch from `main` using `<type>/<issue>-<short-description>`.
3. Keep each pull request focused on one issue and normally below 400 non-generated changed lines.
4. Use Conventional Commits such as `feat(draft): ...`, `fix(server): ...`, or `docs: ...`.
5. Run `bun run check` before pushing.
6. Open pull requests as drafts until checks pass.
7. Resolve review conversations, rebase on `main`, and use rebase merge. Do not create merge commits.

## Engineering Rules

- Use Bun as the runtime and package manager. Commit `bun.lock`.
- Use strict TypeScript. Do not add JavaScript to the new application.
- Keep API schemas in `packages/contracts` and import their inferred types.
- Keep mutable state and operator assets outside public web roots.
- Bind to loopback by default. LAN mutations require a control token.
- Persist JSON atomically and validate it before use.
- Keep all code comments, identifiers, UI text, logs, and documentation in English.
- Prefer centralized theme tokens over one-off styles.
- Preserve transparent backgrounds and 1920x1080 composition safety for OBS overlays.
- Never include extracted APK/OBB resources, game traffic interception, memory inspection, or undocumented game APIs.
- MLBB media must have attribution and license metadata before it can be committed.

## Ownership

- Files in tag `falsejl-v4.1-import` are the attributed FalseJL v4.1 baseline.
- The originally empty `AGENTS.md`, `.gitignore`, `CONTRIBUTING.md`, `LICENSE`, and `README.md`, plus every change after that tag, are copyright Aung Min Khant.
- Third-party game media is not covered by the software license.
