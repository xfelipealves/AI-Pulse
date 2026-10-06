import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const SECURITY = '/usr/bin/security'

/** Reads a generic password from the login Keychain; undefined when the item does not exist. */
export async function readKeychain(service: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(SECURITY, ['find-generic-password', '-s', service, '-w'], { timeout: 10_000 })
    return stdout.trim() || undefined
  } catch {
    return undefined
  }
}

export async function deleteKeychain(service: string): Promise<void> {
  await execFileAsync(SECURITY, ['delete-generic-password', '-s', service], { timeout: 10_000 }).catch(() => undefined)
}

export type KeychainReader = (service: string) => Promise<string | undefined>
