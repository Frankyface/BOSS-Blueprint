import type { DragEvent as ReactDragEvent } from 'react'

import { isDesignFileName } from './canvas/designFile.ts'
import { AppHeader } from './components/AppHeader.tsx'
import { BlankStartCoach } from './components/BlankStartCoach.tsx'
import { BlockPalette } from './components/BlockPalette.tsx'
import { CanvasArea } from './components/CanvasArea.tsx'
import { DesignImportConfirm } from './components/DesignImportConfirm.tsx'
import { DesignToast } from './components/DesignToast.tsx'
import { DesktopGuard } from './components/DesktopGuard.tsx'
import { OnboardingTour } from './components/OnboardingTour.tsx'
import { PageStrip } from './components/PageStrip.tsx'
import { SidePanel } from './components/SidePanel.tsx'
import { StorageNotice } from './components/StorageNotice.tsx'
import { SubmitView } from './components/submit/SubmitView.tsx'
import { TemplatePicker } from './components/TemplatePicker.tsx'
import { useSmallViewport } from './hooks/useSmallViewport.ts'
import { requestDesignImport } from './store/designFileSession.ts'
import { useSubmitStore } from './store/submitStore.ts'

import './App.css'

const FILES_DRAG_TYPE = 'Files'

function draggedDesignFile(event: ReactDragEvent<HTMLDivElement>): File | null {
  const file = event.dataTransfer.files.item(0)
  return file && isDesignFileName(file.name) ? file : null
}

/**
 * The editor shell: header bar, notices, then three columns — the block palette,
 * the stage (page strip above the canvas) and the details panel.
 *
 * THE WHOLE SHELL IS A DROP TARGET for a `.blueprint` file, which is why the two
 * drag handlers are here and not on the canvas. A client who wants to carry on
 * with yesterday's design drags the file at the editor, not at one particular
 * rectangle inside it — and the header's "Open design" button is the same code
 * path for anyone who would rather click.
 *
 * Two guards keep this out of everyone else's way:
 *  · `defaultPrevented` — an image slot handles its own drops (`ImageSlot`), and a
 *    drop it has already claimed is not ours to reinterpret.
 *  · the file NAME — anything that is not a `.blueprint` falls through untouched,
 *    so dragging a photo onto the palette still does what the browser would do.
 */
export function App() {
  /*
   * Submit TAKES OVER the editor body rather than floating above it (see
   * `SubmitView`). Nothing is lost by unmounting the canvas — the document lives
   * in the store, and the PNG renderer mounts its own offscreen root — and it
   * means the form gets the whole width instead of a 304px column.
   */
  const isSubmitting = useSubmitStore((state) => state.screen !== 'closed')

  /*
   * The three columns are fixed-width by design, which at phone widths squeezes the
   * middle one to nothing: palette 240 + panel 304 is already wider than a 390px
   * screen, so the canvas rendered ZERO pixels wide and the "you can still read
   * your sketch" promise of the desktop guard was a lie (audit, 390x844).
   *
   * The attribute is written from the guard's own media query rather than a second
   * CSS breakpoint, so the layout switch and the notice can never disagree about
   * what counts as small. What it turns on lives in App.css.
   */
  const isSmallViewport = useSmallViewport()

  const handleDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return
    // Without preventDefault the browser refuses the drop and opens the file itself.
    if (event.dataTransfer.types.includes(FILES_DRAG_TYPE)) event.preventDefault()
  }

  const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return

    const file = draggedDesignFile(event)
    if (!file) return

    event.preventDefault()
    void requestDesignImport(file)
  }

  return (
    <div
      className="app-shell"
      data-small-viewport={isSmallViewport ? 'true' : 'false'}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <AppHeader />
      <StorageNotice />
      <DesignImportConfirm />
      <DesignToast />
      <div className="app-shell__body">
        {isSubmitting ? (
          <SubmitView />
        ) : (
          <>
            <BlockPalette />
            <div className="app-shell__stage">
              <PageStrip />
              <CanvasArea />
              <BlankStartCoach />
            </div>
            <SidePanel />
          </>
        )}
      </div>
      <TemplatePicker />
      {/* Both are chrome, and both are last: neither can touch the document, and
          the tour suppresses itself while either of the other two is up. */}
      <DesktopGuard />
      <OnboardingTour />
    </div>
  )
}
