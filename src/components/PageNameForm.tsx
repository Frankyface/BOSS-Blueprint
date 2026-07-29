import { useEffect, useRef, useState } from 'react'

const ENTER_KEY = 'Enter'
const ESCAPE_KEY = 'Escape'

interface PageNameFormProps {
  testId: string
  label: string
  placeholder: string
  initialValue: string
  confirmLabel: string
  /** Why the confirm is greyed out right now (UX audit N4). */
  disabledReason: string
  maxLength: number
  onConfirm: (name: string) => void
  onCancel: () => void
}

/**
 * The one-field form behind "Add page" and "Rename" — an inline strip rather than
 * a dialog, so naming a page never covers the page being named.
 *
 * Confirming with an empty name is refused rather than accepted-and-defaulted: a
 * page called "New page" that the client thought they had named is worse than
 * being asked again.
 *
 * A DISABLED BUTTON THAT SAYS WHY (UX audit N4). The confirm greys out on an
 * empty name and used to give no reason at all; a disabled control is also
 * unfocusable, so a screen reader user could not even ask it. The reason is a
 * live region beside it and is wired to the field with `aria-describedby`, so it
 * is announced where the client actually is — in the box they have not typed in.
 */
export function PageNameForm({
  testId,
  label,
  placeholder,
  initialValue,
  confirmLabel,
  disabledReason,
  maxLength,
  onConfirm,
  onCancel,
}: PageNameFormProps) {
  const [name, setName] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const isEmpty = name.trim().length === 0
  const reasonId = `${testId}-disabled-reason`

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const confirm = () => {
    const trimmed = name.trim()
    if (trimmed.length === 0) return
    onConfirm(trimmed)
  }

  return (
    <div className="page-strip__form" data-testid={`${testId}-form`}>
      <label className="page-strip__form-label">
        <span>{label}</span>
        <input
          ref={inputRef}
          type="text"
          className="page-strip__input"
          data-testid={`${testId}-name`}
          placeholder={placeholder}
          maxLength={maxLength}
          aria-describedby={isEmpty ? reasonId : undefined}
          value={name}
          onChange={(event) => {
            setName(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === ESCAPE_KEY) {
              event.preventDefault()
              onCancel()
              return
            }
            if (event.key !== ENTER_KEY) return
            event.preventDefault()
            confirm()
          }}
        />
      </label>
      {isEmpty && (
        <p className="page-strip__hint" id={reasonId} data-testid={reasonId}>
          {disabledReason}
        </p>
      )}
      <button
        type="button"
        className="page-strip__button"
        data-testid={`${testId}-cancel`}
        onClick={onCancel}
      >
        Cancel
      </button>
      <button
        type="button"
        className="page-strip__button page-strip__button--primary"
        data-testid={`${testId}-confirm`}
        disabled={isEmpty}
        // A disabled button is removed from the accessibility tree's reach, so the
        // reason is also hung off the title for a pointer user hovering it.
        title={isEmpty ? disabledReason : undefined}
        onClick={confirm}
      >
        {confirmLabel}
      </button>
    </div>
  )
}
