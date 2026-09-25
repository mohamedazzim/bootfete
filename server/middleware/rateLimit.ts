import { rateLimit, ipKeyGenerator, type RateLimitRequestHandler } from "express-rate-limit";
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
    return `${ipKeyGenerator(req.ip ?? "")}:${username.toLowerCase().slice(0, 128)}`;
  },
  message: { message: "Too many login attempts, please try again later" },
});

/**
 * Lighter bucket for public, unauthenticated endpoints (registration,
 * roll-number lookups) — prevents enumeration and mail-quota abuse.
 * PUBLIC_API_RATE_LIMIT_MAX overrides the default (ops knob for
 * high-density NATs, e.g. a campus network registering hundreds of
 * students behind a few public IPs; also used by the loadtest harness).
 */
export const publicApiLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: parseInt(process.env.PUBLIC_API_RATE_LIMIT_MAX || "100", 10), // 100 requests per window per IP
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: buildStore("rl:public:"),
  message: { message: "Too many requests, please try again later" },
});

/**
 * PROD-SCALE: per-student bucket for exam hot paths (answer saves,
 * violations, submit, attempt reads). Keyed by USER, not IP — 500 students
 * behind a campus NAT share a handful of public IPs, so an IP-keyed bucket
 * would throttle legitimate exam traffic into 429s mid-exam.
 *
 * The limit is generous: worst-case legit traffic is ~40 answer saves/min
 * (1.5s client debounce) = 200 per 5 minutes; 600 leaves 3x headroom while
 * still stopping a runaway/buggy client from melting the database.
 *
 * MUST be mounted AFTER requireAuth so req.user is populated; falls back
 * to IP if somehow unauthenticated.
 */
export const examApiLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  limit: 600, // 600 requests per window per student
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: buildStore("rl:exam:"),
  keyGenerator: (req) => {
    const userId = (req as unknown as { user?: { id?: string } }).user?.id;
    return userId ? `exam:user:${userId}` : `exam:ip:${ipKeyGenerator(req.ip ?? "")}`;
  },
  message: { message: "Too many requests, please slow down and retry" },
});
