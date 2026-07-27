# Contributing to AI Pulse

Thank you for improving AI Pulse. Keep contributions focused on the app's local, Codex-only scope and do not add credentials, copied Codex files, or personal account data to the repository.

## Workflow

1. Open an issue for a bug or proposed change when discussion would help.
2. Create a focused branch from the current default branch.
3. Install dependencies with `npm ci`.
4. Add or update tests for the behavior you change.
5. Run the required checks before opening a pull request:

```bash
npm run format:check
npm run lint
npm test
npm run typecheck
npm run build
git diff --check
```

Describe the user-visible behavior, local Codex data affected, and validation performed in the pull request. For security-sensitive reports, follow the reporting direction in the [README](README.md#security) instead of opening a public issue.
