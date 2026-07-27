# AI Pulse

AI Pulse is a **Codex-only** macOS Electron tray app for viewing locally available Codex account and usage information. It reads the Codex files already present on your machine and displays a compact account snapshot from the menu bar.

AI Pulse is intentionally narrow in scope. It is not a general AI usage dashboard and does not support non-Codex providers or accounts.

## What It Reads

The app inspects local Codex state only:

- The default profile at `~/.codex/auth.json`.
- Named profiles at `~/.codex/auth-profiles/*.json`.
- Recent local Codex session records under `~/.codex/sessions` for a current rate-limit sample.
- An optional AI Pulse display configuration at `~/.ai-pulse.json`.

Profiles with the same account ID are de-duplicated. A profile without usable local authentication is shown as `login missing` with an error status rather than treated as a usable account.

## Usage Samples and Profiles

The account in the default `~/.codex/auth.json` is the active/default account. AI Pulse looks for a fresh, account-attributed usage sample only for that account. The sample must be no more than 15 minutes old and is read from bounded portions of recent local session files.

Named profiles are discovered from `~/.codex/auth-profiles/*.json` and may be displayed alongside the default profile. They do not receive the active/default account's usage sample. As a result, a named profile normally shows local authentication details but no current limit value. This is deliberate: AI Pulse does not guess which account produced a session event.

## Prerequisites

- macOS.
- Node.js 20.19.0 or later.
- npm 10 or later, supplied with a compatible Node.js installation.
- A local Codex installation and at least one locally logged-in Codex profile for account inspection.

The Codex CLI is optional for profile discovery, but it is needed for the default profile's CLI health check.

## Install and Run

Clone the repository, enter the project directory, then install exact locked dependencies:

```bash
git clone https://github.com/xfelipealves/AI-Pulse.git
cd AI-Pulse
npm ci
```

Start the development app:

```bash
npm run dev
```

Run the full automated test suite:

```bash
npm test
```

Type-check, build, or package the macOS app:

```bash
npm run typecheck
npm run build
npm run package:mac
```

`package:mac` runs the production build and then invokes Electron Builder for macOS. It does not imply that a distributable is signed, notarized, or released.

## Configuration

Use **Edit account labels** in the app to create or open `~/.ai-pulse.json`. This file can override only the displayed `label`, `plan`, and `email` for a profile. Profile keys are `default` for `~/.codex/auth.json` and the filename without `.json` for named profiles.

```json
{
  "accounts": {
    "default": {
      "label": "Codex Personal",
      "email": "first@example.com",
      "plan": "ChatGPT Plus"
    },
    "work": {
      "label": "Codex Work",
      "email": "second@example.com",
      "plan": "ChatGPT Plus"
    }
  }
}
```

The configuration does not change Codex login files, account IDs, health, or usage values. Do not store tokens or other secrets in it.

## Architecture

AI Pulse keeps account inspection in the Electron main process:

1. The Codex source modules discover local authentication profiles, read a bounded local session tail, and optionally run a CLI health check.
2. The main process converts that data to a `PulseSnapshot` and exposes it through a small, typed IPC contract.
3. The sandboxed preload bridge exposes explicit snapshot, configuration, profile-folder, and quit operations.
4. The React renderer displays the snapshot and refreshes it every minute or on an explicit refresh request.

The renderer does not read authentication files directly, and no authentication token is copied to a temporary directory.

## CLI Health Checks

For the default profile only, AI Pulse resolves a Codex executable in this order: `CODEX_BINARY`, `codex` on `PATH`, then common Homebrew locations. It runs `codex doctor --json` with a 15-second timeout, limits command output to 64 KiB, and caches each result for five minutes.

The health check is not a usage query and does not validate named profiles. A successful doctor result only reports the CLI's reported login health; it does not guarantee that a fresh local usage sample exists. If the CLI is unavailable or the command fails, the default profile reports the failed health check while local profile discovery can still continue.

## Troubleshooting

| Symptom                              | What to check                                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `No Codex profiles found`            | Log in with Codex locally and verify that `~/.codex/auth.json` or a JSON file in `~/.codex/auth-profiles` exists.                                      |
| `No recent Codex limit sample`       | Use the active/default Codex account, then refresh after Codex has written a recent session event. AI Pulse does not infer usage from another account. |
| Named profile shows no current usage | Expected behavior: only the active/default account can receive a current local sample.                                                                 |
| `doctor failed` or `login problem`   | Run `codex doctor --json` in Terminal. Confirm `CODEX_BINARY` or `PATH` identifies the intended executable.                                            |
| Labels do not change                 | Confirm the profile key in `~/.ai-pulse.json` is `default` or exactly matches the named profile filename without `.json`.                              |

## Limitations

- macOS only.
- Codex-only. There are no integrations for other AI providers, web accounts, or remote usage APIs.
- Usage is shown only when a recent, unambiguous local session sample belongs to the active/default account.
- Named profile health is not verified with `codex doctor`.
- AI Pulse does not maintain a remote account history, sync settings, send alerts, or estimate missing usage values.

## Privacy

AI Pulse has no remote service, telemetry client, analytics pipeline, or account-sync backend. Its application code does not send your Codex authentication or session data to a remote service. Data stays on your machine while AI Pulse reads local files and renders the tray UI.

The optional CLI health check invokes your local `codex` executable. Any network behavior of that executable is controlled by Codex, not by AI Pulse. Review Codex's own documentation and settings if your environment restricts CLI network access.

Never include the contents of `~/.codex/auth.json`, session files, tokens, or personal account details in an issue, pull request, or configuration example.

## Security

To report a security vulnerability, use [GitHub private vulnerability reporting](https://github.com/xfelipealves/AI-Pulse/security/advisories/new) when it is available for this repository. Do not disclose credentials, tokens, or copied Codex files in a public issue. If private reporting is unavailable, open a minimal public issue requesting a private contact channel without sensitive details.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the focused workflow and required local checks.

## License

AI Pulse is available under the [MIT License](LICENSE).
