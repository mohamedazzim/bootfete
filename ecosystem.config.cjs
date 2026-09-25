module.exports = {
  apps: [{
    name: 'bootfete',
    script: './server/index.ts',
    instances: 2,
    exec_mode: 'cluster',
    interpreter: 'node',
    interpreter_args: '--loader tsx',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '1G',
    // PROD-SCALE: give the app's graceful-shutdown handler time to drain
    // in-flight exam requests before SIGKILL (must exceed the 15s drain
    // timeout in server/index.ts). `pm2 reload` then does zero-downtime
    // rolling restarts across the cluster workers.
    kill_timeout: 20000,
  }]
};
