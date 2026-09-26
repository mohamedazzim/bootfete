// Sentry error tracking + performance monitoring for the Express backend.
// Fail-safe by design: if SENTRY_DSN is not set, every export below is a
// no-op and the app behaves exactly as if Sentry were absent.
//
// Sentry v8+ notes:
// - Request instrumentation is automatic: expressIntegration() patches the
//   Express router, so there is no manual request-handler middleware to
//   register. Sentry.init() must simply run before routes handle traffic.
// - Unhandled promise rejections are captured by the default
//   onUnhandledRejectionIntegration; uncaught exceptions by the default
//   onUncaughtExceptionIntegration.

import type { Express } from "express";
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

function isEnabled(): boolean {
  return Boolean(process.env.SENTRY_DSN);
}

function sampleRate(envName: string, fallback: number): number {
  const raw = process.env[envName];
  if (raw === undefined || raw === "") return fallback;
  const parsed = parseFloat(raw);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 1) {
    console.warn(`[Sentry] Ignoring invalid ${envName}=${raw}; using ${fallback}.`);
    return fallback;
  }
  return parsed;
}

/**
 * Initialize Sentry with request + tracing + profiling integrations.
 * Safe no-op when SENTRY_DSN is unset.
 * Call once, before any middleware is registered on the app.
 */
export function initSentry(_app: Express): void {
  if (!isEnabled()) {
    console.log("[Sentry] SENTRY_DSN not set — Sentry disabled.");
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    // Request/tracing instrumentation for Express + outgoing HTTP.
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
      nodeProfilingIntegration(),
    ],
    tracesSampleRate: sampleRate("SENTRY_TRACES_SAMPLE_RATE", 0.1),
    profileSessionSampleRate: sampleRate("SENTRY_PROFILE_SESSION_SAMPLE_RATE", 0.1),
  });

  console.log("[Sentry] Initialized (error tracking + tracing + profiling).");
}

/**
 * Register Sentry's Express error-handling middleware.
 * Safe no-op when SENTRY_DSN is unset.
 * Call immediately BEFORE the app's own error-handling middleware so Sentry
 * sees the raw error first.
 */
export function initSentryErrorHandler(app: Express): void {
  if (!isEnabled()) {
    return;
  }
  Sentry.setupExpressErrorHandler(app);
}
