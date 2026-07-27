import { ExternalLink, Power, Settings } from 'lucide-react'
import type { ReactElement } from 'react'

type AppFooterProps = {
  bridgeAvailable: boolean
  updatedLabel: string
  onOpenProfiles: () => void
  onOpenConfig: () => void
  onQuit: () => void
}

export function AppFooter({ bridgeAvailable, updatedLabel, onOpenProfiles, onOpenConfig, onQuit }: AppFooterProps): ReactElement {
  return (
    <footer className="footer">
      <span>{updatedLabel}</span>
      <div className="actions">
        <button disabled={!bridgeAvailable} onClick={onOpenProfiles} title="Open Codex profiles">
          <ExternalLink size={15} /> Open
        </button>
        <button disabled={!bridgeAvailable} onClick={onOpenConfig} title="Edit account labels">
          <Settings size={15} /> Edit account labels
        </button>
        <button disabled={!bridgeAvailable} onClick={onQuit} title="Quit AI Pulse">
          <Power size={15} /> Quit
        </button>
      </div>
    </footer>
  )
}
