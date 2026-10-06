import { describe, expect, it } from 'vitest'
import { belowTray, centered } from '../src/main/windowPosition'

const workArea = { x: 0, y: 25, width: 1440, height: 875 }

describe('window position', () => {
  it('centers the popup under the tray icon', () => {
    expect(belowTray({ x: 1000, y: 0, width: 24, height: 24 }, workArea)).toEqual({ x: 802, y: 56, width: 420, height: 720 })
  })

  it('keeps the popup inside the work area near screen edges', () => {
    expect(belowTray({ x: 1430, y: 0, width: 24, height: 24 }, workArea).x).toBe(1020)
    expect(belowTray({ x: -50, y: 0, width: 24, height: 24 }, workArea).x).toBe(0)
  })

  it('shrinks to fit small displays', () => {
    const small = { x: 0, y: 0, width: 400, height: 600 }
    expect(belowTray({ x: 100, y: 0, width: 24, height: 24 }, small)).toEqual({ x: 0, y: 0, width: 400, height: 600 })
    expect(centered(small)).toEqual({ x: 0, y: 0, width: 400, height: 600 })
  })

  it('centers in the work area', () => {
    expect(centered(workArea)).toEqual({ x: 510, y: 103, width: 420, height: 720 })
  })
})
