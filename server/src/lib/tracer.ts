import { NodeSDK } from "@opentelemetry/sdk-node"
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http"
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics"
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { resourceFromAttributes } from "@opentelemetry/resources"
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions"
import { PiiSpanProcessor } from "./pii-span-processor.js"

const isOtelEnabled =
  !!process.env["GRAFANA_OTLP_ENDPOINT"] && process.env["NODE_ENV"] !== "test"

let sdk: NodeSDK | undefined

if (isOtelEnabled) {
  const endpoint = process.env["GRAFANA_OTLP_ENDPOINT"]!
  const headers: Record<string, string> = process.env["GRAFANA_OTLP_TOKEN"]
    ? { Authorization: `Bearer ${process.env["GRAFANA_OTLP_TOKEN"]}` }
    : {}

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: "ospa-api",
      [ATTR_SERVICE_VERSION]: process.env["npm_package_version"] ?? "0.0.0",
      "deployment.environment": process.env["OSPA_ENV"] ?? "dev",
    }),

    // PiiSpanProcessor wraps the OTLP exporter — scrubs PII from attributes before export
    spanProcessors: [
      new PiiSpanProcessor(
        new SimpleSpanProcessor(new OTLPTraceExporter({ url: `${endpoint}/v1/traces`, headers }))
      ),
    ],

    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics`, headers }),
      exportIntervalMillis: 30_000,
    }),

    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable noisy fs instrumentation; keep http, express, pg, redis
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: false },
      }),
    ],
  })

  sdk.start()
}

export async function shutdownTracer(): Promise<void> {
  await sdk?.shutdown()
}
