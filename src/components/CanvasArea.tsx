import './CanvasArea.css'

const CANVAS_LABEL = 'Page canvas'
const EMPTY_HEADLINE = 'Your page starts here'
const EMPTY_BODY = 'This is where your website page gets laid out. The canvas lands in the next build step.'

/** Empty page canvas placeholder — no drawing engine is wired up yet. */
export function CanvasArea() {
  return (
    <main className="canvas-area" aria-label={CANVAS_LABEL} data-testid="canvas-area">
      <div className="canvas-area__page">
        <p className="canvas-area__headline">{EMPTY_HEADLINE}</p>
        <p className="canvas-area__body">{EMPTY_BODY}</p>
      </div>
    </main>
  )
}
