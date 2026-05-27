module.exports = {
  apps: [
    {
      name: 'rifadorada-bot',
      script: 'cmd',
      args: '/c start.bat',
      cwd: '.',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3008,
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
}
