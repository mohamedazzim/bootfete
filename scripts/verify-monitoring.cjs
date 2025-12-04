const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5002';

async function verifyMonitoring() {
    console.log('🧪 Verifying Monitoring System...');

    try {
        // 1. Check Health Endpoint
        console.log('\n1. Checking /health...');
        const health = await request('/health');
        console.log('   Status:', health.statusCode);
        const healthBody = JSON.parse(health.body);
        if (healthBody.status === 'healthy' && healthBody.checks.redis !== undefined) {
            console.log('   ✅ Health check passed with detailed metrics');
        } else {
            console.error('   ❌ Health check failed or missing metrics', healthBody);
        }

        // 2. Check Metrics Endpoint
        console.log('\n2. Checking /metrics...');
        const metrics = await request('/metrics');
        if (metrics.body.includes('http_request_duration_seconds') || metrics.body.includes('process_cpu_user_seconds_total')) {
            console.log('   ✅ Metrics endpoint returning Prometheus data');
        } else {
            console.error('   ❌ Metrics endpoint missing expected data');
            console.log('   Received:', metrics.body.substring(0, 200) + '...');
        }

        // 3. Check Correlation ID
        console.log('\n3. Checking Correlation ID...');
        const correlationRes = await request('/api/auth/me'); // Any endpoint
        const correlationId = correlationRes.headers['x-correlation-id'];
        if (correlationId && correlationId.length > 0) {
            console.log('   ✅ X-Correlation-Id header present:', correlationId);
        } else {
            console.error('   ❌ X-Correlation-Id header missing');
        }

        // 4. Check Logs (Manual check instruction)
        console.log('\n4. Log Verification');
        console.log('   Please check the "logs/" directory for "combined-YYYY-MM-DD.log".');
        console.log('   Verify it contains JSON logs with "correlationId".');

    } catch (error) {
        console.error('❌ Verification failed:', error.message);
    }
}

function request(path) {
    return new Promise((resolve, reject) => {
        http.get(`${BASE_URL}${path}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
        }).on('error', reject);
    });
}

verifyMonitoring();
