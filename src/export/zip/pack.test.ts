import { createHash } from 'node:crypto'

import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import {
  ZIP_ENTRY_DAY,
  ZIP_ENTRY_HOUR,
  ZIP_ENTRY_MONTH,
  ZIP_ENTRY_YEAR,
} from './constants.ts'
import { assetEntry, orderEntries, renderEntry, textEntry, type PackageEntry } from './entries.ts'
import { compressionLevelFor, packZip } from './pack.ts'

/**
 * THE ARCHIVE ITSELF — `docs/export-format.md` §1 layout, write order and the
 * determinism the round-trip protocol depends on.
 *
 * The headers are read back BY HAND rather than through fflate: the point of
 * these assertions is that the bytes on disk carry a fixed timestamp and no
 * extra fields, and a reader written by the same library that wrote them could
 * agree with a mistake.
 */

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text)

const png = (fill: number, length = 120): Uint8Array => {
  const bytes = new Uint8Array(length)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  bytes.fill(fill, 8)
  return bytes
}

function fixtureEntries(): PackageEntry[] {
  return [
    textEntry('site.json', utf8('{\n  "schemaVersion": 1\n}\n')),
    textEntry('brief.md', utf8('# Build this site\n')),
    renderEntry('pages/01-home.png', png(0x11), true),
    renderEntry('pages/02-contact.png', png(0x22), false),
    assetEntry('assets/img_001.jpg', png(0x33, 200)),
  ]
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

/* ---------------------------------------------------------------------- */
/* Hand-rolled central-directory reader                                     */
/* ---------------------------------------------------------------------- */

interface LocalHeader {
  name: string
  method: number
  flags: number
  dosDateTime: number
  extraLength: number
}

const LOCAL_SIGNATURE = 0x04034b50
const CENTRAL_SIGNATURE = 0x02014b50

function readLocalHeaders(zip: Uint8Array): LocalHeader[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const headers: LocalHeader[] = []
  let offset = 0

  while (offset + 30 <= zip.length && view.getUint32(offset, true) === LOCAL_SIGNATURE) {
    const flags = view.getUint16(offset + 6, true)
    const method = view.getUint16(offset + 8, true)
    const dosDateTime = view.getUint32(offset + 10, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const name = new TextDecoder().decode(zip.subarray(offset + 30, offset + 30 + nameLength))

    headers.push({ name, method, flags, dosDateTime, extraLength })
    offset += 30 + nameLength + extraLength + compressedSize
  }
  return headers
}

function centralExtraLengths(zip: Uint8Array): number[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const lengths: number[] = []

  for (let offset = 0; offset + 46 <= zip.length; offset += 1) {
    if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) continue
    lengths.push(view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true))
  }
  return lengths
}

describe('§1 zip layout', () => {
  it('writes exactly the four artifact kinds, in the §1 order', () => {
    const zip = packZip(fixtureEntries())

    expect(Object.keys(unzipSync(zip))).toEqual([
      'site.json',
      'brief.md',
      'pages/01-home.png',
      'pages/02-contact.png',
      'assets/img_001.jpg',
    ])
  })

  it('sorts the entries itself, so the caller does not have to', () => {
    const shuffled = [...fixtureEntries()].reverse()

    expect(orderEntries(shuffled).map((entry) => entry.path)).toEqual([
      'site.json',
      'brief.md',
      'pages/01-home.png',
      'pages/02-contact.png',
      'assets/img_001.jpg',
    ])
  })

  it('orders by code unit, so no collation table can reorder an archive', () => {
    // `-` and `_` are ignorable in some collations, which would put these two
    // the other way round under `localeCompare`.
    const pages = [
      renderEntry('pages/02-a-b.png', png(0x44), false),
      renderEntry('pages/01-ab.png', png(0x55), false),
    ]

    expect(orderEntries(pages).map((entry) => entry.path)).toEqual([
      'pages/01-ab.png',
      'pages/02-a-b.png',
    ])
    expect(orderEntries([...pages].reverse()).map((entry) => entry.path)).toEqual([
      'pages/01-ab.png',
      'pages/02-a-b.png',
    ])
  })

  it('uses forward slashes and no relative prefixes', () => {
    const names = Object.keys(unzipSync(packZip(fixtureEntries())))

    for (const name of names) {
      expect(name).not.toContain('\\')
      expect(name.startsWith('./')).toBe(false)
      expect(name.startsWith('/')).toBe(false)
    }
  })

  it('writes no directory entries — `pages/` and `assets/` exist only as paths', () => {
    const names = Object.keys(unzipSync(packZip(fixtureEntries())))

    expect(names.some((name) => name.endsWith('/'))).toBe(false)
    expect(names).toHaveLength(5)
  })

  it('omits assets/ entirely when the design references no uploaded image', () => {
    const noAssets = fixtureEntries().filter((entry) => entry.kind !== 'asset')

    const names = Object.keys(unzipSync(packZip(noAssets)))
    expect(names.some((name) => name.startsWith('assets/'))).toBe(false)
    expect(names).toEqual(['site.json', 'brief.md', 'pages/01-home.png', 'pages/02-contact.png'])
  })

  it('round-trips the bytes it was given', () => {
    const unpacked = unzipSync(packZip(fixtureEntries()))

    expect(new TextDecoder().decode(unpacked['brief.md'])).toBe('# Build this site\n')
    expect(unpacked['pages/01-home.png']).toEqual(png(0x11))
  })
})

describe('rung 0 — store the images, deflate the text', () => {
  it('picks the level from the entry kind', () => {
    const [site, , render, , asset] = fixtureEntries()

    expect(compressionLevelFor(site!)).toBe(9)
    expect(compressionLevelFor(render!)).toBe(0)
    expect(compressionLevelFor(asset!)).toBe(0)
  })

  it('writes deflate for text and store for already-compressed payloads', () => {
    const headers = readLocalHeaders(packZip(fixtureEntries()))
    const methodOf = (name: string): number =>
      headers.find((header) => header.name === name)?.method ?? -1

    expect(methodOf('site.json')).toBe(8)
    expect(methodOf('brief.md')).toBe(8)
    expect(methodOf('pages/01-home.png')).toBe(0)
    expect(methodOf('assets/img_001.jpg')).toBe(0)
  })
})

describe('determinism', () => {
  it('produces byte-identical archives for the same bundle', () => {
    expect(sha256(packZip(fixtureEntries()))).toBe(sha256(packZip(fixtureEntries())))
  })

  it('produces the same archive whatever order the caller supplies the entries in', () => {
    const shuffled = [fixtureEntries()[4]!, fixtureEntries()[1]!, fixtureEntries()[3]!, fixtureEntries()[0]!, fixtureEntries()[2]!]

    expect(sha256(packZip(shuffled))).toBe(sha256(packZip(fixtureEntries())))
  })

  it('stamps every entry with the fixed timestamp, not the wall clock', () => {
    // Computed from the LITERAL constants, so this fails if the encoded value
    // ever starts depending on the runner's timezone.
    const expected =
      ((ZIP_ENTRY_YEAR - 1980) << 25) |
      (ZIP_ENTRY_MONTH << 21) |
      (ZIP_ENTRY_DAY << 16) |
      (ZIP_ENTRY_HOUR << 11)

    for (const header of readLocalHeaders(packZip(fixtureEntries()))) {
      expect(header.dosDateTime >>> 0).toBe(expected >>> 0)
    }
  })

  it('writes no extra fields and no data descriptors', () => {
    const zip = packZip(fixtureEntries())

    for (const header of readLocalHeaders(zip)) {
      expect(header.extraLength).toBe(0)
      // Bit 3 is the data-descriptor flag: set, the sizes move out of the header.
      expect(header.flags & 0b1000).toBe(0)
    }
    for (const length of centralExtraLengths(zip)) expect(length).toBe(0)
  })
})
