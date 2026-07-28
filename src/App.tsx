import { AppHeader } from './components/AppHeader.tsx'
import { BlockPalette } from './components/BlockPalette.tsx'
import { CanvasArea } from './components/CanvasArea.tsx'
import { StorageNotice } from './components/StorageNotice.tsx'

import './App.css'

/** The editor shell: header bar, autosave notice, left block palette, page canvas. */
export function App() {
  return (
    <div className="app-shell">
      <AppHeader />
      <StorageNotice />
      <div className="app-shell__body">
        <BlockPalette />
        <CanvasArea />
      </div>
    </div>
  )
}
