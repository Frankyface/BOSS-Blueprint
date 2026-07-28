import { AppHeader } from './components/AppHeader.tsx'
import { BlockPalette } from './components/BlockPalette.tsx'
import { CanvasArea } from './components/CanvasArea.tsx'

import './App.css'

/** The editor shell: header bar, left block palette, page canvas. */
export function App() {
  return (
    <div className="app-shell">
      <AppHeader />
      <div className="app-shell__body">
        <BlockPalette />
        <CanvasArea />
      </div>
    </div>
  )
}
