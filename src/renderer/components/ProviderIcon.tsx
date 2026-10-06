import type { ReactElement } from 'react'
import type { ProviderId } from '../../shared/types'
import claude from '../icons/claude.svg?raw'
import codex from '../icons/codex.svg?raw'
import cursor from '../icons/cursor.svg?raw'
import gemini from '../icons/gemini.svg?raw'
import minimax from '../icons/minimax.svg?raw'
import opencode from '../icons/opencode.svg?raw'

// Provider marks from @lobehub/icons (MIT). They are bundled, trusted SVG files.
const ICONS: Record<ProviderId, string> = { codex, claude, cursor, gemini, opencode, minimax }

export function ProviderIcon({ provider, size = 'large' }: { provider: ProviderId; size?: 'large' | 'small' }): ReactElement {
  return <span className={`providerIcon ${size}`} aria-hidden dangerouslySetInnerHTML={{ __html: ICONS[provider] }} />
}
