module.exports = {
    apps: [
        {
            name: 'sympo-1',
            script: './dist/index.js',
            env: {
                NODE_ENV: 'production',
                PORT: 3001,
                INSTANCE_ID: '1'
            },
            error_file: './logs/sympo-1-error.log',
            out_file: './logs/sympo-1-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            max_memory_restart: '512M',
            max_restarts: 10,
            min_uptime: '10s',
            listen_timeout: 5000,
            kill_timeout: 3000,
            merge_logs: true
        },
        {
            name: 'sympo-2',
            script: './dist/index.js',
            env: {
                NODE_ENV: 'production',
                PORT: 3002,
                INSTANCE_ID: '2'
            },
            error_file: './logs/sympo-2-error.log',
            out_file: './logs/sympo-2-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            max_memory_restart: '512M',
            max_restarts: 10,
            min_uptime: '10s'
        },
        {
            name: 'sympo-3',
            script: './dist/index.js',
            env: {
                NODE_ENV: 'production',
                PORT: 3003,
                INSTANCE_ID: '3'
            },
            error_file: './logs/sympo-3-error.log',
            out_file: './logs/sympo-3-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            max_memory_restart: '512M',
            max_restarts: 10,
            min_uptime: '10s'
        }
    ]
};
