import type { PulseSnapshot } from '../shared'

export const PULSE_CHANNELS = {
  getSnapshot: 'pulse:getSnapshot',
  openProfiles: 'pulse:openProfiles',
  openConfig: 'pulse:openConfig',
  quit: 'pulse:quit',
  refreshRequest: 'pulse:refresh-request'
} as const

export type PulseIpcContract = {
  [PULSE_CHANNELS.getSnapshot]: { request: []; response: PulseSnapshot }
  [PULSE_CHANNELS.openProfiles]: { request: []; response: void }
  [PULSE_CHANNELS.openConfig]: { request: []; response: void }
  [PULSE_CHANNELS.quit]: { request: []; response: void }
}

export type PulseIpcChannel = keyof PulseIpcContract
export type PulseIpcRequest<Channel extends PulseIpcChannel> = PulseIpcContract[Channel]['request']
export type PulseIpcResponse<Channel extends PulseIpcChannel> = PulseIpcContract[Channel]['response']

export type PulseBridge = {
  getSnapshot: () => Promise<PulseIpcResponse<typeof PULSE_CHANNELS.getSnapshot>>
  openProfiles: () => Promise<PulseIpcResponse<typeof PULSE_CHANNELS.openProfiles>>
  openConfig: () => Promise<PulseIpcResponse<typeof PULSE_CHANNELS.openConfig>>
  quit: () => Promise<PulseIpcResponse<typeof PULSE_CHANNELS.quit>>
  onRefreshRequest: (callback: () => void) => () => void
}
