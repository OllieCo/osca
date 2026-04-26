import { AsyncLocalStorage } from "node:async_hooks"
import type { Request, Response, NextFunction } from "express"
import { randomUUID } from "node:crypto"

interface RequestContext {
  requestId: string
  tenantId?: string
}

const store = new AsyncLocalStorage<RequestContext>()

export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const requestId = (req.headers["x-request-id"] as string | undefined) ?? randomUUID()
  // tenant_id comes from JWT claims once Auth Unification lands; use header stub for now
  const tenantId = req.headers["x-tenant-id"] as string | undefined

  // Expose for downstream middleware (pino-http serialiser picks this up)
  req.headers["x-request-id"] = requestId

  store.run({ requestId, tenantId }, next)
}

export function getRequestContext(): RequestContext | undefined {
  return store.getStore()
}
