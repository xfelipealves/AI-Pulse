import { BrowserWindow, Menu, Tray, app, ipcMain, nativeImage, safeStorage, screen, shell } from 'electron'
import { watch, type FSWatcher } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHANNELS } from '../shared/ipc'
import { PROVIDERS, type ProviderId, type SecretKey, type Settings, type SettingsState, type Snapshot } from '../shared/types'
import { augmentedPath } from './accounts/cli'
import { createAccountManager } from './accounts/manager'
import { DEMO_MANAGED_ACCOUNTS, demoLoaders } from './demo'
import { createPoller } from './poller'
import { loadClaude } from './providers/claude'
import { loadCodex } from './providers/codex'
import { createSessionReader } from './providers/codexSessions'
import { loadCursor } from './providers/cursor'
import { loadGemini } from './providers/gemini'
import { loadMiniMax } from './providers/minimax'
import { loadOpenCode } from './providers/opencode'
import { createSettingsStore, DEFAULT_SETTINGS } from './settings'
import { buildSnapshot, menuBarTitle, type Loader } from './snapshot'
import { POPUP_SIZE, belowTray, centered } from './windowPosition'

app.setName('AI Pulse')
process.env.PATH = augmentedPath()

/** `AI_PULSE_DEMO=1` shows fictional accounts and never touches real settings; `AI_PULSE_CAPTURE=<dir>` also saves screenshots and quits. */
const DEMO = process.env.AI_PULSE_DEMO === '1'
const CAPTURE_DIR = process.env.AI_PULSE_CAPTURE

const here = path.dirname(fileURLToPath(import.meta.url))
const home = homedir()
const codexHome = path.join(home, '.codex')
const dataDir = app.getPath('userData')
const sessions = createSessionReader()
const store = createSettingsStore(dataDir, {
  encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
  decrypt: (encoded) => safeStorage.decryptString(Buffer.from(encoded, 'base64'))
})
const accounts = createAccountManager({
  home,
  codexHome,
  dataDir,
  onLoginState: (state) => window?.webContents.send(CHANNELS.loginStateUpdated, state),
  onAccountsChanged: () => {
    window?.webContents.send(CHANNELS.accountsChanged)
    void poller.refresh()
  }
})

/** Local folders the CLIs write to while working; activity there triggers an early refresh. */
const ACTIVITY_DIRS = [path.join(codexHome, 'sessions'), path.join(home, '.claude/projects')]

let tray: Tray | undefined
let window: BrowserWindow | undefined
let snapshot: Snapshot | undefined
let settings: Settings = DEFAULT_SETTINGS
let isQuitting = false
const watchers: FSWatcher[] = []

const loaders: Record<ProviderId, Loader> = {
  codex: () => loadCodex({ codexHome, latestSamples: sessions.latestSamples }),
  claude: () => loadClaude({ home, managedRoot: accounts.claudeRoot }),
  cursor: () => loadCursor({ home }),
  gemini: () => loadGemini({ home }),
  opencode: async () => loadOpenCode({ home, apiKey: await store.secret('opencodeApiKey') }),
  minimax: async () => loadMiniMax({ apiKey: await store.secret('minimaxApiKey'), region: settings.minimaxRegion })
}

const poller = createPoller({
  intervalMs: () => settings.refreshSeconds * 1000,
  minGapMs: 20_000,
  load: async () => {
    const enabled = PROVIDERS.filter((id) => settings.providers[id].enabled)
    snapshot = await buildSnapshot(DEMO ? demoLoaders : enabled.map((id) => loaders[id]), snapshot)
    updateTrayTitle()
    window?.webContents.send(CHANNELS.snapshotUpdated, snapshot)
  }
})

app.whenReady().then(async () => {
  settings = DEMO ? demoSettings() : await store.load()
  applyLoginItem()
  registerIpc()
  window = createWindow()
  tray = createTray()
  window.once('ready-to-show', () => showWindow(false))
  if (CAPTURE_DIR) window.webContents.once('did-finish-load', () => void captureScreens(CAPTURE_DIR))
  poller.start()
  for (const directory of ACTIVITY_DIRS) {
    try {
      watchers.push(watch(directory, { recursive: true }, () => poller.nudge()))
    } catch {
      // The tool is not installed or has never run; the regular interval still applies.
    }
  }
})

app.on('before-quit', () => {
  isQuitting = true
  poller.stop()
  accounts.cancelLogin()
  watchers.forEach((watcher) => watcher.close())
})

// Closing the window leaves the app running in the menu bar.
app.on('window-all-closed', () => {})
app.on('activate', () => showWindow(false))

function createWindow(): BrowserWindow {
  const created = new BrowserWindow({
    ...POPUP_SIZE,
    show: false,
    resizable: false,
    title: 'AI Pulse',
    backgroundColor: '#141615',
    webPreferences: {
      preload: path.join(here, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  created.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    created.hide()
  })
  // Links never navigate the app window; https links open in the browser.
  created.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) void created.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void created.loadFile(path.join(here, '../renderer/index.html'))
  return created
}

function createTray(): Tray {
  const created = new Tray(trayIcon())
  created.setToolTip('AI Pulse')
  created.on('click', () => (window?.isVisible() ? window.hide() : showWindow(true)))
  created.on('right-click', () => {
    Menu.buildFromTemplate([{ label: 'Refresh', click: () => void poller.refresh() }, { type: 'separator' }, { label: 'Quit AI Pulse', click: () => app.quit() }]).popup()
  })
  return created
}

function updateTrayTitle(): void {
  const providers = PROVIDERS.filter((id) => settings.providers[id].enabled && settings.providers[id].inMenuBar)
  tray?.setTitle(settings.showInMenuBar ? menuBarTitle(snapshot, providers) : '', { fontType: 'monospacedDigit' })
}

function showWindow(nearTray: boolean): void {
  if (!window) return
  const trayBounds = tray?.getBounds()
  if (nearTray && trayBounds && trayBounds.width > 0 && trayBounds.height > 0) {
    const center = { x: Math.round(trayBounds.x + trayBounds.width / 2), y: Math.round(trayBounds.y + trayBounds.height / 2) }
    window.setBounds(belowTray(trayBounds, screen.getDisplayNearestPoint(center).workArea))
  } else if (!window.isVisible()) {
    window.setBounds(centered(screen.getPrimaryDisplay().workArea))
  }
  window.show()
  window.focus()
  poller.nudge()
}

function applyLoginItem(): void {
  // Only a packaged app can register itself as a login item.
  if (app.isPackaged && !DEMO) app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin })
}

function demoSettings(): Settings {
  return { ...DEFAULT_SETTINGS, providers: { ...DEFAULT_SETTINGS.providers, gemini: { enabled: true, inMenuBar: false } } }
}

/** Saves the usage view and two settings views as PNGs, then quits. */
async function captureScreens(directory: string): Promise<void> {
  const { mkdir, writeFile } = await import('node:fs/promises')
  const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
  const capture = async (name: string): Promise<void> => {
    await wait(900)
    await writeFile(path.join(directory, `${name}.png`), (await window!.webContents.capturePage()).toPNG())
  }
  await mkdir(directory, { recursive: true })
  await wait(1500)
  await capture('usage')
  await window!.webContents.executeJavaScript(`document.querySelector('[aria-label="Settings"]').click()`)
  await capture('settings')
  await window!.webContents.executeJavaScript(`document.querySelectorAll('.providerBlock')[1].scrollIntoView({ block: 'start' })`)
  await capture('accounts')
  app.quit()
}

async function settingsState(): Promise<SettingsState> {
  return { settings, secrets: await store.secretPresence() }
}

function registerIpc(): void {
  ipcMain.handle(CHANNELS.snapshot, () => snapshot ?? null)
  ipcMain.handle(CHANNELS.refresh, () => poller.refresh())
  ipcMain.handle(CHANNELS.quit, () => app.quit())

  ipcMain.handle(CHANNELS.getSettings, () => settingsState())
  ipcMain.handle(CHANNELS.saveSettings, async (_event, next: Settings) => {
    settings = DEMO ? next : await store.save(next)
    applyLoginItem()
    updateTrayTitle()
    void poller.refresh()
    return settingsState()
  })
  ipcMain.handle(CHANNELS.setSecret, async (_event, key: SecretKey, value: string | null) => {
    if (key !== 'opencodeApiKey' && key !== 'minimaxApiKey') throw new Error('Unknown secret')
    await store.setSecret(key, typeof value === 'string' ? value : null)
    void poller.refresh()
    return settingsState()
  })

  ipcMain.handle(CHANNELS.listAccounts, () => (DEMO ? DEMO_MANAGED_ACCOUNTS : accounts.list()))
  ipcMain.handle(CHANNELS.startLogin, (_event, provider: unknown, accountId: unknown) => {
    if (provider !== 'codex' && provider !== 'claude') throw new Error('Unknown provider')
    return accounts.startLogin(provider, typeof accountId === 'string' ? accountId : undefined)
  })
  ipcMain.handle(CHANNELS.submitLoginCode, (_event, code: unknown) => accounts.submitCode(String(code)))
  ipcMain.handle(CHANNELS.cancelLogin, () => accounts.cancelLogin())
  ipcMain.handle(CHANNELS.activateAccount, (_event, id: unknown) => accounts.activate(String(id)))
  ipcMain.handle(CHANNELS.removeAccount, (_event, id: unknown) => accounts.remove(String(id)))
  ipcMain.handle(CHANNELS.openExternal, (_event, url: unknown) => {
    if (typeof url === 'string' && url.startsWith('https://')) return shell.openExternal(url)
  })
}

/** Monochrome template image, so macOS tints it for light and dark menu bars. */
function trayIcon(): Electron.NativeImage {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 32 32">
    <path d="M3 18h6l3-8 5 14 3-9 2 3h7" fill="none" stroke="#000" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`
  const image = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`).resize({ width: 18, height: 18 })
  image.setTemplateImage(true)
  return image
}
