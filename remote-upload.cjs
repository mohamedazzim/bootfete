
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();

const config = {
    host: '64.227.190.85',
    port: 22,
    username: 'root',
    password: 'AZZIM@63800j'
};

const filesToUpload = [
    {
        local: 'server/storage.ts',
        remote: '/var/www/bootfete/server/storage.ts'
    },
    {
        local: 'server/routes.ts',
        remote: '/var/www/bootfete/server/routes.ts'
    },
    {
        local: 'client/src/pages/participant/dashboard.tsx',
        remote: '/var/www/bootfete/client/src/pages/participant/dashboard.tsx'
    },
    {
        local: 'client/src/pages/public/event-registration.tsx',
        remote: '/var/www/bootfete/client/src/pages/public/event-registration.tsx'
    }
];

conn.on('ready', () => {
    console.log('Client :: ready');
    conn.sftp((err, sftp) => {
        if (err) {
            console.log('SFTP error:', err);
            conn.end();
            return;
        }

        let completed = 0;

        filesToUpload.forEach(file => {
            const localPath = path.join(__dirname, file.local);
            console.log(`Uploading ${localPath} to ${file.remote}...`);

            sftp.fastPut(localPath, file.remote, (err) => {
                if (err) {
                    console.log(`Error uploading ${file.remote}:`, err);
                } else {
                    console.log(`Success: ${file.remote}`);
                }

                completed++;
                if (completed === filesToUpload.length) {
                    // Rebuild and restart to apply changes
                    console.log('Building and restarting application...');
                    const command = 'cd /var/www/bootfete && npm run build && pm2 restart all';

                    conn.exec(command, (err, stream) => {
                        if (err) {
                            console.log('Exec error:', err);
                            conn.end();
                            return;
                        }
                        stream.on('close', (code, signal) => {
                            console.log('Stream :: close :: code: ' + code + ', signal: ' + signal);
                            conn.end();
                        }).on('data', (data) => {
                            console.log('STDOUT: ' + data);
                        }).stderr.on('data', (data) => {
                            console.log('STDERR: ' + data);
                        });
                    });
                }
            });
        });
    });
}).connect(config);
