import { useState } from 'react'

import { BlockInspector } from './BlockInspector.tsx'
import { NavMapPanel } from './NavMapPanel.tsx'
import { SiteSettingsPanel } from './SiteSettingsPanel.tsx'

import './SidePanel.css'

type PanelTab = 'block' | 'site' | 'map'

const TABS: readonly { readonly id: PanelTab; readonly label: string }[] = [
  { id: 'block', label: 'Block' },
  { id: 'site', label: 'Site' },
  { id: 'map', label: 'Nav map' },
]

const PANEL_LABEL = 'Design details'

/**
 * The right-hand panel: block settings, site settings and the nav map, as tabs.
 *
 * A docked panel rather than a modal, and one panel rather than three separate
 * surfaces. A modal would hide the very design the client is describing, needs a
 * focus trap and a scroll lock to be correct, and behaves differently in each
 * engine; a docked panel keeps the page visible while they type, and every tab is
 * one click from the canvas.
 *
 * The tab does NOT follow the selection. Auto-switching would yank a client out of
 * a half-typed "about the business" paragraph the moment they clicked the page.
 */
export function SidePanel() {
  const [tab, setTab] = useState<PanelTab>('block')

  return (
    <aside className="side-panel" aria-label={PANEL_LABEL} data-testid="side-panel" data-tab={tab}>
      <div className="side-panel__tabs" role="tablist" aria-label={PANEL_LABEL}>
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`side-panel-tab-${entry.id}`}
            className="side-panel__tab"
            data-testid={`side-panel-tab-${entry.id}`}
            aria-selected={tab === entry.id}
            aria-controls={`side-panel-view-${entry.id}`}
            onClick={() => {
              setTab(entry.id)
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div
        className="side-panel__view"
        role="tabpanel"
        id={`side-panel-view-${tab}`}
        aria-labelledby={`side-panel-tab-${tab}`}
      >
        {tab === 'block' && <BlockInspector />}
        {tab === 'site' && <SiteSettingsPanel />}
        {tab === 'map' && <NavMapPanel />}
      </div>
    </aside>
  )
}
