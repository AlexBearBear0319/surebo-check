/**
 * src/scripts/migrate-db.ts
 *
 * Run this once in your Supabase SQL editor (or via psql) to add the
 * device_id column that isolates each browser's sessions from others.
 *
 * SQL to execute:
 *
 *   ALTER TABLE chat_sessions
 *     ADD COLUMN IF NOT EXISTS device_id TEXT;
 *
 *   CREATE INDEX IF NOT EXISTS idx_chat_sessions_device_id
 *     ON chat_sessions (device_id);
 *
 * Existing rows will have device_id = NULL and will only appear when
 * the API is called without an X-Device-ID header (i.e. never in normal
 * usage), so they effectively become invisible to all devices.
 *
 * If you want to assign existing rows to a specific device, run:
 *
 *   UPDATE chat_sessions
 *     SET device_id = '<your-device-uuid>'
 *   WHERE device_id IS NULL;
 */
console.log("migrate-db: Run the SQL in the comment above in your Supabase SQL editor.");
process.exit(0);
