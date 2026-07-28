import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from 'react'

import { imageDataOf, imageDescriptionOf, imageFitOf } from '../canvas/blockEdits.ts'
import { pageOfBlock } from '../canvas/document.ts'
import { IMAGE_ACCEPT_ATTRIBUTE } from '../canvas/imageAssets.ts'
import { compressImage, ImageIngestError } from '../canvas/imageCompression.ts'
import { browserImagePorts } from '../platform/browserImagePorts.ts'
import type { Block } from '../canvas/types.ts'
import { documentOf, selectCurrentBlocks, useCanvasStore } from '../store/canvasStore.ts'
import { useEditorStore } from '../store/editorStore.ts'

const IMAGE_GLYPH = '⛰'
const EMPTY_CAPTION = 'Image'
const ADD_LABEL = 'Add photo'
const REPLACE_LABEL = 'Replace'
const BUSY_LABEL = 'Working…'

const UNEXPECTED_FAILURE =
  "Something went wrong while adding that photo. Please try again, or pick a different file."

const SLOT_WENT_AWAY =
  "That photo finished loading, but the image box it was for is gone. Add the box back and " +
  'pick the photo again.'

/** The same news, for the client who simply walked to another page mid-upload. */
const slotOnAnotherPage = (pageName: string): string =>
  `That photo finished loading, but its image box is on the "${pageName}" page. ` +
  'Go back to that page and pick the photo again.'

interface ImageSlotProps {
  block: Block
}

function firstFileOf(list: FileList | null | undefined): File | null {
  return list && list.length > 0 ? (list.item(0) ?? null) : null
}

/**
 * AN IMAGE SLOT on the page: the picture if there is one, and the way to put one
 * there if there isn't.
 *
 * Three ways in, because a client will try all three: the button, a double-click
 * anywhere on the slot (handled by `BlockView` — an image block has no inline text
 * editor for a double-click to collide with), and dropping a file onto it.
 *
 * Every one of them goes through the same ingest: validate at the boundary,
 * compress, then ONE store write. Rejections are said out loud in the design toast
 * — never swallowed, and never dressed up as a storage problem (the storage notice
 * is a different strip, for a different kind of bad news).
 */
export function ImageSlot({ block }: ImageSlotProps) {
  const setBlockImage = useCanvasStore((state) => state.setBlockImage)
  const setToast = useEditorStore((state) => state.setToast)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [isDropTarget, setIsDropTarget] = useState(false)

  const imageData = imageDataOf(block)
  const description = imageDescriptionOf(block)
  const fit = imageFitOf(block)

  /**
   * Clear OUR last complaint on a successful upload, and nothing else.
   *
   * The design toast is a single slot shared with messages like "three links now
   * point nowhere". Blanket-clearing it here would let a successful upload wipe an
   * unrelated message the client has not read yet; leaving it alone would leave a
   * stale rejection on screen after they picked a good file. So: clear it only
   * when what is showing is the exact message this slot put there.
   */
  const complaintRef = useRef<string | null>(null)

  const complain = (message: string) => {
    complaintRef.current = message
    setToast(message)
  }

  const withdrawComplaint = () => {
    const { toast, setToast: set } = useEditorStore.getState()
    if (complaintRef.current !== null && toast === complaintRef.current) set(null)
    complaintRef.current = null
  }

  /**
   * Is this slot still the thing the photo was chosen for — and if not, why not?
   *
   * Compressing a phone photo takes long enough for the client to delete the block
   * or switch pages while it runs. `setBlockImage` only ever touches the CURRENT
   * page, so a stale commit would land nowhere (or, if the block were gone, do
   * nothing at all) and the client would be left with a slot that stayed empty and
   * no explanation. Checking the store at commit time — not at pick time — is what
   * makes that honest. Not reproducible by hand, but the path is real.
   *
   * The two ways to get here are not the same news, and telling a client their
   * image box "is gone" when it is sitting safely on the page they just left is
   * both wrong and alarming (review follow-up). So the whole site is searched:
   * `null` means the commit can go ahead, and anything else is the message to say.
   */
  const commitBlocker = (): string | null => {
    const state = useCanvasStore.getState()
    if (selectCurrentBlocks(state).some((candidate) => candidate.id === block.id)) return null

    const home = pageOfBlock(documentOf(state), block.id)
    return home ? slotOnAnotherPage(home.name) : SLOT_WENT_AWAY
  }

  const ingest = async (file: File) => {
    setIsBusy(true)
    try {
      const compressed = await compressImage(file, browserImagePorts)

      const blocker = commitBlocker()
      if (blocker !== null) {
        complain(blocker)
        return
      }

      setBlockImage(block.id, compressed.dataUrl, compressed.originalFilename)
      withdrawComplaint()
    } catch (error) {
      complain(error instanceof ImageIngestError ? error.message : UNEXPECTED_FAILURE)
    } finally {
      setIsBusy(false)
    }
  }

  const handleFiles = (file: File | null) => {
    if (!file) return
    void ingest(file)
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFiles(firstFileOf(event.target.files))
    // Clear the input so choosing the SAME file twice still fires a change event.
    event.target.value = ''
  }

  const openPicker = () => {
    inputRef.current?.click()
  }

  /**
   * The block's own pointer handler would start a drag gesture and capture the
   * pointer, which retargets the click away from this button and makes it dead.
   */
  const swallowPointer = (event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation()
  }

  const handleDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDropTarget(true)
  }

  const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDropTarget(false)
    handleFiles(firstFileOf(event.dataTransfer.files))
  }

  const hasPhoto = imageData.length > 0

  return (
    <div
      className={`block-content block-content--image${hasPhoto ? ' block-content--image-filled' : ''}`}
      data-testid="image-slot"
      data-placeholder={hasPhoto ? 'false' : 'true'}
      data-has-image={hasPhoto ? 'true' : 'false'}
      data-fit={fit}
      data-drop-target={isDropTarget ? 'true' : 'false'}
      onDragOver={handleDragOver}
      onDragLeave={() => {
        setIsDropTarget(false)
      }}
      onDrop={handleDrop}
    >
      {hasPhoto ? (
        <img
          className="block-content__photo"
          data-testid="image-slot-photo"
          src={imageData}
          // The client's description is meta-commentary, not alt text (§2.7): the
          // export writes real alt text FROM it at build time. Decorative here.
          alt=""
          style={{ objectFit: fit }}
          draggable={false}
        />
      ) : (
        <>
          <span className="block-content__glyph" aria-hidden="true">
            {IMAGE_GLYPH}
          </span>
          <span className="block-content__caption" data-testid="image-slot-caption">
            {description.length > 0 ? description : EMPTY_CAPTION}
          </span>
        </>
      )}

      <button
        type="button"
        className="block-content__upload"
        data-testid="image-upload"
        disabled={isBusy}
        onPointerDown={swallowPointer}
        onClick={openPicker}
      >
        {isBusy ? BUSY_LABEL : hasPhoto ? REPLACE_LABEL : ADD_LABEL}
      </button>

      <input
        ref={inputRef}
        type="file"
        className="block-content__file-input"
        data-testid="image-file-input"
        accept={IMAGE_ACCEPT_ATTRIBUTE}
        onChange={handleInputChange}
      />
    </div>
  )
}
