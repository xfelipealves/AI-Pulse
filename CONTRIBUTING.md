# Contributing to AI Pulse

Thank you for improving AI Pulse. Keep contributions focused on the app's local-first scope (reading usage for AI coding tools on the user's Mac) and never add credentials, copied credential files, or personal account data to the repository. New providers live in `src/main/providers/` with tests that use fixtures, not real accounts.

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

Describe the user-visible behavior, the local data or endpoints involved, and the validation performed in the pull request. If the UI changes, run `npm run screenshots` to refresh the images in `docs/images`. For security-sensitive reports, follow the reporting direction in the [README](README.md#privacy--security) instead of opening a public issue.
