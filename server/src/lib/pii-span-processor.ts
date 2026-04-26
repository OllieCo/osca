import type { Span, SpanProcessor, ReadableSpan } from "@opentelemetry/sdk-trace-base"
import type { Context } from "@opentelemetry/api"

// Fields that must never appear in OTel span attributes
const PII_ATTRIBUTE_PATTERNS = [
  /email/i, /name/i, /password/i, /token(?!_id)/i, /authorization/i,
  /cookie/i, /phone/i, /address/i, /postcode/i, /dob/i,
]

function isPii(key: string): boolean {
  return PII_ATTRIBUTE_PATTERNS.some((p) => p.test(key))
}

function scrubAttributes(attrs: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(attrs)) {
    result[k] = isPii(k) ? "[redacted]" : v
  }
  return result
}

/**
 * Scrubs PII from span attributes before they reach the OTLP exporter.
 * Fail-closed: if scrubbing throws, the span is dropped rather than leaked.
 */
export class PiiSpanProcessor implements SpanProcessor {
  constructor(private readonly delegate: SpanProcessor) {}

  onStart(span: Span, parentContext: Context): void {
    this.delegate.onStart(span, parentContext)
  }

  onEnd(span: ReadableSpan): void {
    try {
      const attrs = span.attributes as Record<string, unknown>
      const scrubbed = scrubAttributes(attrs)
      // Replace attributes in-place (ReadableSpan attributes are mutable pre-export)
      Object.keys(attrs).forEach((k) => delete attrs[k])
      Object.assign(attrs, scrubbed)
    } catch {
      // Fail-closed: drop span rather than risk PII leaking
      return
    }
    this.delegate.onEnd(span)
  }

  async shutdown(): Promise<void> {
    await this.delegate.shutdown()
  }

  async forceFlush(): Promise<void> {
    await this.delegate.forceFlush()
  }
}
