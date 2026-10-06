import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PROVIDERS, type ProviderId, type SecretKey, type Settings } from '../shared/types'

const DEFAULT_ON: ProviderId[] = ['codex', 'claude', 'cursor']
const MENU_BAR_DEFAULT: ProviderId[] = ['codex', 'claude']

export const DEFAULT_SETTINGS: Settings = {
  providers: Object.fromEntries(PROVIDERS.map((id) => [id, { enabled: DEFAULT_ON.includes(id), inMenuBar: MENU_BAR_DEFAULT.includes(id) }])) as Settings['providers'],
  showInMenuBar: true,
  refreshSeconds: 60,
  launchAtLogin: false,
  minimaxRegion: 'global'
}

export const REFRESH_CHOICES = [30, 60, 120, 300]

/** Fills gaps with defaults and drops anything unexpected. */
export function normalizeSettings(value: unknown): Settings {
  const raw = isRecord(value) ? value : {}
  const providers = isRecord(raw.providers) ? raw.providers : {}
  return {
    providers: Object.fromEntries(
      PROVIDERS.map((id) => {
        const entry = isRecord(providers[id]) ? providers[id] : {}
        const fallback = DEFAULT_SETTINGS.providers[id]
        return [id, { enabled: bool(entry.enabled, fallback.enabled), inMenuBar: bool(entry.inMenuBar, fallback.inMenuBar) }]
      })
    ) as Settings['providers'],
    showInMenuBar: bool(raw.showInMenuBar, DEFAULT_SETTINGS.showInMenuBar),
    refreshSeconds: REFRESH_CHOICES.includes(raw.refreshSeconds as number) ? (raw.refreshSeconds as number) : DEFAULT_SETTINGS.refreshSeconds,
    launchAtLogin: bool(raw.launchAtLogin, DEFAULT_SETTINGS.launchAtLogin),
    minimaxRegion: raw.minimaxRegion === 'cn' ? 'cn' : 'global'
  }
}

export type Cipher = { encrypt: (plain: string) => string; decrypt: (encoded: string) => string }

/**
 * Settings live in `settings.json`; API keys are encrypted with `cipher`
 * (Electron safeStorage, backed by the macOS Keychain) in `secrets.json`.
 */
export function createSettingsStore(directory: string, cipher: Cipher) {
  const settingsPath = path.join(directory, 'settings.json')
  const secretsPath = path.join(directory, 'secrets.json')

  async function readJson(filePath: string): Promise<unknown> {
    try {
      return JSON.parse(await readFile(filePath, 'utf8'))
    } catch {
      return undefined
    }
  }

  async function writeJson(filePath: string, value: unknown): Promise<void> {
    await mkdir(directory, { recursive: true })
    const temporary = `${filePath}.tmp`
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
    await rename(temporary, filePath)
  }

  async function readSecrets(): Promise<Partial<Record<SecretKey, string>>> {
    const stored = await readJson(secretsPath)
    return isRecord(stored) ? (stored as Partial<Record<SecretKey, string>>) : {}
  }

  return {
    async load(): Promise<Settings> {
      return normalizeSettings(await readJson(settingsPath))
    },
    async save(settings: Settings): Promise<Settings> {
      const normalized = normalizeSettings(settings)
      await writeJson(settingsPath, normalized)
      return normalized
    },
    async secret(key: SecretKey): Promise<string | undefined> {
      const encoded = (await readSecrets())[key]
      if (!encoded) return undefined
      try {
        return cipher.decrypt(encoded)
      } catch {
        return undefined
      }
    },
    async setSecret(key: SecretKey, value: string | null): Promise<void> {
      const secrets = await readSecrets()
      const trimmed = value?.trim()
      if (trimmed) secrets[key] = cipher.encrypt(trimmed)
      else delete secrets[key]
      await writeJson(secretsPath, secrets)
    },
    async secretPresence(): Promise<Record<SecretKey, boolean>> {
      const secrets = await readSecrets()
      return { opencodeApiKey: Boolean(secrets.opencodeApiKey), minimaxApiKey: Boolean(secrets.minimaxApiKey) }
    }
  }
}

export type SettingsStore = ReturnType<typeof createSettingsStore>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}
