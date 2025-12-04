import Redis from 'ioredis';
import "dotenv/config";

class RedisClient {
  private static instance: RedisClient;
  private client: Redis | null = null;
  private isConnected: boolean = false;
  private connectionRetries: number = 0;
  private readonly MAX_RETRIES = 3;

  private constructor() {
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
            console.error('Redis connection failed after max retries. Caching disabled.');
            this.client = null;
            return null; // Stop retrying
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
      });

      this.client.on('error', (err) => {
        console.error('Redis client error:', err);
        this.isConnected = false;
      });

      this.client.on('close', () => {
        console.warn('Redis connection closed');
        this.isConnected = false;
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
