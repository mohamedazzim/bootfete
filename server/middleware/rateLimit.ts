import { rateLimit, type RateLimitRequestHandler } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redisClient } from "../services/redisClient";

/**
 * H-07: rate limiting.
 *
 * Uses a shared Redis store when Redis is available (required for correct
 * limits across the multi-process/multi-backend deployment topology —
 * a memory store would be per-process and 6x weaker), falling back to the
 * in-memory store otherwise.
 */
function buildStore(prefix: string) {
  const client = redisClient.getClient();
  if (client) {
    return new RedisStore({
      // rate-limit-redis v4 works with any client exposing sendCommand
      sendCommand: (...args: string[]) => (client as any).call(...args),
      prefix,
    });
  }
  return undefined; // express-rate-limit falls back to its memory store
}

/**
 * Strict bucket for authentication endpoints.
 * Keyed on IP + attempted username so one bad actor behind NAT cannot
 * lock out everyone else, and targeted credential stuffing is throttled.
 */
export const loginLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // 10 attempts per window per key
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: buildStore("rl:login:"),
  keyGenerator: (req) => {
    const username =
      typeof req.body?.username === "string"
        ? req.body.username
        : typeof req.body?.email === "string"
          ? req.body.email
          : "";
    return `${req.ip}:${username.toLowerCase().slice(0, 128)}`;
  },
  message: { message: "Too many login attempts, please try again later" },
});

/**
 * Lighter bucket for public, unauthenticated endpoints (registration,
 * roll-number lookups) — prevents enumeration and mail-quota abuse.
 */
export const publicApiLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // 100 requests per window per IP
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: buildStore("rl:public:"),
  message: { message: "Too many requests, please try again later" },
});
