/**
 * Extract a human-readable message from an unknown thrown value.
 *
 * Wallet SDKs sometimes throw plain objects (e.g. `{ code: 4001, message: "…" }`)
 * rather than Error instances. This handles those alongside real Error objects,
 * nested `cause` fields, and arbitrary fallback via String().
 */
export function extractErrorMessage(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) {
    // Some wallet errors wrap the real message in a cause
    if (!e.message && e.cause != null) return extractErrorMessage(e.cause)
    return e.message || e.toString()
  }
  if (typeof e === 'object' && e !== null) {
    const obj = e as Record<string, unknown>
    if (typeof obj.message === 'string' && obj.message) return obj.message
    if (obj.cause != null) return extractErrorMessage(obj.cause)
  }
  return String(e)
}
