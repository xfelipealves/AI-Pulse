import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { CHANNELS, type PulseBridge } from '../shared/ipc'

function subscribe<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, value: T): void => callback(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const bridge: PulseBridge = {
  snapshot: () => ipcRenderer.invoke(CHANNELS.snapshot),
  refresh: () => ipcRenderer.invoke(CHANNELS.refresh),
  quit: () => ipcRenderer.invoke(CHANNELS.quit),
  onSnapshot: (callback) => subscribe(CHANNELS.snapshotUpdated, callback),

  getSettings: () => ipcRenderer.invoke(CHANNELS.getSettings),
  saveSettings: (settings) => ipcRenderer.invoke(CHANNELS.saveSettings, settings),
  setSecret: (key, value) => ipcRenderer.invoke(CHANNELS.setSecret, key, value),

  listAccounts: () => ipcRenderer.invoke(CHANNELS.listAccounts),
  startLogin: (provider, accountId) => ipcRenderer.invoke(CHANNELS.startLogin, provider, accountId),
  submitLoginCode: (code) => ipcRenderer.invoke(CHANNELS.submitLoginCode, code),
  cancelLogin: () => ipcRenderer.invoke(CHANNELS.cancelLogin),
  activateAccount: (id) => ipcRenderer.invoke(CHANNELS.activateAccount, id),
  removeAccount: (id) => ipcRenderer.invoke(CHANNELS.removeAccount, id),
  onLoginState: (callback) => subscribe(CHANNELS.loginStateUpdated, callback),
  onAccountsChanged: (callback) => subscribe(CHANNELS.accountsChanged, () => callback()),

  openExternal: (url) => ipcRenderer.invoke(CHANNELS.openExternal, url)
}

contextBridge.exposeInMainWorld('pulse', bridge)
