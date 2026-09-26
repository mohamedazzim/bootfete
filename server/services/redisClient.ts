import Redis from 'ioredis';
import "dotenv/config";
import { metricsService } from './metricsService';

class RedisClient {
  private static instance: RedisClient;
  private client: Redis | null = null;
  private isConnected: boolean = false;
  private connectionRetries: number = 0;
  private readonly MAX_RETRIES = 3;
  // Track-3: timer for scheduled re-initialization after the retry strategy
  // gives up. Without this, one transient managed-Redis blip permanently
  // disabled caching AND the Socket.IO Redis adapter until manual restart.
  private reconnectTimer: NodeJS.Timeout | null = null;
  // C-05/BUG-S-07: listeners fired every time Redis (re)connects, so the
  // Socket.IO Redis adapter can be (re)attached after a late or dropped
  // connection instead of silently running in single-server mode.
  private connectListeners: Array<() => void> = [];

  private constructor() {
    // Skip Redis connection entirely during tests to avoid noisy connection errors
    if (process.env.NODE_ENV === 'test' || process.env.DISABLE_REDIS === 'true') {
      return;
    }
    this.initializeClient();
  }

  private initializeClient() {
    if (!process.env.REDIS_HOST || !process.env.REDIS_PORT) {
      console.warn('Redis configuration missing. Caching will be disabled.');
      return;
    }

    try {
      this.client = new Redis({
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT),
        password: process.env.REDIS_PASSWORD,
        retryStrategy: (times) => {
          if (times > this.MAX_RETRIES) {
            console.error('Redis connection failed after max retries. Scheduling re-initialization with backoff.');
            this.client = null;
            this.scheduleReconnect();
            return null; // Stop this client's retry loop
          }
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        connectTimeout: 5000, // 5 seconds
      });

      this.client.on('connect', () => {
        console.log('Redis client connected');
        this.isConnected = true;
        this.connectionRetries = 0;
        metricsService.setRedisConnected(true);
        // Notify listeners (e.g. Socket.IO adapter attach) on every connect,
        // including reconnects after a drop.
        this.connectListeners.forEach((cb) => {
          try { cb(); } catch (e) { console.error('Redis connect listener error:', e); }
        });
      });

      this.client.on('error', (err) => {
        console.error('Redis client error:', err);
        this.isConnected = false;
        metricsService.setRedisConnected(false);
      });

      this.client.on('close', () => {
        console.warn('Redis connection closed');
        this.isConnected = false;
        metricsService.setRedisConnected(false);
      });

    } catch (error) {
      console.error('Failed to initialize Redis client:', error);
      this.client = null;
    }
  }

  public static getInstance(): RedisClient {
    if (!RedisClient.instance) {
      RedisClient.instance = new RedisClient();
    }
    return RedisClient.instance;
  }

  public getClient(): Redis | null {
    return this.isConnected ? this.client : null;
  }

  public isAvailable(): boolean {
    return this.isConnected && this.client !== null;
  }

  // Register a callback fired on every Redis (re)connect.
  public onConnect(cb: () => void): void {
    this.connectListeners.push(cb);
    // If already connected, fire immediately so late subscribers still attach.
    if (this.isAvailable()) {
      try { cb(); } catch (e) { console.error('Redis connect listener error:', e); }
    }
  }

  // Track-3: after the retry strategy gives up, schedule a fresh
  // initializeClient() with backoff instead of staying dead forever. The
  // new client gets a fresh retry budget; its 'connect' handler re-fires
  // connectListeners (e.g. Socket.IO adapter re-attach). Cache calls fail
  // open while disconnected, so this is safe to retry indefinitely.
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return; // already scheduled
    if (process.env.NODE_ENV === 'test' || process.env.DISABLE_REDIS === 'true') return;
    const delayMs = 30000;
    console.warn(`Redis re-initialization scheduled in ${delayMs / 1000}s`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log('Attempting Redis re-initialization...');
      this.initializeClient();
    }, delayMs);
    // Don't hold the process open for this timer alone.
    if (typeof this.reconnectTimer.unref === 'function') {
      this.reconnectTimer.unref();
    }
  }

  public async getStats(): Promise<{ connected: boolean; info?: string }> {
    if (!this.client || !this.isConnected) {
      return { connected: false };
    }
    try {
      const info = await this.client.info();
      return { connected: true, info };
    } catch (error) {
      return { connected: false };
    }
  }
}

export const redisClient = RedisClient.getInstance();
