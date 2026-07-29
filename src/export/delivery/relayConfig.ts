/**
 * THE RELAY CONFIG — the one shape Cam pastes two strings into, and the rules
 * that decide whether those strings are usable.
 *
 * PROVIDER-AGNOSTIC BY CONSTRUCTION. Cam has not created a relay account
 * (`help.md`), so naming a provider in code would be guessing — and a provider
 * named in a module is a promise to maintain it. Every free-tier text relay the
 * debate surveyed (`docs/decisions.md` 2026-07-27 debate #2) has the same shape:
 *
 *   POST <fixed endpoint>  ·  JSON body  ·  credential IN the body  ·  2xx = accepted
 *
 * The credential rides in the body rather than a header for the same reason the
 * whole class works from a static page: it is a PUBLIC FORM KEY whose only power
 * is "submit to this one form". What varies between providers is the endpoint,
 * the NAMES of the fields, whatever static fields the provider demands, and
 * whether the human fields are flat or nested under one key. All four are config.
 *
 * DELIBERATELY IMPORT-FREE. `site.config.ts` type-imports this file, and
 * `site.config.ts` is loaded by `vite.config.ts` at config time in Node. Keeping
 * this module free of imports keeps that edge free of the export pipeline
 * (fflate, the serializer, the schema) — a type-only import that dragged half of
 * `src/export` into the build config would be a slow, surprising coupling.
 */

/** The field names a provider expects. `''` means "this provider has no such field". */
export interface RelayFieldNames {
  /** Where the access key goes — `access_key`, `apikey`, `user_id`, … */
  readonly credential: string
  readonly subject: string
  readonly name: string
  readonly email: string
  readonly message: string
  /** The provider's own bot-check field; our honeypot value is forwarded into it. */
  readonly honeypot: string
}

export interface RelayConfig {
  /** Absolute URL. Empty = the relay is off, which is how this ships. */
  readonly endpoint: string
  /** The public form key. Empty = off. */
  readonly credential: string
  readonly fields?: RelayFieldNames
  /** Extra constants a provider requires (EmailJS: `service_id`, `template_id`). */
  readonly staticFields?: Readonly<Record<string, string>>
  /** `''` = flat body. A key name nests the mapped fields under it (EmailJS). */
  readonly nestFieldsUnder?: string
  /** Overrides the default byte budget the degrade ladder measures against. */
  readonly limitBytes?: number
}

/**
 * The most common naming in the class (Web3Forms' exactly, and one rename away
 * from the others). Defaults, not assumptions: every one is overridable.
 */
export const DEFAULT_RELAY_FIELDS: RelayFieldNames = {
  credential: 'access_key',
  subject: 'subject',
  name: 'name',
  email: 'email',
  message: 'message',
  honeypot: 'botcheck',
}

/** Hosts for which `http:` is acceptable — see `endpointProblem`. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/**
 * Has anyone touched this config at all?
 *
 * The distinction that matters: an UNTOUCHED config is the shipped state and
 * must be silent (bind the stub, log nothing new, make no request). A TOUCHED
 * but invalid one is a typo in Cam's paste and has to say so out loud, because
 * the alternative is a relay that quietly never fires.
 */
export function isRelayTouched(config: RelayConfig): boolean {
  return config.endpoint.trim() !== '' || config.credential.trim() !== ''
}

function endpointProblem(endpoint: string): string | null {
  if (endpoint.trim() === '') return 'endpoint is empty'

  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return `endpoint is not an absolute URL: ${endpoint}`
  }

  if (url.protocol === 'https:') return null
  /*
   * `http:` only to localhost. An https page cannot make an http request anyway
   * (mixed content), so requiring https off localhost forbids nothing that would
   * have worked — while the localhost exemption lets the E2E point the REAL
   * adapter at a same-origin route instead of a mock.
   */
  if (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)) return null

  return `endpoint must use https (http is allowed only for localhost): ${endpoint}`
}

/**
 * Every problem at once, so one look at the console fixes the paste in one pass.
 * Empty array = ready to send.
 */
export function relayConfigProblems(config: RelayConfig): readonly string[] {
  const problems: string[] = []

  const endpoint = endpointProblem(config.endpoint)
  if (endpoint !== null) problems.push(endpoint)

  const fields = config.fields ?? DEFAULT_RELAY_FIELDS
  if (fields.credential !== '' && config.credential.trim() === '') {
    problems.push(`credential is empty, but the provider expects it in "${fields.credential}"`)
  }
  if (fields.message === '') {
    problems.push('fields.message is empty — the notification would carry no body')
  }

  const limit = config.limitBytes
  if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
    problems.push(`limitBytes must be a positive number, got ${String(limit)}`)
  }

  return problems
}

/** Ready = someone configured it AND every rule above passes. */
export function isRelayReady(config: RelayConfig): boolean {
  return isRelayTouched(config) && relayConfigProblems(config).length === 0
}
