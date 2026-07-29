/**
 * THE LEAD GATE — the three fields, and the honeypot.
 *
 * These are enforced HERE AND ONLY HERE. The Site panel keeps its one calm hint
 * and never nags while somebody is sketching (`feature-site-settings.md`); asking
 * for a business name the moment a client drops their first block is how you turn
 * a sketch tool into a form.
 *
 * Pure: the same rules the validator's V8 states, checked before a submission
 * starts so a client sees "please tell us your name" rather than a schema error.
 */

/** BOSS's address, shown on every refusal so a false positive is never a dead end. */
import { BOSS_SUBMIT_EMAIL } from '../../site.config.ts'

export interface LeadDetails {
  readonly clientName: string
  readonly clientEmail: string
  readonly businessName: string
  /**
   * The honeypot. Named for nothing a password manager recognises, and read here
   * rather than in a component so the refusal rule is unit-testable.
   */
  readonly quill: string
}

export const EMPTY_LEAD: LeadDetails = {
  clientName: '',
  clientEmail: '',
  businessName: '',
  quill: '',
}

export type LeadField = 'clientName' | 'clientEmail' | 'businessName'

export interface LeadProblem {
  readonly field: LeadField
  readonly message: string
}

/** The same shape V8 uses — deliberately permissive, this is a contact address. */
const PLAUSIBLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const LEAD_MESSAGES = {
  clientName: 'Please tell us your name.',
  clientEmail: 'Please add an email address so we can reply.',
  clientEmailShape: 'That email address does not look right — please check it.',
  businessName: 'Please tell us the business name — it goes on the site.',
} as const

/** Every problem at once, so the client fixes the form in one pass. */
export function leadProblems(lead: LeadDetails): LeadProblem[] {
  const problems: LeadProblem[] = []

  if (lead.clientName.trim() === '') {
    problems.push({ field: 'clientName', message: LEAD_MESSAGES.clientName })
  }
  if (lead.clientEmail.trim() === '') {
    problems.push({ field: 'clientEmail', message: LEAD_MESSAGES.clientEmail })
  } else if (!PLAUSIBLE_EMAIL.test(lead.clientEmail.trim())) {
    problems.push({ field: 'clientEmail', message: LEAD_MESSAGES.clientEmailShape })
  }
  if (lead.businessName.trim() === '') {
    problems.push({ field: 'businessName', message: LEAD_MESSAGES.businessName })
  }

  return problems
}

/**
 * The honeypot refusal.
 *
 * `docs/roundtrip-protocol.md` §1.4 rule 4 makes this deliberate: the scripted
 * client is required to leave the field alone, and the harness relies on filling
 * it being fatal. The mitigations against a false positive are structural — an
 * implausible field name, `autoComplete="off"`, off-screen, unfocusable, nothing
 * typed like a name or an email — plus this message, which still hands over the
 * address so a wrongly-refused human is never stuck.
 */
export const HONEYPOT_REFUSAL = `We could not accept that submission. Please email us directly at ${BOSS_SUBMIT_EMAIL} and we will sort it out.`

export function isHoneypotTripped(lead: LeadDetails): boolean {
  return lead.quill.trim() !== ''
}

/** Trimmed values, which is what goes into `site.json` and the mailto. */
export function normalizeLead(lead: LeadDetails): LeadDetails {
  return {
    clientName: lead.clientName.trim(),
    clientEmail: lead.clientEmail.trim(),
    businessName: lead.businessName.trim(),
    quill: lead.quill,
  }
}
