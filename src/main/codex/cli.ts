export function resolveCodexCommand(env: NodeJS.ProcessEnv): string {
  return env.CODEX_BINARY || 'codex'
}
