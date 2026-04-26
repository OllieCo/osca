// BullMQ-backed inference queue.
//
// The worker runs in-process on the same single server.
// Job data intentionally contains only a sessionId — never raw text or PII.
// The worker looks up the session from the in-memory store and calls the
// action-planner, which handles all prompt construction locally.

import { Queue, Worker, type Job } from "bullmq"
import IORedis from "ioredis"
import { v4 as uuidv4 } from "uuid"
import { config } from "./config.js"
import { logger } from "./logger.js"
import { sessions } from "./session-store.js"
import { planNextAction } from "./action-planner.js"

// ── Connection ────────────────────────────────────────────────────────────────
// BullMQ requires maxRetriesPerRequest: null for its blocking commands (BRPOP
// etc.) — a finite retry count causes the client to throw after the retries
// exhaust, which crashes the worker.  We create a dedicated connection so
// BullMQ owns its lifecycle independently of the main redis singleton.
const bullConnection = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
})

bullConnection.on("error", (err) => logger.error({ err }, "BullMQ Redis connection error"))

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InferenceJobData {
  sessionId: string
}

export interface InferenceJobResult {
  actionType: string
}

// ── Queue ─────────────────────────────────────────────────────────────────────

export const inferenceQueue = new Queue<InferenceJobData, InferenceJobResult>("inference", {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
})

// ── Worker ────────────────────────────────────────────────────────────────────

async function processInferenceJob(job: Job<InferenceJobData, InferenceJobResult>) {
  const { sessionId } = job.data
  const session = sessions.get(sessionId)
  if (!session) {
    // Session expired or server restarted — silently discard
    logger.warn({ sessionId, jobId: job.id }, "Inference job: session not found — discarding")
    return { actionType: "discarded" }
  }

  logger.debug(
    { sessionId, jobId: job.id, attempt: job.attemptsMade + 1 },
    "Inference job started"
  )

  const action = await planNextAction(session.goal, session.currentPage, session.steps)
  action.id = uuidv4()
  session.pendingAction = action
  session.status = "awaiting"

  logger.debug(
    { sessionId, jobId: job.id, actionType: action.type },
    "Inference job completed"
  )

  return { actionType: action.type }
}

export const inferenceWorker = new Worker<InferenceJobData, InferenceJobResult>(
  "inference",
  processInferenceJob,
  {
    connection: bullConnection,
    concurrency: 2,
  }
)

inferenceWorker.on("failed", (job, err) => {
  logger.error(
    { jobId: job?.id, sessionId: job?.data?.sessionId, err },
    "Inference job failed all retries"
  )
  const sessionId = job?.data?.sessionId
  if (sessionId) {
    const session = sessions.get(sessionId)
    if (session) {
      session.status = "failed"
      session.error = `Inference failed after ${job?.attemptsMade ?? "?"} attempts: ${err.message}`
    }
  }
})

inferenceWorker.on("error", (err) => {
  logger.error({ err }, "Inference worker error")
})
