import { BrowserWindow, Menu, Tray, app, ipcMain, nativeImage, screen, shell } from 'electron'
import path from 'node:path'
import { homedir } from 'node:os'
import { loadCodexAccounts, manualConfigExample } from './codexProvider'
import type { PulseSnapshot } from '../shared'

let tray: Tray | null = null
let window: BrowserWindow | null = null

const isDev = !app.isPackaged

app.whenReady().then(() => {
  createWindow()
  createTray()
  registerIpc()
  setTimeout(showInitialWindow, 250)
})

app.on('window-all-closed', () => {})

function createWindow(): void {
  window = new BrowserWindow({
    width: 420,
    height: 720,
    show: true,
    frame: true,
    resizable: false,
    transparent: false,
    alwaysOnTop: false,
    backgroundColor: '#181919',
    skipTaskbar: false,
    title: 'AI Pulse',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (isDev) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL!)
  } else {
    window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  tray = new Tray(createTrayIcon())
  tray.setToolTip('AI Pulse')
  tray.on('click', toggleWindow)
  tray.on('right-click', () => {
    Menu.buildFromTemplate([
      { label: 'Refresh', click: () => window?.webContents.send('pulse:refresh-request') },
      { label: 'Open Codex Profiles', click: () => shell.openPath(path.join(homedir(), '.codex/auth-profiles')) },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ]).popup()
  })
}

function toggleWindow(): void {
  if (!tray || !window) return
  if (window.isVisible()) {
    window.hide()
    return
  }
  showWindow()
}

function showInitialWindow(): void {
  if (!window) return
  moveToPrimaryDisplay(window)
  window.show()
  window.focus()
}

function showWindow(): void {
  if (!tray || !window) return
  const trayBounds = tray.getBounds()
  const windowBounds = window.getBounds()
  if (trayBounds.width > 0 && trayBounds.height > 0) {
    window.setPosition(Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2), Math.round(trayBounds.y + trayBounds.height + 8))
  } else {
    moveToPrimaryDisplay(window)
  }
  window.show()
  window.focus()
}

function moveToPrimaryDisplay(targetWindow: BrowserWindow): void {
  const display = screen.getPrimaryDisplay()
  const { x, y, width, height } = display.workArea
  const bounds = targetWindow.getBounds()
  targetWindow.setPosition(Math.round(x + (width - bounds.width) / 2), Math.round(y + Math.max(24, (height - bounds.height) / 2)))
}

function registerIpc(): void {
  ipcMain.handle('pulse:getSnapshot', async (): Promise<PulseSnapshot> => {
    const accounts = await loadCodexAccounts()
    const averageRemaining = average(accounts.map((account) => account.remainingPercent))
    return {
      generatedAt: new Date().toISOString(),
      summary: averageRemaining == null ? 'No monthly spend reported' : `${averageRemaining}% average remaining`,
      accounts
    }
  })

  ipcMain.handle('pulse:openProfiles', () => shell.openPath(path.join(homedir(), '.codex/auth-profiles')))
  ipcMain.handle('pulse:openConfig', async () => {
    const configPath = path.join(homedir(), '.ai-pulse.json')
    try {
      const { writeFile, access } = await import('node:fs/promises')
      await access(configPath).catch(() => writeFile(configPath, JSON.stringify(manualConfigExample(), null, 2)))
    } catch {
      return
    }
    shell.openPath(configPath)
  })
  ipcMain.handle('pulse:quit', () => app.quit())
}

function createTrayIcon(): Electron.NativeImage {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill="#151818"/>
      <path d="M7 21.5 12.8 10l5.3 9.1 2.2-4.3 4.7 6.7" fill="none" stroke="#30d55d" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="23.8" cy="8.2" r="3.4" fill="#30d55d"/>
    </svg>`
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
}

function average(values: Array<number | undefined>): number | undefined {
  const valid = values.filter((value): value is number => typeof value === 'number')
  if (valid.length === 0) return undefined
  return Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length)
}
