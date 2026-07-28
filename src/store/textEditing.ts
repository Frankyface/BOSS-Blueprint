import { useCanvasStore } from './canvasStore.ts'

/**
 * OPENING THE INLINE EDITOR — the one door, whether the client double-clicked the
 * block or simply started typing at it.
 *
 * Type-to-edit has to hand the editor the character that opened it: the keystroke
 * that PowerPoint turns into the first letter of the new text happens before any
 * input exists to receive it, so it is parked here and picked up by
 * `BlockTextEditor` as it mounts.
 *
 * A module-level value rather than store state on purpose. It is not part of the
 * document, it is not an undo step, and it is not something any component should
 * re-render on — it exists for exactly one render, is read once, and is gone. The
 * one rule that keeps it honest: EVERY path into editing goes through
 * `beginTextEdit`, so the seed is always set (to a character, or to null) by the
 * action that opened the editor and can never be left over from an earlier one.
 */

let pendingSeed: string | null = null

/**
 * Start editing `blockId`, optionally seeding the editor with the keystroke that
 * asked for it. Blocks with no text (an image slot, a section band) refuse to
 * open; the seed is dropped with them rather than left waiting for the next edit.
 */
export function beginTextEdit(blockId: string, seedText: string | null = null): void {
  pendingSeed = seedText
  useCanvasStore.getState().startEditingBlock(blockId)

  if (useCanvasStore.getState().editingBlockId !== blockId) pendingSeed = null
}

/**
 * The character the editor about to mount was opened with, if any.
 *
 * Reading is deliberately separate from clearing: the editor needs this while it
 * is RENDERING (it is the initial draft), and a render must have no side effects —
 * React's StrictMode calls a state initialiser twice in development precisely to
 * catch one that does. `clearTextEditSeed` runs from the mount effect instead.
 */
export function pendingTextEditSeed(): string | null {
  return pendingSeed
}

export function clearTextEditSeed(): void {
  pendingSeed = null
}
