# AI Pulse Public Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI Pulse a reliable, secure, documented, and testable public Codex usage monitor.

**Architecture:** Extract Codex file and CLI access into focused modules behind a snapshot service. Share the IPC contract between Electron main, preload, and renderer. The renderer owns only presentation and a serialized refresh hook.

**Tech Stack:** Electron 40, electron-vite, React 19, TypeScript, Vitest, ESLint, Prettier, GitHub Actions.

---

## File Structure

- `src/main/codex/auth.ts`: discovers default and named Codex auth files.
- `src/main/codex/rateLimits.ts`: parses recent, account-attributed session samples.
- `src/main/codex/cli.ts`: resolves the Codex executable and caches bounded health checks.
- `src/main/codex/accounts.ts`: builds renderer account snapshots from Codex sources.
- `src/shared/ipc.ts`: declares IPC channel names and the preload bridge interface.
- `src/renderer/hooks/usePulseSnapshot.ts`: serializes renderer refreshes and exposes a safe state model.
- `src/renderer/components/*`: presentational account, status, and footer components.
- `tests/**/*.test.ts`: unit and component-independent regression coverage.
- `.github/workflows/ci.yml`: runs quality gates for every push and pull request.

### Task 1: Establish the Test and Quality Baseline

**Files:**
- Modify: `package.json`, `package-lock.json`, `.gitignore`
- Create: `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `vitest.config.ts`, `tests/setup.ts`, `.github/workflows/ci.yml`

- [ ] **Step 1: Add a failing executable-resolution test**

```ts
import { describe, expect, it } from 'vitest'
import { resolveCodexCommand } from '../src/main/codex/cli'

describe('resolveCodexCommand', () => {
  it('uses CODEX_BINARY before PATH candidates', () => {
    expect(resolveCodexCommand({ CODEX_BINARY: '/custom/codex' })).toBe('/custom/codex')
  })
})
```

- [ ] **Step 2: Run the test before implementation**

Run: `npm test -- tests/cli.test.ts`

Expected: FAIL because the test script or module does not exist.

- [ ] **Step 3: Add Vitest, linting, formatting, and CI scripts**

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "build": "electron-vite build"
  },
  "engines": { "node": ">=20.19.0" }
}
```

The CI workflow must run `npm ci`, `npm run format:check`, `npm run lint`, `npm test`, `npm run typecheck`, and `npm run build` on macOS using Node 22.

- [ ] **Step 4: Run all baseline quality commands**

Run: `npm run format:check && npm run lint && npm test && npm run typecheck && npm run build`

Expected: every command exits with status 0.

- [ ] **Step 5: Commit and push**

```bash
git add package.json package-lock.json .gitignore eslint.config.js .prettierrc.json .prettierignore vitest.config.ts tests/setup.ts .github/workflows/ci.yml tests/cli.test.ts
git commit -m "Add quality tooling baseline"
git push origin main
```

### Task 2: Fix Codex Account and Usage Data

**Files:**
- Create: `src/main/codex/auth.ts`, `src/main/codex/rateLimits.ts`, `src/main/codex/cli.ts`, `src/main/codex/accounts.ts`, `tests/auth.test.ts`, `tests/rateLimits.test.ts`, `tests/cli.test.ts`
- Modify: `src/main/codexProvider.ts`, `src/shared.ts`

- [ ] **Step 1: Write failing profile-discovery and rate-limit tests**

```ts
it('includes the default auth.json when no named profile exists', async () => {
  await writeFile(path.join(codexHome, 'auth.json'), JSON.stringify(activeAuth))
  expect(await discoverProfiles(codexHome)).toEqual([{ id: 'default', filePath: path.join(codexHome, 'auth.json') }])
})

it('rejects a sample that is older than fifteen minutes', () => {
  expect(isFreshRateLimitSample({ ts: new Date(Date.now() - 16 * 60_000).toISOString() })).toBe(false)
})
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- tests/auth.test.ts tests/rateLimits.test.ts`

Expected: FAIL because discovery and freshness behavior are not implemented.

- [ ] **Step 3: Implement focused Codex sources**

`discoverProfiles` returns the default auth file plus named profiles without duplicate account IDs. `readLatestRateLimitSample` must inspect only bounded recent session data, require a matching account identifier, and return `undefined` for stale or ambiguous data. `resolveCodexCommand` must prioritize `CODEX_BINARY`, then `codex` from PATH, with Homebrew paths only as fallbacks. Cache health checks and never copy auth tokens into temporary directories.

- [ ] **Step 4: Replace the monolithic provider with the account service**

```ts
const snapshot = await loadCodexAccounts({
  codexHome,
  now: () => Date.now(),
  command: resolveCodexCommand(process.env)
})
```

Manual configuration must only customize label, plan, and email. Rename the user-facing action from “Edit usage overrides” to “Edit account labels”. Replace real e-mails with `first@example.com` and `second@example.com`.

- [ ] **Step 5: Run regression suite**

Run: `npm test -- tests/auth.test.ts tests/rateLimits.test.ts tests/cli.test.ts && npm run typecheck && npm run build`

Expected: all focused tests pass and production build succeeds.

- [ ] **Step 6: Commit and push**

```bash
git add src/main/codex src/main/codexProvider.ts src/shared.ts tests/auth.test.ts tests/rateLimits.test.ts tests/cli.test.ts
git commit -m "Fix Codex account discovery and usage attribution"
git push origin main
```

### Task 3: Harden Electron Boundaries and Window Behavior

**Files:**
- Create: `src/shared/ipc.ts`, `src/main/windowPosition.ts`, `tests/windowPosition.test.ts`
- Modify: `src/main/main.ts`, `src/preload/preload.ts`, `src/renderer/App.tsx`

- [ ] **Step 1: Write failing window-position tests**

```ts
it('keeps a tray window within the display work area', () => {
  expect(positionBelowTray({ x: 1400, y: 0, width: 24, height: 24 }, { x: 0, y: 24, width: 1440, height: 876 }, { width: 420, height: 720 }))
    .toEqual({ x: 1020, y: 56 })
})
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- tests/windowPosition.test.ts`

Expected: FAIL because `positionBelowTray` does not exist.

- [ ] **Step 3: Implement the shared IPC contract and clamped placement**

Define channel constants and the `PulseBridge` interface in `src/shared/ipc.ts`. Use those values from main and preload. Enable `sandbox: true`; keep the preload API to explicit invocations only. Use `positionBelowTray` with the nearest display work area and clamp both coordinates.

- [ ] **Step 4: Make renderer bridge actions safe**

```tsx
const bridgeAvailable = typeof window.pulse !== 'undefined'
<button disabled={!bridgeAvailable} onClick={() => void window.pulse?.openProfiles()}>
  <ExternalLink size={15} /> Open
</button>
```

- [ ] **Step 5: Verify implementation**

Run: `npm test -- tests/windowPosition.test.ts && npm run lint && npm run typecheck && npm run build`

Expected: all commands exit with status 0.

- [ ] **Step 6: Commit and push**

```bash
git add src/shared/ipc.ts src/main/windowPosition.ts src/main/main.ts src/preload/preload.ts src/renderer/App.tsx tests/windowPosition.test.ts
git commit -m "Harden Electron IPC and tray behavior"
git push origin main
```

### Task 4: Refactor the Renderer Refresh Flow

**Files:**
- Create: `src/renderer/hooks/usePulseSnapshot.ts`, `src/renderer/components/AccountCard.tsx`, `src/renderer/components/AppFooter.tsx`, `tests/usePulseSnapshot.test.ts`
- Modify: `src/renderer/App.tsx`, `src/renderer/styles.css`

- [ ] **Step 1: Write a failing refresh-sequencing test**

```ts
it('keeps the newest completed snapshot when refreshes overlap', async () => {
  const first = deferred<PulseSnapshot>()
  const second = deferred<PulseSnapshot>()
  const state = createSnapshotController(() => first.promise)
  void state.refresh()
  state.setLoader(() => second.promise)
  void state.refresh()
  second.resolve(newerSnapshot)
  first.resolve(olderSnapshot)
  await flushPromises()
  expect(state.getSnapshot()).toEqual(newerSnapshot)
})
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- tests/usePulseSnapshot.test.ts`

Expected: FAIL because the serialized snapshot controller does not exist.

- [ ] **Step 3: Implement serialized refresh state and focused components**

The hook must ignore stale completions, avoid parallel requests, register the tray listener once, and clear timers/listeners during cleanup. `AccountCard` receives a `PulseAccount`; `AppFooter` receives the bridge availability and action callbacks. Keep text and metrics unchanged except “Edit account labels”.

- [ ] **Step 4: Verify renderer behavior and build**

Run: `npm test -- tests/usePulseSnapshot.test.ts && npm run lint && npm run typecheck && npm run build`

Expected: all commands exit with status 0.

- [ ] **Step 5: Commit and push**

```bash
git add src/renderer/App.tsx src/renderer/styles.css src/renderer/hooks/usePulseSnapshot.ts src/renderer/components tests/usePulseSnapshot.test.ts
git commit -m "Refactor renderer snapshot flow"
git push origin main
```

### Task 5: Publish Clear Project Documentation

**Files:**
- Create: `README.md`, `LICENSE`, `CONTRIBUTING.md`
- Modify: `package.json`

- [ ] **Step 1: Write README validation assertions**

```ts
it('documents the required local setup and privacy boundary', async () => {
  const readme = await readFile('README.md', 'utf8')
  expect(readme).toContain('npm ci')
  expect(readme).toContain('Privacy')
  expect(readme).toContain('~/.codex')
})
```

- [ ] **Step 2: Run the documentation test and verify failure**

Run: `npm test -- tests/readme.test.ts`

Expected: FAIL because `README.md` does not exist.

- [ ] **Step 3: Write public-facing English documentation**

The README must state that AI Pulse is a Codex-only macOS tray app, include prerequisites, install/run/build commands, architecture, profile behavior, known limitations, troubleshooting, privacy, testing, and contribution links. Use MIT licensing and short English contribution guidance. Update `package.json` metadata with license, repository, bugs, and homepage URLs.

- [ ] **Step 4: Verify documentation and all quality gates**

Run: `npm run format:check && npm run lint && npm test && npm run typecheck && npm run build && git diff --check`

Expected: every command exits with status 0 and the worktree has no whitespace errors.

- [ ] **Step 5: Commit and push**

```bash
git add README.md LICENSE CONTRIBUTING.md package.json tests/readme.test.ts
git commit -m "Document AI Pulse for public use"
git push origin main
```
