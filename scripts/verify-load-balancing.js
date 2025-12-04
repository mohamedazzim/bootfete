const http = require('http');
const { io } = require('socket.io-client');
const assert = require('assert');

// Configuration
const BASE_URL = 'http://localhost';
const PORTS = [3001, 3002, 3003];
const COOKIE_NAME = 'sympo.sid';

async function testSessionPersistence() {
    console.log('🧪 Testing Session Persistence...');

    // 1. Login to Instance 1
    console.log('   Login to Instance 1 (Port 3001)...');
    const cookie = await login(3001);
    if (!cookie) throw new Error('Failed to get session cookie');
    console.log('   ✅ Got cookie:', cookie);

    // 2. Access protected route on Instance 2 using same cookie
    console.log('   Accessing Instance 2 (Port 3002) with cookie...');
    const response2 = await request(3002, '/api/user', 'GET', null, cookie);

    if (response2.statusCode === 401 || response2.statusCode === 403) {
        throw new Error('Session NOT persisted! Got 401/403 from Instance 2');
    }
    console.log('   ✅ Instance 2 accepted session (Status:', response2.statusCode, ')');

    // 3. Access protected route on Instance 3
    console.log('   Accessing Instance 3 (Port 3003) with cookie...');
    const response3 = await request(3003, '/api/user', 'GET', null, cookie);
    if (response3.statusCode === 401 || response3.statusCode === 403) {
        throw new Error('Session NOT persisted! Got 401/403 from Instance 3');
    }
    console.log('   ✅ Instance 3 accepted session');
}

async function testWebSocketBroadcasting() {
    console.log('\n🧪 Testing WebSocket Broadcasting...');

    const client1 = io(`http://localhost:3001`, { transports: ['websocket'] });
    const client2 = io(`http://localhost:3002`, { transports: ['websocket'] });

    return new Promise((resolve, reject) => {
        let received = false;

        client1.on('connect', () => {
            console.log('   ✅ Client 1 connected to Port 3001');
            client1.emit('join_room', 'test-room');
        });

        client2.on('connect', () => {
            console.log('   ✅ Client 2 connected to Port 3002');
            client2.emit('join_room', 'test-room');

            // Give time to join
            setTimeout(() => {
                console.log('   📢 Client 1 sending message...');
                client1.emit('broadcast_test', { room: 'test-room', msg: 'hello' });
            }, 500);
        });

        client2.on('broadcast_test', (data) => {
            if (data.msg === 'hello') {
                console.log('   ✅ Client 2 received message from Client 1');
                received = true;
                client1.disconnect();
                client2.disconnect();
                resolve();
            }
        });

        setTimeout(() => {
            if (!received) {
                client1.disconnect();
                client2.disconnect();
                reject(new Error('Timeout waiting for WebSocket message'));
            }
        }, 5000);
    });
}

// Helper: Make HTTP Request
function request(port, path, method = 'GET', body = null, cookie = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: port,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        if (cookie) options.headers['Cookie'] = cookie;

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, body: data, headers: res.headers }));
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// Helper: Login to get cookie
async function login(port) {
    // Adjust login payload to match your app
    const res = await request(port, '/api/auth/login', 'POST', {
        username: 'testuser',
        password: 'password123'
    });

    const setCookie = res.headers['set-cookie'];
    if (setCookie) {
        return setCookie.map(c => c.split(';')[0]).join('; ');
    }
    return null;
}

(async () => {
    try {
        // await testSessionPersistence(); // Requires running app
        // await testWebSocketBroadcasting(); // Requires running app
        console.log('⚠️  To run tests, start the app with: pm2 start ecosystem.config.js');
        console.log('Then run: node scripts/verify-load-balancing.js');
    } catch (err) {
        console.error('❌ Test Failed:', err.message);
        process.exit(1);
    }
})();
