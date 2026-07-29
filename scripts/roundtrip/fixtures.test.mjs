// @vitest-environment node
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { FIXTURES, FIXTURE_HEIGHT, FIXTURE_WIDTH, writeFixtures } from './fixtures/make-fixtures.mjs'
import { dHash, decodeImage, dominantColours, hamming, isGrayscale } from './lib/image-metrics.mjs'
import { DHASH_MAX_HAMMING } from './thresholds.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const COMMITTED = path.join(HERE, 'fixtures')

const sha = (buffer) => createHash('sha256').update(buffer).digest('hex')

/**
 * R1.5 — "a fixture that silently drifts would move every perceptual-hash and
 * dominant-colour result in R8 without anyone noticing". So: regenerate into a temp dir
 * and byte-compare.
 */
describe('R1.5 — the committed fixtures are byte-stable', () => {
  it('regenerates byte-identically', async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'bp-fixtures-'))
    try {
      await writeFixtures(temp)
      for (const spec of FIXTURES) {
        const [committed, regenerated] = await Promise.all([
          readFile(path.join(COMMITTED, spec.file)),
          readFile(path.join(temp, spec.file)),
        ])
        expect(sha(regenerated), `${spec.file} drifted`).toBe(sha(committed))
      }
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  })

  it('are 1600x1200 JPEGs, so the app compresses without resizing', async () => {
    for (const spec of FIXTURES) {
      const image = decodeImage(await readFile(path.join(COMMITTED, spec.file)))
      expect(image.width).toBe(FIXTURE_WIDTH)
      expect(image.height).toBe(FIXTURE_HEIGHT)
    }
  })

  it('are pairwise distinguishable by dHash, with room to spare above H7 threshold', async () => {
    const hashes = []
    for (const spec of FIXTURES) hashes.push(dHash(decodeImage(await readFile(path.join(COMMITTED, spec.file)))))
    for (let i = 0; i < hashes.length; i += 1) {
      for (let j = i + 1; j < hashes.length; j += 1) {
        expect(hamming(hashes[i], hashes[j]), `${FIXTURES[i].file} vs ${FIXTURES[j].file}`).toBeGreaterThan(
          DHASH_MAX_HAMMING,
        )
      }
    }
  })

  it('each carry at least one non-grayscale dominant colour, so S5 has a signal', async () => {
    // Only ONE is required: fixture-wall is deliberately a near-neutral grey-green (its
    // base and accent both sit inside isGrayscale's tolerance), which is exactly the sort
    // of photograph a real client uploads. A fixture with NO chromatic dominant would be
    // useless to S5, and that is what this guards.
    for (const spec of FIXTURES) {
      const dominants = dominantColours(decodeImage(await readFile(path.join(COMMITTED, spec.file))))
      expect(dominants.filter((d) => !isGrayscale(d.rgb)).length, spec.file).toBeGreaterThanOrEqual(1)
    }
  })
})
