import { describe, expect, it } from 'vitest'
import { PREFERRED_POPUP_SIZE, centerInWorkArea, positionBelowTray } from '../src/main/windowPosition'

describe('positionBelowTray', () => {
  const workArea = { x: 0, y: 24, width: 1440, height: 876 }
  const windowSize = { width: 420, height: 720 }
  const normalWindowBounds = { width: 420, height: 720 }

  it('keeps a tray window within the display work area', () => {
    expect(positionBelowTray({ x: 1400, y: 0, width: 24, height: 24 }, workArea, windowSize)).toEqual({ x: 1020, y: 56, ...normalWindowBounds })
  })

  it('clamps the tray window to the work area left edge', () => {
    expect(positionBelowTray({ x: -100, y: 0, width: 24, height: 24 }, workArea, windowSize)).toEqual({ x: 0, y: 56, ...normalWindowBounds })
  })

  it('clamps the tray window to the work area top edge', () => {
    expect(positionBelowTray({ x: 100, y: -100, width: 24, height: 24 }, workArea, windowSize)).toEqual({ x: 0, y: 24, ...normalWindowBounds })
  })

  it('clamps the tray window to the work area bottom edge', () => {
    expect(positionBelowTray({ x: 100, y: 880, width: 24, height: 24 }, workArea, windowSize)).toEqual({ x: 0, y: 180, ...normalWindowBounds })
  })

  it('fits the popup bounds within an undersized display work area', () => {
    const undersizedWorkArea = { x: 0, y: 24, width: 420, height: 600 }

    expect(positionBelowTray({ x: 198, y: 0, width: 24, height: 24 }, undersizedWorkArea, windowSize)).toEqual({
      x: 0,
      y: 24,
      width: 420,
      height: 600
    })
  })

  it('restores the preferred popup size after using a compact work area', () => {
    const trayBounds = { x: 198, y: 0, width: 24, height: 24 }
    const compactWorkArea = { x: 0, y: 24, width: 420, height: 600 }
    const compactPopupBounds = positionBelowTray(trayBounds, compactWorkArea, PREFERRED_POPUP_SIZE)

    expect(compactPopupBounds).toMatchObject({ width: 420, height: 600 })
    expect(positionBelowTray(trayBounds, workArea, PREFERRED_POPUP_SIZE)).toEqual({ x: 0, y: 56, ...normalWindowBounds })
  })

  it('restores preferred bounds on the primary work area when tray bounds are unavailable', () => {
    const compactWorkArea = { x: 0, y: 24, width: 420, height: 600 }
    const compactPopupBounds = positionBelowTray({ x: 198, y: 0, width: 24, height: 24 }, compactWorkArea, PREFERRED_POPUP_SIZE)

    expect(compactPopupBounds).toMatchObject({ width: 420, height: 600 })
    expect(centerInWorkArea(workArea, PREFERRED_POPUP_SIZE)).toEqual({ x: 510, y: 102, ...normalWindowBounds })
  })
})
