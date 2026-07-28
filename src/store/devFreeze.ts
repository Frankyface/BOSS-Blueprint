import type { Block } from '../canvas/types.ts'

/**
 * Dev/test-only immutability tripwire.
 *
 * "Immutable state updates only" is a house rule the unit tests assert *after the
 * fact* — they compare a pre-action snapshot and check the array identity changed.
 * That catches a mutation only where a test happens to look. Freezing the document
 * turns the rule into something the runtime enforces everywhere: any code that
 * writes `block.x = …` or `blocks.push(…)` throws on the spot, in strict mode, at
 * the line that did it.
 *
 * Only the DOCUMENT is frozen (the blocks array and each block). Freezing the whole
 * state object would also freeze the action closures for no benefit, and Zustand
 * replaces that object on every `set` anyway.
 *
 * Like the store test bridge, the guard is written inline so the bundler can fold
 * it: in a real production build both `import.meta.env` reads become constants, the
 * branch is unreachable and the whole body is dropped. It survives in `vite dev`,
 * in Vitest (MODE === 'test') and in the `--mode test` E2E build.
 */

interface FreezableStore {
  getState: () => { blocks: readonly Block[] }
  subscribe: (listener: (state: { blocks: readonly Block[] }) => void) => () => void
}

/** No-op in a production build. Returns the unsubscribe so tests can detach it. */
export function installDocumentFreeze(store: FreezableStore): () => void {
  // Written inline, exactly like installStoreTestBridge: the guard must be the
  // FIRST statement of this function for the minifier to fold it and drop the rest
  // of the body. Hoisting it into an `isDevelopmentLikeBuild()` helper leaves the
  // dead code in the deployed bundle — verified by grepping dist/.
  if (!(import.meta.env.DEV || import.meta.env.MODE === 'test')) return () => undefined

  const freeze = (blocks: readonly Block[]): void => {
    for (const block of blocks) Object.freeze(block)
    Object.freeze(blocks)
  }

  freeze(store.getState().blocks)
  return store.subscribe((state) => {
    freeze(state.blocks)
  })
}
