/**
 * THE BOSS MARK, inline.
 *
 * The same two paths as `public/favicon.svg` and the social card, so the tab
 * icon, the header and a pasted link all show one mark. Inline SVG rather than an
 * `<img>` because a hard constraint of this project is that the app makes no
 * request it does not have to: an icon file would be a second round trip for
 * thirty-two bytes of geometry, and a webfont glyph would be a third-party origin.
 *
 * `aria-hidden`: the header's `<h1>` already says "BOSS Blueprint" beside it, and
 * a screen reader announcing the logo as well would say the name twice.
 */
export function BossMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      data-testid="boss-mark"
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="64" height="64" rx="12" fill="var(--boss-accent)" />
      <path
        d="M14 14h22a11 11 0 0 1 3.6 21.4A11.5 11.5 0 0 1 36 50H14Zm9 8v9h12a4.5 4.5 0 0 0 0-9Zm0 17v9h12.5a4.5 4.5 0 0 0 0-9Z"
        fill="var(--boss-ink)"
      />
    </svg>
  )
}
