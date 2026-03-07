/**
 * src/lib/deviceId.ts
 *
 * Utilities for the stable anonymous device identifier.
 *
 * Client: generate/persist a UUID in localStorage under STORAGE_KEY.
 * Server: extract the value from the X-Device-ID request header.
 *
 * This is the sole mechanism for separating one browser's sessions from
 * another's — no login is required.
 */

export const DEVICE_ID_HEADER = "x-device-id";
export const DEVICE_ID_STORAGE_KEY = "surebo_device_id";

/**
 * Server-side: read the device ID from an incoming request header.
 * Returns undefined if the header is absent or empty.
 */
export function getDeviceIdFromRequest(
  req: Request | { headers: { get(name: string): string | null } },
): string | undefined {
  const val = req.headers.get(DEVICE_ID_HEADER);
  return val?.trim() || undefined;
}
