import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App.tsx'
import { installStoreTestBridge } from './store/testBridge.ts'

import './styles/theme.css'

const ROOT_ELEMENT_ID = 'root'

const rootElement = document.getElementById(ROOT_ELEMENT_ID)
if (!rootElement) {
  throw new Error(`BOSS Blueprint could not start: no #${ROOT_ELEMENT_ID} element in the page.`)
}

installStoreTestBridge()

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
