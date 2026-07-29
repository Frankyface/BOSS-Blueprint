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
  createConfiguredRelay,
  createFormPostRelay,
  fitRelayRequest,
  relayRequestBody,
  FORM_RELAY_ID,
  RELAY_MISCONFIGURED_PREFIX,
  type FetchLike,
  type FormRelayPorts,
  type RelayRequest,
} from './formRelay.ts'
export {
  MAX_MAILTO_URL_LENGTH,
  mailtoHref,
  mailtoSubject,
  type MailtoInput,
} from './mailto.ts'
export {
  BRIEF_MARKER,
  MAX_SUBJECT_LENGTH,
  notificationBody,
  notificationSubject,
  SITE_JSON_MARKER,
} from './notificationText.ts'
export {
  buildNotificationPayload,
  demoteNotificationPayload,
  RELAY_PAYLOAD_LIMIT_BYTES,
  type NotificationPayload,
  type PayloadInput,
  type PayloadVariant,
  type PayloadWarning,
} from './payload.ts'
export {
  DEFAULT_RELAY_FIELDS,
  isRelayReady,
  isRelayTouched,
  relayConfigProblems,
  type RelayConfig,
  type RelayFieldNames,
} from './relayConfig.ts'
export {
  createNoopRelay,
  NOOP_RELAY_LOG_PREFIX,
  type DeliveryRelay,
  type NoopRelayOptions,
  type RelayResult,
  type RelayStatus,
} from './relay.ts'
