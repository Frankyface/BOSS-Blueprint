/**
 * EXPORT FIXTURES — a document that is the §7 worked example's ANCESTOR: run it
 * through `buildSiteJson` and you get `docs/export-format.md` §7.1 back.
 *
 * Deliberately hand-built with SEMANTIC internal ids (`rest-home-hero-title` shape)
 * so the §4.8 remap and V24's leak check have something real to remap and to catch.
 *
 * Test-support only. Uses `Buffer` for base64, which is fine here (Node) and is
 * exactly what production code must NOT do — `src/export/imageHeader.ts` has its own
 * decoder because it runs in the browser too.
 */

import { generateBrief } from '../export/brief/generateBrief.ts'
import type { ExportDocument, ExportDocumentBlock, SubmissionInfo } from '../export/siteJson.ts'
import { buildSiteJson } from '../export/siteJson.ts'
import type { SiteJson } from '../export/types.ts'
import type { PackageBundle } from '../export/validate/types.ts'

/** The internal id used for the home hero heading — V24's red-path canary. */
export const SEMANTIC_BLOCK_ID = 'rest-home-hero-title'

/**
 * A synthetic JPEG: a real SOI + SOF0 header declaring `width`×`height`, padded
 * with zeros to exactly `bytes` bytes. The export only ever parses the header, so
 * this exercises the real code path while letting a fixture pin `bytes` exactly.
 */
export function syntheticJpegDataUrl(width: number, height: number, bytes: number): string {
  const header = [
    0xff, 0xd8, // SOI
    0xff, 0xc0, 0x00, 0x11, 0x08, // SOF0, length 17, 8-bit precision
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  ]
  const buffer = Buffer.alloc(bytes)
  buffer.set(header.slice(0, Math.min(header.length, bytes)))
  return `data:image/jpeg;base64,${buffer.toString('base64')}`
}

/** A synthetic PNG: signature + IHDR declaring `width`×`height`, zero-padded. */
export function syntheticPngDataUrl(width: number, height: number, bytes = 64): string {
  const buffer = Buffer.alloc(Math.max(bytes, 24))
  buffer.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  buffer.writeUInt32BE(width, 16)
  buffer.writeUInt32BE(height, 20)
  return `data:image/png;base64,${buffer.toString('base64')}`
}

/** A synthetic lossy WebP: RIFF/WEBP + a `VP8 ` chunk carrying the dimensions. */
export function syntheticWebpDataUrl(width: number, height: number, bytes = 64): string {
  const buffer = Buffer.alloc(Math.max(bytes, 32))
  buffer.write('RIFF', 0, 'ascii')
  buffer.write('WEBP', 8, 'ascii')
  buffer.write('VP8 ', 12, 'ascii')
  buffer.writeUInt16LE(width & 0x3fff, 26)
  buffer.writeUInt16LE(height & 0x3fff, 28)
  return `data:image/webp;base64,${buffer.toString('base64')}`
}

/** The §7.1 asset: `IMG_4382.jpeg`, 1600×1200, 214733 bytes. */
export const BLUEBIRD_PHOTO = syntheticJpegDataUrl(1600, 1200, 214_733)

export const BLUEBIRD_SUBMISSION: SubmissionInfo = {
  id: '3f2a9c1e-8b4d-4e6a-9c0d-5b7e2f1a8d33',
  submittedAt: '2026-07-28T14:03:22Z',
  designCreatedAt: '2026-07-26T19:41:07Z',
  client: { name: 'Dana Whitfield', email: 'dana@bluebirdbakery.ca' },
  appVersion: '1.0.0',
}

function block(fields: ExportDocumentBlock): ExportDocumentBlock {
  return fields
}

/** The document behind §7.1 — two pages, ten + six blocks, two pen strokes. */
export function bluebirdDocument(): ExportDocument {
  return {
    siteSettings: {
      businessName: 'Bluebird Bakery',
      tagline: 'Small-batch sourdough in Halifax',
      about:
        "We're a family-run bakery on Agricola Street. We mill our own flour and bake sourdough, pastries, and seasonal pies. Open Wednesday to Sunday.",
      vibe: 'warm',
      styleNotes: 'Cozy but not twee. We like lots of cream space and dark green accents.',
      colors: ['#2F5D50', '#F5EFE0'],
    },
    pages: [
      {
        id: 'page-home',
        name: 'Home',
        blocks: [
          block({
            id: 'home-hero-band',
            type: 'section',
            x: 0,
            y: 80,
            width: 1200,
            height: 520,
            text: '',
            background: '#F5EFE0',
          }),
          block({
            id: 'home-story-band',
            type: 'section',
            x: 0,
            y: 640,
            width: 1200,
            height: 420,
            text: '',
          }),
          block({
            id: 'home-nav',
            type: 'nav-bar',
            x: 0,
            y: 0,
            width: 1200,
            height: 64,
            text: 'Home, Contact',
            items: [
              { id: 'home-nav-1', label: 'Home', link: { kind: 'page', pageId: 'page-home' } },
              { id: 'home-nav-2', label: 'Contact', link: { kind: 'page', pageId: 'page-contact' } },
            ],
          }),
          block({
            id: SEMANTIC_BLOCK_ID,
            type: 'heading',
            x: 80,
            y: 160,
            width: 640,
            height: 96,
            text: 'Bread worth crossing town for',
            copyMode: 'real',
            generateDescription: '',
            lengthHint: '',
          }),
          block({
            id: 'home-hero-intro',
            type: 'text',
            x: 80,
            y: 280,
            width: 560,
            height: 120,
            text: '',
            copyMode: 'generate',
            generateDescription:
              'Warm two-sentence intro about a family-run sourdough bakery that mills its own flour',
            lengthHint: '~2 sentences',
          }),
          block({
            id: 'home-hero-cta',
            type: 'button',
            x: 80,
            y: 432,
            width: 200,
            height: 56,
            text: 'Visit us',
            link: { kind: 'page', pageId: 'page-contact' },
          }),
          block({
            id: 'home-hero-photo',
            type: 'image',
            x: 760,
            y: 144,
            width: 360,
            height: 400,
            text: '',
            imageData: BLUEBIRD_PHOTO,
            originalFilename: 'IMG_4382.jpeg',
            fit: 'cover',
            description: 'Our best-selling country loaf on the wooden counter',
          }),
          block({
            id: 'home-story-title',
            type: 'heading',
            x: 80,
            y: 700,
            width: 400,
            height: 64,
            text: 'Our story',
            copyMode: 'real',
            generateDescription: '',
            lengthHint: '',
          }),
          block({
            id: 'home-story-body',
            type: 'text',
            x: 80,
            y: 788,
            width: 1040,
            height: 200,
            text: 'Bluebird started in our home kitchen in 2019. Today we bake from a little shop on Agricola Street, same starter, same stubborn attention to crumb.',
            copyMode: 'real',
            generateDescription: '',
            lengthHint: '',
          }),
          block({
            id: 'home-menu-cta',
            type: 'button',
            x: 80,
            y: 1000,
            width: 200,
            height: 56,
            text: 'See our menu',
            link: { kind: 'none' },
          }),
        ],
        penStrokes: [
          {
            id: 'stroke-loop',
            points: [
              { x: 810.0, y: 210.5 },
              { x: 905.2, y: 188.0 },
              { x: 1010.4, y: 236.7 },
              { x: 1078.9, y: 330.2 },
              { x: 988.1, y: 402.6 },
              { x: 842.3, y: 388.9 },
            ],
            color: '#D94F30',
            width: 4,
          },
          {
            id: 'stroke-arrow',
            points: [
              { x: 60.0, y: 500.0 },
              { x: 140.5, y: 522.3 },
              { x: 252.8, y: 512.1 },
              { x: 300.2, y: 468.4 },
            ],
            color: '#2B6CB0',
            width: 4,
          },
        ],
      },
      {
        id: 'page-contact',
        name: 'Contact',
        blocks: [
          block({
            id: 'contact-band',
            type: 'section',
            x: 0,
            y: 80,
            width: 1200,
            height: 560,
            text: '',
          }),
          block({
            id: 'contact-nav',
            type: 'nav-bar',
            x: 0,
            y: 0,
            width: 1200,
            height: 64,
            text: 'Home, Contact',
            items: [
              { id: 'contact-nav-1', label: 'Home', link: { kind: 'page', pageId: 'page-home' } },
              {
                id: 'contact-nav-2',
                label: 'Contact',
                link: { kind: 'page', pageId: 'page-contact' },
              },
            ],
          }),
          block({
            id: 'contact-title',
            type: 'heading',
            x: 80,
            y: 160,
            width: 500,
            height: 80,
            text: 'Come say hi',
            copyMode: 'real',
            generateDescription: '',
            lengthHint: '',
          }),
          block({
            id: 'contact-details',
            type: 'text',
            x: 80,
            y: 264,
            width: 440,
            height: 160,
            text: '123 Agricola St, Halifax\nWed–Sun 8am–2pm\nhello@bluebirdbakery.ca',
            copyMode: 'real',
            generateDescription: '',
            lengthHint: '',
          }),
          block({
            id: 'contact-storefront',
            type: 'image',
            x: 640,
            y: 160,
            width: 480,
            height: 360,
            text: '',
            imageData: '',
            originalFilename: '',
            fit: 'cover',
            description: "A photo of our storefront from the street — we'll take this next week",
          }),
          block({
            id: 'contact-instagram',
            type: 'button',
            x: 80,
            y: 470,
            width: 240,
            height: 56,
            text: 'Follow on Instagram',
            link: { kind: 'external', url: 'https://instagram.com/bluebirdbakery' },
          }),
        ],
        penStrokes: [],
      },
    ],
  }
}

/**
 * A FULLY EVIDENCED, VALID package built from `bluebirdDocument()` — the green path
 * every V-rule is asserted silent on. The optional evidence (staged bytes, rendered
 * PNGs, zip entries, internal ids) is filled in so the rules that need it actually
 * run rather than skipping.
 */
export function bluebirdPackage(): PackageBundle {
  const site = buildSiteJson(bluebirdDocument(), BLUEBIRD_SUBMISSION)
  return {
    site,
    brief: generateBrief(site),
    stagedAssets: site.assets.map((asset) => ({
      path: asset.path,
      byteLength: asset.bytes,
      width: asset.width,
      height: asset.height,
      mimeType: asset.mimeType,
    })),
    renderedPages: site.pages.map((page) => ({
      path: page.screenshot,
      width: 1200,
      height: page.height,
      nonBlank: true,
    })),
    zipEntries: [
      'site.json',
      'brief.md',
      ...site.pages.map((page) => page.screenshot),
      ...site.assets.map((asset) => asset.path),
    ],
    zipBytes: 240_000,
    internalIds: [SEMANTIC_BLOCK_ID, 'page-home', 'page-contact', 'home-nav-1', 'stroke-loop'],
    stagedDataUrls: new Map(site.assets.map((asset) => [asset.path, BLUEBIRD_PHOTO])),
  }
}

/**
 * A red-path bundle: deep-clone the green one and break exactly one thing. The
 * clone is a JSON round-trip so no rule can accidentally see the green object.
 */
export function brokenPackage(
  breakIt: (site: SiteJson) => SiteJson | void,
  options: { regenerateBrief?: boolean } = {},
): PackageBundle {
  const green = bluebirdPackage()
  const clone = JSON.parse(JSON.stringify(green.site)) as SiteJson
  const site = breakIt(clone) ?? clone
  return {
    ...green,
    site,
    brief: options.regenerateBrief === false ? green.brief : generateBrief(site),
  }
}
