import { copyModeOf } from '../canvas/blockEdits.ts'
import type { Block, CopyMode } from '../canvas/types.ts'
import { useCommittedField } from '../hooks/useCommittedField.ts'
import { useCanvasStore } from '../store/canvasStore.ts'

const MODE_LABELS: Readonly<Record<CopyMode, string>> = {
  real: 'My words',
  generate: 'Write it for me',
}

/**
 * The description IS the prompt Claude fulfils at build time (Stage 3's brief lists
 * every generate block with its description), so this placeholder coaches a good
 * one instead of saying "description".
 */
const DESCRIPTION_PLACEHOLDER =
  'What should this say? e.g. "warm welcome for our family bakery — mention we have been on Main Street since 1998"'

const LENGTH_HINT_PLACEHOLDER = 'e.g. ~2 sentences, or just a few words'

const GENERATE_EXPLAINER = "We'll write this for you from your description when we build the site."

interface CopyModeEditorProps {
  block: Block
}

/** Heading and Text blocks: whose words are these, and if ours, what should they say? */
export function CopyModeEditor({ block }: CopyModeEditorProps) {
  const setBlockCopyMode = useCanvasStore((state) => state.setBlockCopyMode)
  const setBlockGenerateDescription = useCanvasStore((state) => state.setBlockGenerateDescription)
  const setBlockLengthHint = useCanvasStore((state) => state.setBlockLengthHint)

  const mode = copyModeOf(block)

  const description = useCommittedField(
    block.generateDescription ?? '',
    (next) => {
      setBlockGenerateDescription(block.id, next)
    },
    { commitOnEnter: false },
  )

  const lengthHint = useCommittedField(block.lengthHint ?? '', (next) => {
    setBlockLengthHint(block.id, next)
  })

  return (
    <section className="side-panel__section" data-testid="copy-mode-editor" data-copy-mode={mode}>
      <h3 className="side-panel__heading">Words</h3>

      <div className="copy-mode" role="group" aria-label="Who writes this copy">
        {(Object.keys(MODE_LABELS) as CopyMode[]).map((candidate) => (
          <button
            key={candidate}
            type="button"
            className="copy-mode__option"
            data-testid={`copy-mode-${candidate}`}
            aria-pressed={mode === candidate}
            onClick={() => {
              setBlockCopyMode(block.id, candidate)
            }}
          >
            {MODE_LABELS[candidate]}
          </button>
        ))}
      </div>

      {mode === 'generate' && (
        <>
          <p className="side-panel__hint">{GENERATE_EXPLAINER}</p>
          <label className="side-panel__label">
            <span className="side-panel__label-text">What should it say?</span>
            <textarea
              className="side-panel__control side-panel__control--tall"
              data-testid="copy-description"
              placeholder={DESCRIPTION_PLACEHOLDER}
              {...description}
            />
          </label>
          <label className="side-panel__label">
            <span className="side-panel__label-text">How long? (optional)</span>
            <input
              type="text"
              className="side-panel__control"
              data-testid="copy-length-hint"
              placeholder={LENGTH_HINT_PLACEHOLDER}
              {...lengthHint}
            />
          </label>
        </>
      )}
    </section>
  )
}
