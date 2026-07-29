import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App.tsx'
import { installPngExportTestBridge } from './export/png/pngTestBridge.ts'
import { startCanvasSession } from './store/canvasSession.ts'
import { installStoreTestBridge } from './store/testBridge.ts'

import './styles/theme.css'

const ROOT_ELEMENT_ID = 'root'

const rootElement = document.getElementById(ROOT_ELEMENT_ID)
if (!rootElement) {
  throw new Error(`BOSS Blueprint could not start: no #${ROOT_ELEMENT_ID} element in the page.`)
}

installStoreTestBridge()
installPngExportTestBridge()

// Before the first render, so a restored design paints in one go rather than
// flashing an empty page — and so React never sees a document that has no history.
startCanvasSession()

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
