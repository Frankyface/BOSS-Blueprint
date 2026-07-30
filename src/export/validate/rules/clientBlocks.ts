/**
 * CLIENT-FACING BLOCK RULES — `docs/export-format.md` §5 V5, V8, V9(zero), V11,
 * V14, V19, V26.
 *
 * These are things the client can act on, so they run BEFORE the bug-class rules
 * and before V1: a client who left a text box empty must see "write something or
 * switch it to 'Write it for me'", never a schema error.
 */

import { finding, type Finding, type PackageBundle } from '../types.ts'
import { eachBlock, jumpTarget } from '../walk.ts'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const PLAUSIBLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const HTTP_URL = /^https?:\/\//

const isBlank = (value: string | null): boolean => value === null || value.trim() === ''

/** V5 — every `copyMode: "generate"` block has a non-empty `generateDescription`. */
export function v05GenerateDescription({ site }: PackageBundle): Finding[] {
  return eachBlock(site)
    .filter(
      (ref) =>
        (ref.block.type === 'heading' || ref.block.type === 'text') &&
        ref.block.copyMode === 'generate' &&
        isBlank(ref.block.generateDescription),
    )
    .map((ref) =>
      finding(
        'V05',
        'BLOCK',
        'client',
        'Tell us what to write here — this block is set to "Write it for me" but has no description.',
        [ref.block.id],
        jumpTarget(ref),
      ),
    )
}

/** V8 — the lead gate: a real name, a plausible email, a freshly minted v4 UUID. */
export function v08Submission({ site }: PackageBundle): Finding[] {
  const findings: Finding[] = []
  const { client, id } = site.submission

  if (client.name.trim() === '') {
    findings.push(finding('V08', 'BLOCK', 'client', 'Please tell us your name.', ['submission.client.name']))
  }
  if (!PLAUSIBLE_EMAIL.test(client.email)) {
    findings.push(
      finding('V08', 'BLOCK', 'client', 'That email address does not look right — please check it.', [
        'submission.client.email',
      ]),
    )
  }
  if (!UUID_V4.test(id)) {
    findings.push(
      finding('V08', 'BLOCK', 'bug', `submission.id is not a v4 UUID: ${JSON.stringify(id)}`, ['submission.id']),
    )
  }
  return findings
}

/**
 * V9 (BLOCK half) — at least one page, and a homepage with something on it.
 *
 * INK IS CONTENT. A pen stroke counts exactly as much as a block does: the whole
 * point of the tool is that a client can sketch a site by hand, so "you should be
 * able to build a site just from the pen alone even if no blocks were implemented"
 * has to be a state the exporter accepts, not one it refuses at the door. Before
 * this, a page drawn entirely with the pen could not leave the browser at all —
 * the strokes were in `site.json` and baked into the PNG, and the client was still
 * told their home page was empty.
 *
 * A `section` is still scenery rather than content (it is a coloured band with no
 * words in it), which is why the block test skips sections but the ink test does
 * not need an equivalent exemption — every stroke is something the client drew on
 * purpose.
 */
export function v09EmptySite({ site }: PackageBundle): Finding[] {
  if (site.pages.length === 0) {
    return [finding('V09', 'BLOCK', 'client', 'Sketch something first! There are no pages to send.', [])]
  }

  const home = site.pages[0]
  if (home === undefined) return []

  const hasBlock = home.blocks.some((block) => block.type !== 'section')
  const hasInk = home.penStrokes.length > 0

  if (!hasBlock && !hasInk) {
    return [
      finding(
        'V09',
        'BLOCK',
        'client',
        // The old wording was "add something to it", which is now wrong about what
        // counts: it sends a client who only ever wanted to draw off hunting for a
        // block. Both ways out are named.
        'Your home page is empty — add a block or draw something on it before sending.',
        [home.id],
        { pageId: home.id },
      ),
    ]
  }
  return []
}

/** V11 (BLOCK half) — an external URL the FIX pass could not repair. */
export function v11ExternalUrls({ site }: PackageBundle): Finding[] {
  return eachBlock(site)
    .flatMap((ref) => {
      const urls: string[] = []
      if (ref.block.type === 'button' && ref.block.link.kind === 'external') {
        urls.push(ref.block.link.url)
      }
      if (ref.block.type === 'navBar') {
        for (const item of ref.block.items) {
          if (item.link.kind === 'external') urls.push(item.link.url)
        }
      }
      return urls.filter((url) => !HTTP_URL.test(url)).map((url) =>
        finding(
          'V11',
          'BLOCK',
          'client',
          `Check this link — "${url}" is not a web address we can use.`,
          [ref.block.id],
          jumpTarget(ref),
        ),
      )
    })
}

/** V14 — the mirror of V5: an empty slot's description IS the sourcing prompt. */
export function v14EmptySlotDescription({ site }: PackageBundle): Finding[] {
  return eachBlock(site)
    .filter((ref) => ref.block.type === 'imageSlot' && ref.block.assetId === null && isBlank(ref.block.description))
    .map((ref) =>
      finding(
        'V14',
        'BLOCK',
        'client',
        'Tell us what image goes here — this slot is empty and has no description.',
        [ref.block.id],
        jumpTarget(ref),
      ),
    )
}

/** V19 — `copyMode: "real"` with blank text would build an empty element. */
export function v19BlankRealText({ site }: PackageBundle): Finding[] {
  return eachBlock(site)
    .filter(
      (ref) =>
        (ref.block.type === 'heading' || ref.block.type === 'text') &&
        ref.block.copyMode === 'real' &&
        ref.block.text.trim() === '',
    )
    .map((ref) =>
      finding(
        'V19',
        'BLOCK',
        'client',
        "This text box is empty — write something or switch it to 'Write it for me'.",
        [ref.block.id],
        jumpTarget(ref),
      ),
    )
}

/**
 * V26 (v2.1) — a blank button label or an empty nav bar. The schema already rejects
 * both; reclassifying them here is what gets the client a fixable message instead of
 * V1's "something went wrong".
 */
export function v26LabelsAndNavItems({ site }: PackageBundle): Finding[] {
  const findings: Finding[] = []

  for (const ref of eachBlock(site)) {
    if (ref.block.type === 'button' && ref.block.label.trim() === '') {
      findings.push(
        finding('V26', 'BLOCK', 'client', 'This button has no text — give it a label.', [ref.block.id], jumpTarget(ref)),
      )
    }
    if (ref.block.type === 'navBar') {
      if (ref.block.items.length === 0) {
        findings.push(
          finding('V26', 'BLOCK', 'client', 'Your menu bar is empty — add at least one item.', [ref.block.id], jumpTarget(ref)),
        )
      }
      for (const item of ref.block.items) {
        if (item.label.trim() === '') {
          findings.push(
            finding('V26', 'BLOCK', 'client', 'A menu item has no text — give it a label.', [item.id], jumpTarget(ref)),
          )
        }
      }
    }
  }
  return findings
}

export const CLIENT_BLOCK_RULES = [
  v05GenerateDescription,
  v08Submission,
  v09EmptySite,
  v11ExternalUrls,
  v14EmptySlotDescription,
  v19BlankRealText,
  v26LabelsAndNavItems,
] as const
