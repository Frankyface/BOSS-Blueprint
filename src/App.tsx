import { AppHeader } from './components/AppHeader.tsx'
import { BlockPalette } from './components/BlockPalette.tsx'
import { CanvasArea } from './components/CanvasArea.tsx'
import { DesignToast } from './components/DesignToast.tsx'
import { PageStrip } from './components/PageStrip.tsx'
import { SidePanel } from './components/SidePanel.tsx'
import { StorageNotice } from './components/StorageNotice.tsx'

import './App.css'

/**
 * The editor shell: header bar, notices, then three columns — the block palette,
 * the stage (page strip above the canvas) and the details panel.
 */
export function App() {
  return (
    <div className="app-shell">
      <AppHeader />
      <StorageNotice />
      <DesignToast />
      <div className="app-shell__body">
        <BlockPalette />
        <div className="app-shell__stage">
          <PageStrip />
          <CanvasArea />
        </div>
        <SidePanel />
      </div>
    </div>
  )
}
