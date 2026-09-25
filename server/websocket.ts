import { Server } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { storage } from './storage';
import { createAdapter } from "@socket.io/redis-adapter";
import { redisClient } from "./services/redisClient";

const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  // C1 (round 2): never fall back to a hardcoded JWT secret in production.
  // In production without an explicit JWT_SECRET the server refuses to boot
  // instead of minting/verifying tokens against a guessable default.
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  return secret || 'dev-only-insecure-secret';
})();

export function setupWebSocket(httpServer: HTTPServer) {
  // Assign the module-level export directly (previously a local `const io`
  // shadowed it and relied on callers remembering setIO()).
  // SEC-07: don't combine `origin: '*'` with `credentials: true` (browsers
  // reject wildcard + credentials, and it's a misconfiguration signal).
  // Auth travels in `auth.token`, not cookies, so credentials aren't needed.
  // CORS_ORIGIN can restrict this further in deployments with a separate
  // frontend domain (comma-separated list supported).
  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : '*';
  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigins,
    }
  });

  // C-05/BUG-S-07: attach the Redis adapter for cross-worker pub/sub, and
  // re-attach on every Redis (re)connect. Previously the adapter was only
  // attempted once at boot — if Redis wasn't connected yet, the server
  // silently stayed in single-server mode while PM2 ran 2 cluster workers,
  // so broadcasts only reached clients on the emitting worker.
  let adapterSubClient: any = null;
  const attachRedisAdapter = () => {
    const pubClient = redisClient.getClient();
    if (!pubClient) return;
    try {
      // Drop the previous duplicate subscriber so reconnects don't leak them.
      if (adapterSubClient) {
        adapterSubClient.disconnect().catch(() => {});
      }
      adapterSubClient = pubClient.duplicate();
      io.adapter(createAdapter(pubClient, adapterSubClient));
      console.log('Socket.io Redis adapter initialized');
    } catch (err) {
      console.error('Failed to attach Socket.io Redis adapter:', err);
    }
  };

  // Fires immediately if Redis is already connected, otherwise on connect.
  redisClient.onConnect(attachRedisAdapter);

  // Authentication middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;

      // C1 (round 2): the old `test-`/`stress-` branch trusted JWT claims
      // verbatim (no DB lookup) and fed the testEvent broadcast primitive.
      // Deleted — every socket identity is now resolved via storage.
      const user = await storage.getUser(decoded.id);
      if (!user) {
        return next(new Error('User not found'));
      }
      socket.data.user = user;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    console.log(`WebSocket: User connected: ${user.username} (${user.role})`);

    if (user.role === 'super_admin') {
      socket.join('super_admin');
    } else if (user.role === 'event_admin') {
      // C1 (round 2): event rooms are always resolved via storage — the old
      // test-user shortcut (joining event:{eventId} straight from token
      // claims) is gone with the deleted testEvent scaffolding.
      storage.getEventsByAdmin(user.id).then(events => {
        events.forEach(event => {
          socket.join(`event:${event.id}`);
        });
      }).catch(err => {
        console.error(`WebSocket: failed to resolve event rooms for admin ${user.id}:`, err);
      });
    } else if (user.role === 'participant') {
      socket.join(`participant:${user.id}`);
    } else if (user.role === 'registration_committee') {
      socket.join('registration_committee');
    }

    socket.on('disconnect', () => {
      console.log(`WebSocket: User disconnected: ${user.username}`);
    });
  });

  return io;
}

export let io: Server;

export function setIO(server: Server) {
  io = server;
}
