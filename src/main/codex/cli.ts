import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'
import type { AccountStatus } from '../../shared'

const execFileAsync = promisify(execFile)
const HOMEBREW_COMMANDS = ['/opt/homebrew/bin/codex', '/usr/local/bin/codex']

export type DoctorCheck = {
  status: AccountStatus
  statusText: string
}

type ResolveCodexOptions = {
  commandAvailable?: () => boolean
  fileExists?: (candidate: string) => boolean
}

type DoctorCheckerOptions = {
  now?: () => number
  ttlMs?: number
  run?: (command: string) => Promise<string>
}

export function resolveCodexCommand(env: NodeJS.ProcessEnv, options: ResolveCodexOptions = {}): string {
  const configuredCommand = env.CODEX_BINARY?.trim()
  if (configuredCommand) return configuredCommand

  const fileExists = options.fileExists ?? existsSync
  const commandAvailable = options.commandAvailable ?? (() => codexIsOnPath(env.PATH, fileExists))
  if (commandAvailable()) return 'codex'

  return HOMEBREW_COMMANDS.find(fileExists) ?? 'codex'
}

export function createDoctorChecker(options: DoctorCheckerOptions = {}): { check: (command: string) => Promise<DoctorCheck> } {
  const now = options.now ?? Date.now
  const ttlMs = options.ttlMs ?? 5 * 60_000
  const run = options.run ?? runDoctorCommand
  const cache = new Map<string, { expiresAt: number; result: Promise<DoctorCheck> }>()

  return {
    check(command: string): Promise<DoctorCheck> {
      const cached = cache.get(command)
      if (cached && cached.expiresAt > now()) return cached.result

      const result: Promise<DoctorCheck> = run(command)
        .then(parseDoctorReport)
        .catch((): DoctorCheck => ({ status: 'error', statusText: 'doctor failed' }))
      cache.set(command, { expiresAt: now() + ttlMs, result })
      return result
    }
  }
}

export const doctorChecker = createDoctorChecker()

async function runDoctorCommand(command: string): Promise<string> {
  const { stdout } = await execFileAsync(command, ['doctor', '--json'], { timeout: 15_000, maxBuffer: 64 * 1024 })
  return stdout
}

function codexIsOnPath(searchPath: string | undefined, fileExists: (candidate: string) => boolean): boolean {
  if (!searchPath) return true
  return searchPath.split(delimiter).some((directory) => fileExists(join(directory, 'codex')))
}

function parseDoctorReport(stdout: string): DoctorCheck {
  const report = JSON.parse(stdout) as { overallStatus?: string; checks?: Array<{ status?: string }> }
  const hasError = report.overallStatus === 'error' || report.checks?.some((check) => check.status === 'error')
  if (hasError) return { status: 'error', statusText: 'login problem' }
  const hasWarning = report.overallStatus === 'warning' || report.checks?.some((check) => check.status === 'warning')
  return hasWarning ? { status: 'warning', statusText: 'login works, warning' } : { status: 'ok', statusText: 'login ok' }
}
