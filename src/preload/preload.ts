import { contextBridge, ipcRenderer } from 'electron'
import { PULSE_CHANNELS, type PulseBridge, type PulseIpcResponse } from '../shared/ipc'

const pulseBridge: PulseBridge = {
  getSnapshot: (): Promise<PulseIpcResponse<typeof PULSE_CHANNELS.getSnapshot>> => ipcRenderer.invoke(PULSE_CHANNELS.getSnapshot),
  openProfiles: (): Promise<PulseIpcResponse<typeof PULSE_CHANNELS.openProfiles>> => ipcRenderer.invoke(PULSE_CHANNELS.openProfiles),
  openConfig: (): Promise<PulseIpcResponse<typeof PULSE_CHANNELS.openConfig>> => ipcRenderer.invoke(PULSE_CHANNELS.openConfig),
  quit: (): Promise<PulseIpcResponse<typeof PULSE_CHANNELS.quit>> => ipcRenderer.invoke(PULSE_CHANNELS.quit),
  onRefreshRequest: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on(PULSE_CHANNELS.refreshRequest, listener)
    return () => ipcRenderer.removeListener(PULSE_CHANNELS.refreshRequest, listener)
  }
}

contextBridge.exposeInMainWorld('pulse', pulseBridge)
