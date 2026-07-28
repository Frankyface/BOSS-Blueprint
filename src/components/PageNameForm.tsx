import { useEffect, useRef, useState } from 'react'

const ENTER_KEY = 'Enter'
const ESCAPE_KEY = 'Escape'

interface PageNameFormProps {
  testId: string
  label: string
  placeholder: string
  initialValue: string
  confirmLabel: string
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
 */
export function PageNameForm({
  testId,
  label,
  placeholder,
  initialValue,
  confirmLabel,
  maxLength,
  onConfirm,
  onCancel,
}: PageNameFormProps) {
  const [name, setName] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement | null>(null)

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
        disabled={name.trim().length === 0}
        onClick={confirm}
      >
        {confirmLabel}
      </button>
    </div>
  )
}
