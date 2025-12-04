import client from 'prom-client';

class MetricsService {
    public httpDuration: client.Histogram<string>;
    public dbDuration: client.Histogram<string>;
    public cacheHits: client.Counter<string>;
    public cacheMisses: client.Counter<string>;
    public activeSessions: client.Gauge<string>;
    public emailQueueDepth: client.Gauge<string>;
    public emailQueueDeadLetter: client.Gauge<string>;
    public redisConnected: client.Gauge<string>;
    public dbPoolPending: client.Gauge<string>;

    constructor() {
        client.collectDefaultMetrics();

        // HTTP Metrics
        this.httpDuration = new client.Histogram({
            name: 'http_request_duration_seconds',
            help: 'Duration of HTTP requests',
            labelNames: ['method', 'route', 'status'],
            buckets: [0.01, 0.05, 0.1, 0.5, 1, 5]
        });

        // Database Metrics
        this.dbDuration = new client.Histogram({
            name: 'db_query_duration_seconds',
            help: 'Duration of database queries',
            labelNames: ['query_type'],
            buckets: [0.01, 0.05, 0.1, 0.5, 1]
        });

        // Cache Metrics
        this.cacheHits = new client.Counter({
            name: 'cache_hits_total',
            help: 'Total cache hits'
        });

        this.cacheMisses = new client.Counter({
            name: 'cache_misses_total',
            help: 'Total cache misses'
        });

        // Business Metrics
        this.activeSessions = new client.Gauge({
            name: 'active_sessions',
            help: 'Number of active sessions'
        });

        this.emailQueueDepth = new client.Gauge({
            name: 'email_queue_depth',
            help: 'Number of emails in queue'
        });

        this.emailQueueDeadLetter = new client.Gauge({
            name: 'email_queue_dead_letter',
            help: 'Number of emails in dead letter queue'
        });

        this.redisConnected = new client.Gauge({
            name: 'redis_connected',
            help: 'Redis connection status (1 = connected, 0 = disconnected)'
        });

        this.dbPoolPending = new client.Gauge({
            name: 'db_pool_pending',
            help: 'Number of pending database connection requests'
        });
    }

    recordHttpRequest(method: string, route: string, status: number, duration: number) {
        this.httpDuration.labels(method, route, status.toString()).observe(duration);
    }

    recordDbQuery(queryType: string, duration: number) {
        this.dbDuration.labels(queryType).observe(duration);
    }

    recordCacheHit() { this.cacheHits.inc(); }
    recordCacheMiss() { this.cacheMisses.inc(); }

    setActiveSessions(count: number) { this.activeSessions.set(count); }
    setEmailQueueDepth(count: number) { this.emailQueueDepth.set(count); }
    setEmailQueueDeadLetter(count: number) { this.emailQueueDeadLetter.set(count); }
    setRedisConnected(isConnected: boolean) { this.redisConnected.set(isConnected ? 1 : 0); }
    setDbPoolPending(count: number) { this.dbPoolPending.set(count); }

    async getMetrics() {
        return client.register.metrics();
    }

    getContentType() {
        return client.register.contentType;
    }
}

export const metricsService = new MetricsService();
