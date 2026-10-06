export type Rect = { x: number; y: number; width: number; height: number }
export type Size = { width: number; height: number }

export const POPUP_SIZE: Size = { width: 420, height: 720 }
const TRAY_GAP = 32

/** Centers the popup under the tray icon, kept inside the display's work area. */
export function belowTray(tray: Rect, workArea: Rect, preferred: Size = POPUP_SIZE): Rect {
  const { width, height } = fit(workArea, preferred)
  return {
    x: clamp(Math.round(tray.x + tray.width / 2 - width / 2), workArea.x, workArea.x + workArea.width - width),
    y: clamp(Math.round(tray.y + tray.height + TRAY_GAP), workArea.y, workArea.y + workArea.height - height),
    width,
    height
  }
}

export function centered(workArea: Rect, preferred: Size = POPUP_SIZE): Rect {
  const { width, height } = fit(workArea, preferred)
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height
  }
}

function fit(workArea: Rect, preferred: Size): Size {
  return { width: Math.min(preferred.width, workArea.width), height: Math.min(preferred.height, workArea.height) }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
