import Redis from "ioredis"
import { config } from "./config.js"
import { logger } from "./logger.js"

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
})

redis.on("connect", () => logger.info("Redis connected"))
redis.on("ready", () => logger.debug("Redis ready"))
redis.on("error", (err) => logger.error({ err }, "Redis error"))
redis.on("close", () => logger.warn("Redis connection closed"))
redis.on("reconnecting", () => logger.warn("Redis reconnecting"))
