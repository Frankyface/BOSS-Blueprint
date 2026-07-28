/**
 * V1 — `site.json` validates against the v1 JSON Schema (§2.2).
 *
 * ajv v8 + `ajv-formats`, `{ allErrors: true, strict: true }`. Without
 * `ajv-formats`, `format: "email"` and `format: "date-time"` are SILENT NO-OPS —
 * the schema would look like it was checking timestamps and would not be. Appendix
 * A requires a red test proving the formats are wired; `schemaCheck.test.ts` has it.
 *
 * Loaded by dynamic `import()` at validation time, not at app boot: ajv +
 * ajv-formats is ~120 kB of a ~244 kB bundle, and submit is a deliberate user action
 * where a code-split chunk load is invisible. The same dynamic import works in Node
 * for the Stage 4 harness.
 *
 * V1 runs LAST among the blocking rules. By then everything fixable is fixed and
 * everything client-actionable has been named, so a V1 failure genuinely is a
 * generator bug and deserves its "something went wrong" wording.
 */

import schema from '../../schema/site.v1.schema.json'
import { finding, type Finding, type PackageBundle } from '../types.ts'

interface AjvError {
  readonly instancePath?: string
  readonly message?: string
}

interface AjvValidator {
  (data: unknown): boolean
  errors?: AjvError[] | null
}

interface AjvInstance {
  compile: (schema: unknown) => AjvValidator
}

type AjvConstructor = new (options: {
  allErrors: boolean
  strict: boolean
}) => AjvInstance

type AddFormats = (ajv: AjvInstance) => unknown

/** ajv v8 and ajv-formats are CJS; the default export is the callable itself. */
function interop<T>(module: unknown): T {
  const candidate = module as { default?: unknown }
  return (candidate.default ?? module) as T
}

/** Compiled once per module load — compilation is the expensive half. */
let compiled: Promise<AjvValidator> | null = null

async function validator(): Promise<AjvValidator> {
  compiled ??= (async (): Promise<AjvValidator> => {
    const [ajvModule, formatsModule] = await Promise.all([import('ajv'), import('ajv-formats')])
    const Ajv = interop<AjvConstructor>(ajvModule)
    const addFormats = interop<AddFormats>(formatsModule)

    const ajv = new Ajv({ allErrors: true, strict: true })
    addFormats(ajv)
    return ajv.compile(schema)
  })()
  return compiled
}

export async function v01Schema({ site }: PackageBundle): Promise<Finding[]> {
  const validate = await validator()
  if (validate(site)) return []

  return (validate.errors ?? []).map((error) =>
    finding(
      'V01',
      'BLOCK',
      'bug',
      `site.json${error.instancePath ?? ''} ${error.message ?? 'failed schema validation'}`,
      [error.instancePath ?? ''],
    ),
  )
}
