import { useSubmitStore } from '../../store/submitStore.ts'

/**
 * THE APP'S ENDING, in the header beside the design-file controls.
 *
 * The round-2 UX audit's top blocker was that the product had no visible finish:
 * a client could sketch a whole site and never find the door. It sits in the
 * header because that is where the other whole-design actions already live, and
 * it is the only primary-accent control in the app so it reads as the last step
 * rather than as one more button.
 */
const SUBMIT_LABEL = 'Send to BOSS'

export function SubmitButton() {
  const open = useSubmitStore((state) => state.open)
  const screen = useSubmitStore((state) => state.screen)

  return (
    <button
      type="button"
      className="submit-open"
      data-testid="submit-open"
      data-tour="submit"
      aria-expanded={screen !== 'closed'}
      onClick={open}
    >
      {SUBMIT_LABEL}
    </button>
  )
}
