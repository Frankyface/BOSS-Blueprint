import { hasImage, imageDescriptionOf, imageFitOf } from '../canvas/blockEdits.ts'
import { IMAGE_FITS } from '../canvas/imageAssets.ts'
import type { Block, ImageFit } from '../canvas/types.ts'
import { useCommittedField } from '../hooks/useCommittedField.ts'
import { useCanvasStore } from '../store/canvasStore.ts'

const FIT_LABELS: Readonly<Record<ImageFit, string>> = {
  cover: 'Fill the frame',
  contain: 'Fit it all in',
}

const FIT_HINTS: Readonly<Record<ImageFit, string>> = {
  cover: 'The photo fills the box; the edges may be cropped.',
  contain: 'The whole photo is shown, with space around it.',
}

/**
 * The placeholder coaches the answer we actually need. An empty slot with a
 * description is a deliberate instruction, so the example is a real one a client
 * could copy the shape of.
 */
const DESCRIPTION_PLACEHOLDER =
  "What should this photo show? e.g. 'Our dining room at golden hour'"

const EMPTY_SLOT_EXPLAINER =
  "No photo yet? That's fine — describe what should go here and we'll source or create it " +
  'when we build your site. An empty box with a description is an instruction, not a gap.'

const FILLED_SLOT_EXPLAINER =
  'Anything we should know about this photo? It guides how we crop it and what we write ' +
  'about it — it is never shown on the site as-is.'

interface ImageSettingsProps {
  block: Block
}

/** Image slots: how the photo sits in its frame, and what the client wants there. */
export function ImageSettings({ block }: ImageSettingsProps) {
  const setBlockImageFit = useCanvasStore((state) => state.setBlockImageFit)
  const setBlockImageDescription = useCanvasStore((state) => state.setBlockImageDescription)
  const setBlockImage = useCanvasStore((state) => state.setBlockImage)

  const fit = imageFitOf(block)
  const filled = hasImage(block)

  const description = useCommittedField(
    imageDescriptionOf(block),
    (next) => {
      setBlockImageDescription(block.id, next)
    },
    { commitOnEnter: false },
  )

  return (
    <section className="side-panel__section" data-testid="image-settings" data-has-image={filled ? 'true' : 'false'}>
      <h3 className="side-panel__heading">Photo</h3>

      {filled && (
        <>
          <div className="copy-mode" role="group" aria-label="How the photo fills its frame">
            {IMAGE_FITS.map((candidate) => (
              <button
                key={candidate}
                type="button"
                className="copy-mode__option"
                data-testid={`image-fit-${candidate}`}
                aria-pressed={fit === candidate}
                onClick={() => {
                  setBlockImageFit(block.id, candidate)
                }}
              >
                {FIT_LABELS[candidate]}
              </button>
            ))}
          </div>
          <p className="side-panel__hint">{FIT_HINTS[fit]}</p>
          <button
            type="button"
            className="side-panel__button side-panel__button--danger"
            data-testid="image-remove"
            onClick={() => {
              setBlockImage(block.id, '')
            }}
          >
            Remove photo
          </button>
        </>
      )}

      <p className="side-panel__hint" data-testid="image-slot-explainer">
        {filled ? FILLED_SLOT_EXPLAINER : EMPTY_SLOT_EXPLAINER}
      </p>

      <label className="side-panel__label">
        <span className="side-panel__label-text">About this photo</span>
        <textarea
          className="side-panel__control side-panel__control--tall"
          data-testid="image-description"
          placeholder={DESCRIPTION_PLACEHOLDER}
          {...description}
        />
      </label>
    </section>
  )
}
