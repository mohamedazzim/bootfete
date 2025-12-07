import { redisClient } from './redisClient';
import { storage } from '../storage';

class CacheService {
    private pendingRequests: Map<string, Promise<any>> = new Map();
    private stats = {
        hits: 0,
        misses: 0,
    };
    private readonly MAX_OBJECT_SIZE = 1024 * 1024; // 1MB

    /**
     * Get data from cache or fetch from source with race condition protection
     */
    async get<T>(key: string, fetchFunction: () => Promise<T>, ttl: number = 3600): Promise<T> {
        const client = redisClient.getClient();

        // Fallback to DB if Redis is unavailable
        if (!client || !redisClient.isAvailable()) {
            return fetchFunction();
        }

        try {
            // 1. Try cache first
            const cachedValue = await client.get(key);
            if (cachedValue) {
                this.stats.hits++;
                // console.debug('Cache HIT', { key });
                return JSON.parse(cachedValue);
            }

            this.stats.misses++;
            // console.debug('Cache MISS', { key });

            // 2. Check for pending request (Race Condition Protection)
            if (this.pendingRequests.has(key)) {
                // console.debug('Waiting for pending request', { key });
                return this.pendingRequests.get(key) as Promise<T>;
            }

            // 3. Create new request promise
            const requestPromise = (async () => {
                try {
                    const data = await fetchFunction();

                    // 4. Cache the result (if size permits)
                    await this.set(key, data, ttl);

                    return data;
                } finally {
                    this.pendingRequests.delete(key);
                }
            })();

            this.pendingRequests.set(key, requestPromise);
            return requestPromise;

        } catch (error) {
            console.error('Cache get error:', error);
            // Fallback to fetch function on error
            return fetchFunction();
        }
    }

    /**
     * Set value in cache with size check
     */
    async set(key: string, value: any, ttl: number = 3600): Promise<void> {
        const client = redisClient.getClient();
        if (!client || !redisClient.isAvailable()) return;

        try {
            const stringValue = JSON.stringify(value);

            // Large Object Protection
            if (stringValue.length > this.MAX_OBJECT_SIZE) {
                console.warn(`Skipping cache for key ${key}: Object size ${stringValue.length} exceeds limit of ${this.MAX_OBJECT_SIZE}`);
                return;
            }

            await client.setex(key, ttl, stringValue);
        } catch (error) {
            console.error('Cache set error:', error);
        }
    }

    /**
     * Delete single key
     */
    async delete(key: string): Promise<void> {
        const client = redisClient.getClient();
        if (!client || !redisClient.isAvailable()) return;

        try {
            await client.del(key);
            // console.debug('Cache deleted', { key });
        } catch (error) {
            console.error('Cache delete error:', error);
        }
    }

    /**
     * Delete all keys matching pattern
     */
    async deletePattern(pattern: string): Promise<void> {
        const client = redisClient.getClient();
        if (!client || !redisClient.isAvailable()) return;

        try {
            const keys = await client.keys(pattern);
            if (keys.length > 0) {
                await client.del(...keys);
                // console.debug('Cache pattern deleted', { pattern, count: keys.length });
            }
        } catch (error) {
            console.error('Cache deletePattern error:', error);
        }
    }

    /**
     * Alias for delete
     */
    async invalidate(key: string): Promise<void> {
        return this.delete(key);
    }

    /**
     * Flush all cache (Admin only)
     */
    async flushAll(): Promise<void> {
        const client = redisClient.getClient();
        if (!client || !redisClient.isAvailable()) return;

        try {
            await client.flushall();
            console.log('Cache flushed');
        } catch (error) {
            console.error('Cache flush error:', error);
        }
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
        return {
            ...this.stats,
            hitRate: `${hitRate.toFixed(2)}%`,
            pendingRequests: this.pendingRequests.size
        };
    }

    /**
     * Warm cache on startup
     */
    async warmCache(): Promise<void> {
        console.log('Starting cache warming...');
        try {
            // Cache recent events (limit 50)
            const events = await storage.getEvents(); // Assuming getEvents fetches all, might need optimization if large
            const recentEvents = events.slice(0, 50);

            // Cache the list
            await this.set('events:list', recentEvents, 3600);

            // Cache individual events
            for (const event of recentEvents) {
                await this.set(`event:${event.id}`, event, 1800);
            }

            // Cache registrations (frequently accessed)
            const registrations = await storage.getRegistrations();
            await this.set('registrations:all', registrations, 300);

            // Cache unique colleges
            const colleges = await storage.getUniqueColleges();
            await this.set('registrations:colleges', colleges, 600);

            console.log(`Cache warming complete. Cached ${recentEvents.length} events, ${registrations.length} registrations, ${colleges.length} colleges.`);
        } catch (error) {
            console.error('Cache warming failed:', error);
        }
    }
}

export const cacheService = new CacheService();
