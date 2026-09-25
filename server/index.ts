import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import express, { type Request, Response, NextFunction } from "express";
// Force restart timestamp: 2025-12-05T14:30:00
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupWebSocket, setIO } from "./websocket";
import session from "express-session";
import { RedisStore } from "connect-redis";
import { redisClient } from "./services/redisClient";
import { correlationMiddleware } from "./middleware/correlation";
import logger from "./services/loggerService";
import { metricsService } from "./services/metricsService";
import { monitoringService } from "./services/monitoringService";

const app = express();

// PROD-SCALE: the app always sits behind nginx (see deploy/nginx.conf.example).
// Without trust proxy, req.ip is the proxy's IP for EVERY request, so all
// students behind the proxy share a single rate-limit bucket and all logs
// show one IP. Trust exactly one hop (nginx -> app).
app.set('trust proxy', 1);

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

// 1. Correlation ID Middleware (Must be first)
app.use(correlationMiddleware);

// 2. Request Logging & Metrics Middleware
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;

    // Log request
    logger.info('HTTP Request', {
      correlationId: req.correlationId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_seconds: duration,
      userAgent: req.get('user-agent'),
      ip: req.ip
    });

    // Record metrics
    metricsService.recordHttpRequest(req.method, req.path, res.statusCode, duration);

    // Alert on slow requests (simple check)
    if (duration > 2.0) { // > 2 seconds
      logger.warn('Slow Request Detected', {
        correlationId: req.correlationId,
        path: req.path,
        duration_seconds: duration
      });
    }
  });

  next();
});

app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

import path from "path";

// Serve uploads directory specifically
const uploadsPath = path.join(process.cwd(), 'uploads');
console.log('[Server] Serving uploads from:', uploadsPath);

app.use('/uploads', (req, res, next) => {
  console.log(`[Uploads] Request: ${req.url}`);
  next();
}, express.static(uploadsPath));

// Session configuration with Redis
const store = new RedisStore({
  client: redisClient.getClient() as any,
  prefix: "sympo:sess:",
});

app.use(
  session({
    store,
    secret: process.env.SESSION_SECRET || "symposium-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: app.get("env") === "production", // true in production
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
    name: "sympo.sid",
  })
);

// Health Check Endpoint
app.get('/health', async (_req, res) => {
  const health = {
    status: 'healthy',
    instance_id: process.env.INSTANCE_ID || 'standalone',
    uptime: process.uptime(),
    timestamp: new Date(),
    checks: {
      redis: redisClient.isAvailable(),
      memory: process.memoryUsage().heapUsed < 450 * 1024 * 1024 // < 450MB
    }
  };

  const allHealthy = Object.values(health.checks).every(c => c === true);
  res.status(allHealthy ? 200 : 503).json(health);
});

// Metrics Endpoint
app.get('/metrics', async (_req, res) => {
  try {
    res.set('Content-Type', metricsService.getContentType());
    res.end(await metricsService.getMetrics());
  } catch (ex) {
    res.status(500).end(ex);
  }
});


// Start Monitoring Service
monitoringService.start();


(async () => {
  const server = await registerRoutes(app);

  // Setup WebSocket
  const ioServer = setupWebSocket(server);
  setIO(ioServer);
  log('WebSocket server initialized');

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
  }, () => {
    log(`serving on port ${port}`);

    // Warm cache on startup
    import("./services/cacheService").then(({ cacheService }) => {
      cacheService.warmCache().catch(err => {
        console.error("Failed to warm cache:", err);
      });
    });

    // Initialize Email Queue
    import("./services/queueService").then(({ queueService }) => {
      queueService.initializeQueue();
    });
  });

  // PROD-SCALE: graceful shutdown. PM2 rolling reloads (`pm2 reload`) and
  // orchestrators send SIGINT/SIGTERM — without this, in-flight exam
  // requests (answer saves, submits) are killed mid-write. Drain order:
  // stop accepting -> close websockets -> drain DB pool -> redis -> exit.
  let shuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`${signal} received — draining connections...`);

    // Give in-flight requests 15s, then force-exit so a hung drain
    // can't block the replacement worker from starting.
    const forceExit = setTimeout(() => {
      console.error("[shutdown] drain timed out, forcing exit");
      process.exit(1);
    }, 15000);
    forceExit.unref();

    try {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      log("[shutdown] HTTP server closed");
    } catch (e) {
      console.error("[shutdown] error closing HTTP server:", e);
    }
    try {
      // close() waits for socket.io clients to disconnect
      await ioServer.close();
      log("[shutdown] websocket server closed");
    } catch (e) {
      console.error("[shutdown] error closing websocket server:", e);
    }
    try {
      const { pool } = await import("./db");
      await pool.end();
      log("[shutdown] db pool drained");
    } catch (e) {
      console.error("[shutdown] error draining db pool:", e);
    }
    try {
      const client = redisClient.getClient() as unknown as
        { disconnect?: () => void } | null;
      client?.disconnect?.();
      log("[shutdown] redis disconnected");
    } catch (e) {
      console.error("[shutdown] error disconnecting redis:", e);
    }
    clearTimeout(forceExit);
    log("[shutdown] complete");
    process.exit(0);
  };
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
})();
