/**
 * src/lib/langfuse.ts
 *
 * Langfuse observability for SureBO.
 * Wraps every LangChain call with tracing so you can see:
 *   - Every prompt sent to GPT-4o
 *   - Every response received
 *   - Latency, token usage, and cost per call
 *   - Full RAG pipeline trace (retrieval → generation)
 *
 * Dashboard: https://cloud.langfuse.com
 */

import { Langfuse, type LangfuseTraceClient } from 'langfuse';
import { CallbackHandler } from 'langfuse-langchain';

// ─── Langfuse Client (for manual traces) ─────────────────────────────────────

let _langfuse: Langfuse | null = null;

export function getLangfuse(): Langfuse {
  if (!_langfuse) {
    _langfuse = new Langfuse({
      publicKey:  process.env.LANGFUSE_PUBLIC_KEY  ?? '',
      secretKey:  process.env.LANGFUSE_SECRET_KEY  ?? '',
      baseUrl:    process.env.LANGFUSE_BASE_URL    ?? 'https://cloud.langfuse.com',
      flushAt:    5,    // batch size before auto-flush
      flushInterval: 3000, // flush every 3s
    });

    _langfuse.on('error', (err) => {
      // Never crash the app due to observability errors
      console.warn('[Langfuse] Tracing error (non-fatal):', err);
    });
  }
  return _langfuse;
}

// ─── LangChain Callback Handler ───────────────────────────────────────────────

/**
 * Creates a named Langfuse trace, then returns a CallbackHandler rooted to it.
 * This is the correct v3 pattern — rooting the handler to a trace links all
 * LangChain spans (prompt, generation, retrieval) under one named trace in the
 * Langfuse dashboard.
 *
 * Usage:
 *   const { callbacks, trace } = getLangfuseCallbacks({ sessionId, traceName: 'surebo.detect' });
 *   await chain.invoke({ ... }, { callbacks });
 *   await callbacks[0]?.flushAsync();
 *   // After user rates the result:
 *   trace?.score({ name: 'user-feedback', value: 1, comment: 'thumbs up' });
 */
export function getLangfuseCallbacks(opts: {
  sessionId:  string;
  traceName:  string;
  userId?:    string;
  metadata?:  Record<string, unknown>;
}): { callbacks: CallbackHandler[]; trace: LangfuseTraceClient | null } {
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    return { callbacks: [], trace: null };
  }

  const lf = getLangfuse();

  // Create a named trace first — this is the v3 way to name traces
  const trace = lf.trace({
    name:      opts.traceName,
    sessionId: opts.sessionId,
    userId:    opts.userId,
    metadata:  opts.metadata,
  });

  // Root the handler so all LangChain spans are children of this trace
  const handler = new CallbackHandler({ root: trace });

  return { callbacks: [handler], trace };
}

// ─── Manual Event Tracking ────────────────────────────────────────────────────

/**
 * Track a custom event in Langfuse (e.g. verdict logged, audio uploaded).
 * Fire-and-forget — never blocks the main pipeline.
 */
export function trackEvent(opts: {
  sessionId:  string;
  name:       string;
  input?:     unknown;
  output?:    unknown;
  metadata?:  Record<string, unknown>;
}): void {
  if (!process.env.LANGFUSE_PUBLIC_KEY) return;

  try {
    const lf    = getLangfuse();
    const trace = lf.trace({ sessionId: opts.sessionId, name: opts.name });

    trace.event({
      name:     opts.name,
      input:    opts.input,
      output:   opts.output,
      metadata: opts.metadata,
    });

    // Flush in background
    lf.flushAsync().catch(() => {});
  } catch (err) {
    console.warn('[Langfuse] trackEvent failed (non-fatal):', err);
  }
}

/**
 * Track a detection result on an existing trace so it appears as metadata
 * rather than a second disconnected trace.  Pass the `trace` returned by
 * `getLangfuseCallbacks` so everything stays under one roof in the dashboard.
 */
export function trackDetection(opts: {
  sessionId:    string;
  claim:        string;
  verdict:      string;
  confidence:   number;
  language:     string;
  processingMs: number;
  trace?:       LangfuseTraceClient | null;
}): void {
  if (!process.env.LANGFUSE_PUBLIC_KEY) return;

  try {
    // Update the existing trace with detection output instead of creating a new one
    const target = opts.trace ?? getLangfuse().trace({ sessionId: opts.sessionId, name: 'surebo.detection' });
    target.update({
      output:   { verdict: opts.verdict, confidence: opts.confidence },
      metadata: { claim: opts.claim.slice(0, 200), language: opts.language, processingMs: opts.processingMs },
    });
    getLangfuse().flushAsync().catch(() => {});
  } catch (err) {
    console.warn('[Langfuse] trackDetection failed (non-fatal):', err);
  }
}

/**
 * Submit a user thumbs-up / thumbs-down score on a completed trace.
 * Call this from /api/score when the user rates a detection result.
 *
 * @param traceId  - The Langfuse trace ID returned with the detection response
 * @param value    - 1 for positive, 0 for negative
 * @param comment  - Optional free-text from the user
 */
export async function scoreTrace(opts: {
  traceId:  string;
  name:     string;
  value:    number;
  comment?: string;
}): Promise<void> {
  if (!process.env.LANGFUSE_PUBLIC_KEY) return;
  try {
    const lf = getLangfuse();
    await lf.score({
      traceId: opts.traceId,
      name:    opts.name,
      value:   opts.value,
      comment: opts.comment,
    });
    await lf.flushAsync();
  } catch (err) {
    console.warn('[Langfuse] scoreTrace failed (non-fatal):', err);
  }
}
