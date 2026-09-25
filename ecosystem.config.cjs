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
    max_memory_restart: '1G'
  }]
};
