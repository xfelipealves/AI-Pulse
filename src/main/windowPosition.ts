export type Rectangle = {
  x: number
  y: number
  width: number
  height: number
}

export type WindowSize = {
  width: number
  height: number
}

export const PREFERRED_POPUP_SIZE: WindowSize = { width: 420, height: 720 }

const TRAY_WINDOW_GAP = 32

export function positionBelowTray(trayBounds: Rectangle, workArea: Rectangle, preferredSize: WindowSize): Rectangle {
  const { width, height } = sizeWithinWorkArea(workArea, preferredSize)
  const maxX = workArea.x + workArea.width - width
  const maxY = workArea.y + workArea.height - height
  const desiredX = Math.round(trayBounds.x + trayBounds.width / 2 - width / 2)
  const desiredY = Math.round(trayBounds.y + trayBounds.height + TRAY_WINDOW_GAP)

  return {
    x: clamp(desiredX, workArea.x, maxX),
    y: clamp(desiredY, workArea.y, maxY),
    width,
    height
  }
}

export function centerInWorkArea(workArea: Rectangle, preferredSize: WindowSize): Rectangle {
  const { width, height } = sizeWithinWorkArea(workArea, preferredSize)

  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height
  }
}

function sizeWithinWorkArea(workArea: Rectangle, preferredSize: WindowSize): WindowSize {
  return {
    width: Math.min(preferredSize.width, workArea.width),
    height: Math.min(preferredSize.height, workArea.height)
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}
