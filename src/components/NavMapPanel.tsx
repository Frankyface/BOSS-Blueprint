import { useMemo } from 'react'

import { buildNavMap, countNavMapEntries } from '../canvas/navMap.ts'
import { useCanvasStore } from '../store/canvasStore.ts'

const EMPTY_PAGE_HINT = 'Nothing on this page links anywhere yet.'
const ARROW = '→'

/**
 * THE NAV MAP — every page and what it links out to, in one list.
 *
 * Rebuilt from the blocks on every render (see `src/canvas/navMap.ts`): there is no
 * stored copy that could disagree with the buttons and menus it describes, which is
 * exactly what "always matches reality" has to mean.
 */
export function NavMapPanel() {
  const pages = useCanvasStore((state) => state.pages)
  const map = useMemo(() => buildNavMap(pages), [pages])
  const total = countNavMapEntries(map)

  return (
    <div className="side-panel__body nav-map" data-testid="nav-map" data-entry-count={total}>
      {map.map((page) => (
        <section className="nav-map__page" key={page.pageId} data-testid="nav-map-page" data-page-id={page.pageId}>
          <h3 className="side-panel__heading">{page.pageName}</h3>

          {page.entries.length === 0 ? (
            <p className="side-panel__hint">{EMPTY_PAGE_HINT}</p>
          ) : (
            <ul className="nav-map__list">
              {page.entries.map((entry) => (
                <li
                  className="nav-map__entry"
                  key={entry.id}
                  data-testid="nav-map-entry"
                  data-source={entry.source}
                  data-link-kind={entry.link.kind}
                  data-target={entry.targetName ?? ''}
                >
                  <span className="nav-map__label">{entry.label}</span>
                  <span className="nav-map__arrow" aria-hidden="true">
                    {ARROW}
                  </span>
                  <span className="nav-map__target">{entry.description}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}
