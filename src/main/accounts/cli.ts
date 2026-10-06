import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

/**
 * Apps opened from Finder get a minimal PATH, so add the places CLIs are usually installed.
 * Spawned CLIs also need it, since some are Node scripts.
 */
export function augmentedPath(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  const extra = ['/opt/homebrew/bin', '/usr/local/bin', path.join(home, '.local/bin'), path.join(home, '.npm-global/bin'), path.join(home, '.bun/bin'), '/usr/bin', '/bin']
  return [...new Set([...(env.PATH ?? '').split(path.delimiter).filter(Boolean), ...extra])].join(path.delimiter)
}

export function findBinary(name: string, searchPath = augmentedPath(), exists: (file: string) => boolean = existsSync): string | undefined {
  return searchPath
    .split(path.delimiter)
    .map((directory) => path.join(directory, name))
    .find(exists)
}

/** First https URL in CLI output, ignoring terminal escape sequences around it. */
export function firstUrl(output: string): string | undefined {
  // eslint-disable-next-line no-control-regex -- BEL and ESC end the OSC 8 hyperlinks Claude Code prints.
  return /https:\/\/[^\s\x07\x1b]+/.exec(output)?.[0]
}

export type LoginProcess = {
  /** Sends a code the CLI asked to paste after signing in in the browser. */
  submitCode: (code: string) => void
  cancel: () => void
}

type RunLoginOptions = {
  binary: string
  args: string[]
  env: NodeJS.ProcessEnv
  /** Output that means the CLI now waits for a pasted code. */
  codePrompt?: RegExp
  onUrl: (url: string) => void
  onNeedsCode: () => void
  onExit: (ok: boolean, output: string) => void
  timeoutMs?: number
}

/** Runs a CLI login command, reporting the sign-in URL and whether it needs a pasted code. */
export function runLogin(options: RunLoginOptions): LoginProcess {
  const child = spawn(options.binary, options.args, { env: { ...options.env, PATH: augmentedPath(options.env) }, stdio: ['pipe', 'pipe', 'pipe'] })
  let output = ''
  let urlSent = false
  let codeRequested = false
  let finished = false
  const timer = setTimeout(() => child.kill(), options.timeoutMs ?? 10 * 60_000)

  const onData = (chunk: Buffer): void => {
    output = `${output}${chunk.toString('utf8')}`.slice(-20_000)
    const url = firstUrl(output)
    if (url && !urlSent) {
      urlSent = true
      options.onUrl(url)
    }
    if (options.codePrompt?.test(output) && !codeRequested) {
      codeRequested = true
      options.onNeedsCode()
    }
  }
  child.stdout.on('data', onData)
  child.stderr.on('data', onData)
  const finish = (ok: boolean): void => {
    if (finished) return
    finished = true
    clearTimeout(timer)
    options.onExit(ok, output)
  }
  child.on('error', () => finish(false))
  child.on('close', (code) => finish(code === 0))

  return {
    submitCode: (code) => {
      child.stdin.write(`${code.trim()}\n`)
    },
    cancel: () => {
      child.kill()
    }
  }
}
