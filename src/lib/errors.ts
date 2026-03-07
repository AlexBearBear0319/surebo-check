/**
 * src/lib/errors.ts
 *
 * Sanitise errors before sending to the client.
 * Never expose stack traces, API keys, or DB credentials in responses.
 */

// Patterns that must never reach the browser
const SENSITIVE = [
  /sk-[a-zA-Z0-9]+/g,          // API keys
  /Bearer [a-zA-Z0-9._-]+/g,   // Authorization headers
  /password[=:]["']?[^\s"',]+/gi,
  /eyJ[a-zA-Z0-9._-]{20,}/g,   // JWTs
  /https?:\/\/[^@]+@[^\s]+/g,  // URLs with credentials
];

export function safeError(err: unknown): string {
  let msg = err instanceof Error ? err.message : String(err);

  // Strip any sensitive patterns
  for (const pattern of SENSITIVE) {
    msg = msg.replace(pattern, "[redacted]");
  }

  // Map known error types to user-friendly messages
  if (msg.includes("DASHSCOPE_API_KEY is not set"))
    return "AI service is not configured. Please contact support.";
  if (msg.includes("Model access denied") || msg.includes("AccessDenied"))
    return "AI model is not available. Please contact support.";
  if (msg.includes("401") || msg.includes("invalid_api_key"))
    return "AI service authentication failed. Please contact support.";
  if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed"))
    return "Could not reach an external service. Please try again.";
  if (msg.includes("rate limit") || msg.includes("429"))
    return "Too many requests. Please wait a moment and try again.";

  // Generic fallback — never show raw stack traces
  if (msg.length > 120) return "An unexpected error occurred. Please try again.";
  return msg;
}
