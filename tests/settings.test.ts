import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, createSettingsStore, normalizeSettings } from '../src/main/settings'
import { tempDir } from './helpers'

const cipher = { encrypt: (plain: string) => Buffer.from(`x${plain}`).toString('base64'), decrypt: (encoded: string) => Buffer.from(encoded, 'base64').toString().slice(1) }

describe('settings', () => {
  it('fills defaults and ignores unexpected values', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    const settings = normalizeSettings({ refreshSeconds: 7, minimaxRegion: 'cn', providers: { gemini: { enabled: true }, nope: {} } })
    expect(settings.refreshSeconds).toBe(60)
    expect(settings.minimaxRegion).toBe('cn')
    expect(settings.providers.gemini).toEqual({ enabled: true, inMenuBar: false })
    expect(settings.providers.codex).toEqual({ enabled: true, inMenuBar: true })
  })

  it('saves settings and keeps secrets encrypted', async () => {
    const directory = await tempDir()
    const store = createSettingsStore(directory, cipher)

    await store.save({ ...DEFAULT_SETTINGS, refreshSeconds: 120 })
    await store.setSecret('minimaxApiKey', '  sk-123  ')

    expect((await store.load()).refreshSeconds).toBe(120)
    expect(await store.secret('minimaxApiKey')).toBe('sk-123')
    expect(await readFile(path.join(directory, 'secrets.json'), 'utf8')).not.toContain('sk-123')
    expect(await store.secretPresence()).toEqual({ opencodeApiKey: false, minimaxApiKey: true })

    await store.setSecret('minimaxApiKey', null)
    expect(await store.secret('minimaxApiKey')).toBeUndefined()
  })
})
