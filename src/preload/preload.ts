import { contextBridge, ipcRenderer } from 'electron'
import type { PulseSnapshot } from '../shared'

contextBridge.exposeInMainWorld('pulse', {
  getSnapshot: (): Promise<PulseSnapshot> => ipcRenderer.invoke('pulse:getSnapshot'),
  openProfiles: (): Promise<void> => ipcRenderer.invoke('pulse:openProfiles'),
  openConfig: (): Promise<void> => ipcRenderer.invoke('pulse:openConfig'),
  quit: (): Promise<void> => ipcRenderer.invoke('pulse:quit'),
  onRefreshRequest: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('pulse:refresh-request', listener)
    return () => ipcRenderer.removeListener('pulse:refresh-request', listener)
  }
})
