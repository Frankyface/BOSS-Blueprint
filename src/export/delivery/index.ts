/**
 * DELIVERY — the download-first hybrid's second half.
 *
 * The zip is already on the client's disk by the time anything here runs
 * (`docs/decisions.md` 2026-07-27 debate #2). This module holds the two ways Cam
 * finds out about it: the client's own prefilled `mailto:` (step 2 of the
 * completion UX) and the `DeliveryRelay` port, which ships as a no-op stub and
 * gets a real provider LAST, per Cam.
 */

export { encodeBase64 } from './base64.ts'
export {
  MAX_MAILTO_URL_LENGTH,
  mailtoHref,
  mailtoSubject,
  type MailtoInput,
} from './mailto.ts'
export {
  buildNotificationPayload,
  RELAY_PAYLOAD_LIMIT_BYTES,
  type NotificationPayload,
  type PayloadInput,
  type PayloadVariant,
  type PayloadWarning,
} from './payload.ts'
export {
  createNoopRelay,
  NOOP_RELAY_LOG_PREFIX,
  type DeliveryRelay,
  type NoopRelayOptions,
  type RelayResult,
  type RelayStatus,
} from './relay.ts'
