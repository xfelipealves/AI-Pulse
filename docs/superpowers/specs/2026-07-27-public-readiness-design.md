# AI Pulse Public Readiness Design

## Goal

Make AI Pulse reliable, secure, testable, and understandable as a public macOS Electron project while preserving its Codex-focused scope.

## Scope

1. Correct profile discovery, Codex executable resolution, rate-limit attribution, and stale-data handling.
2. Harden Electron process boundaries and remove personal data from generated configuration examples.
3. Separate data access, service orchestration, IPC types, and renderer presentation responsibilities.
4. Add automated tests, linting, formatting, dependency hygiene, Node support metadata, and CI.
5. Add an English README that documents installation, privacy, architecture, limitations, and contribution.

## Architecture

The main process will expose a typed IPC contract through the preload bridge. Codex-specific code will be split into profile discovery, manual configuration, executable resolution, session sample parsing, and account snapshot orchestration. The renderer will use a dedicated snapshot hook that serializes refresh requests and renders focused presentation components.

Rate-limit samples must be recent and attributable to the active account. When attribution cannot be established, the UI must report that limits are unavailable rather than presenting another account's data as live.

`codex doctor` is a health signal, not a per-minute requirement. Its execution will be bounded and cached; it must never require copying credentials into a temporary directory.

## Error Handling

- Missing default auth and profile files result in an explicit empty state.
- Missing Codex executable produces a warning, not a false login error.
- Invalid configuration or JSONL lines are ignored without crashing the application.
- Renderer controls remain disabled when the preload bridge is unavailable.
- Tray placement is clamped to the active display work area.

## Quality Gates

- Unit tests cover profile discovery, rate-limit freshness and attribution, executable resolution, and refresh sequencing.
- `npm run lint`, `npm run format:check`, `npm test`, `npm run typecheck`, and `npm run build` are required locally and in GitHub Actions.
- The README is English-only and accurately describes the current Codex-only behavior.

## Delivery

Changes are delivered as independently verified, English-named commits pushed directly to `main`:

1. Document public-readiness design.
2. Fix Codex account discovery and usage attribution.
3. Harden Electron integration and shared IPC contract.
4. Refactor renderer refresh flow and components.
5. Add tests and project quality tooling.
6. Add public project documentation.
