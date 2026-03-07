/**
 * src/instrumentation.ts
 *
 * Next.js server instrumentation hook.
 * ClickHouse removed — using Supabase for all persistence.
 */
export async function register() {
  // no-op: no warm-up needed for Supabase
}
