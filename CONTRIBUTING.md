# Contributing

Thank you for improving SHAYYZ MLBB OVERLAY.

## Before coding

- Search existing issues and open one when no suitable issue exists.
- Keep proposals narrowly scoped so they can be reviewed and reverted independently.
- Do not submit MLBB images, audio, video, fonts, or models without documented redistribution permission.

## Development

```sh
bun install
bun run dev
```

Use English for source code, comments, interface copy, logs, commit messages, and documentation. Run the full local verification before opening a pull request:

```sh
bun run check
```

## Git and pull requests

- Branch names follow `<type>/<issue>-<description>`.
- Commits follow Conventional Commits.
- A pull request addresses one issue and includes testing notes.
- Draft pull requests are expected until automated checks pass.
- Update a branch by rebasing on `main`; do not merge `main` into it.
- Maintainers use rebase merge and delete the merged branch.

By contributing, you agree that your contribution is distributed under the repository license and that you have the right to provide it.
