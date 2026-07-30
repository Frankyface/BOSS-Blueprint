import { describe, expect, it } from 'vitest'

import { extractExampleSiteJsonText, readSpec } from '../../test/specFixtures.ts'
import type { ExportPage, ExportPenRegion, ExportPenStroke, SiteJson } from '../types.ts'

import { clustersOf } from './pen.ts'

/**
 * §4.4 [N7], amended: CLUSTERS FORM OVER THE PAGE'S UNCLAIMED STROKES.
 *
 * Without this, ink that became a region is narrated TWICE — once as "build this
 * card" and once as "a handwritten annotation, read it in the PNG" — which is a
 * flat contradiction for a zero-context builder, and the contradiction lands on
 * exactly the ink the client cared most about.
 *
 * The amendment is definitional, not behavioural, for every package that existed
 * before regions did: a page with no `penRegions` claims nothing, so its clusters
 * are the clusters it always had. The §7.1 case below is that proof.
 */

const specSite = JSON.parse(extractExampleSiteJsonText(readSpec())) as SiteJson

function stroke(id: string, x: number, y: number): ExportPenStroke {
  return {
    id,
    points: [
      [x, y],
      [x + 30, y + 10],
      [x + 60, y],
    ],
    color: '#2B6CB0',
    width: 4,
    role: 'annotation',
    targetBlockId: null,
  }
}

function region(id: string, strokeIds: readonly string[]): ExportPenRegion {
  return {
    id,
    kind: 'panel',
    variant: 'card',
    confidence: 'clear',
    bbox: { x: 0, y: 0, w: 10, h: 10 },
    strokeIds,
    parentRegionId: null,
    setId: null,
    setIndex: null,
    text: null,
  }
}

/** Three marks far enough apart that each is its own [N7] cluster. */
function pageOf(penRegions?: readonly ExportPenRegion[]): ExportPage {
  return {
    id: 'pg_0001',
    name: 'Home',
    slug: 'home',
    height: 1600,
    screenshot: 'pages/01-home.png',
    blocks: [],
    penStrokes: [stroke('stk_0001', 100, 100), stroke('stk_0002', 100, 600), stroke('stk_0003', 100, 1100)],
    ...(penRegions === undefined ? {} : { penRegions }),
  }
}

describe('clustersOf — the §7.1 page is untouched by the amendment', () => {
  const page = specSite.pages[0]

  it('still yields exactly two annotation clusters on the worked example', () => {
    expect(page && clustersOf(page)).toHaveLength(2)
  })

  it('still covers both of its strokes, in the order the fixture prints them', () => {
    expect(page && clustersOf(page).flatMap((cluster) => cluster.strokes.map((s) => s.id))).toEqual([
      'stk_0001',
      'stk_0002',
    ])
  })
})

describe('clustersOf — region-claimed strokes leave the annotation pool', () => {
  it('clusters every stroke when the page claims none', () => {
    expect(clustersOf(pageOf()).map((cluster) => cluster.strokes.map((s) => s.id))).toEqual([
      ['stk_0001'],
      ['stk_0002'],
      ['stk_0003'],
    ])
  })

  it('drops the claimed stroke and keeps the rest', () => {
    const clusters = clustersOf(pageOf([region('reg_0001', ['stk_0002'])]))
    expect(clusters.map((cluster) => cluster.strokes.map((s) => s.id))).toEqual([
      ['stk_0001'],
      ['stk_0003'],
    ])
  })

  it('returns nothing when every stroke became a region', () => {
    expect(clustersOf(pageOf([region('reg_0001', ['stk_0001', 'stk_0002', 'stk_0003'])]))).toEqual([])
  })

  it('ignores a claim on a stroke that is not on this page rather than throwing', () => {
    expect(clustersOf(pageOf([region('reg_0001', ['stk_9999'])]))).toHaveLength(3)
  })
})
