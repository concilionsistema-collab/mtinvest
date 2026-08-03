const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const tls = require('node:tls');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const databaseUrl = new URL(process.env.DATABASE_URL);
const remoteHost = databaseUrl.hostname;
const remotePort = Number(databaseUrl.port || 5432);
const localPort = Number(process.env.POSTGRES_TLS_PROXY_PORT || 15432);
const ca = fs.readFileSync(path.resolve(__dirname, '..', 'prisma', 'supabase-root-ca.pem'));

const sslRequest = Buffer.alloc(8);
sslRequest.writeInt32BE(8, 0);
sslRequest.writeInt32BE(80877103, 4);

const server = net.createServer((client) => {
  const pending = [];
  let secureRemote = null;

  client.on('data', (chunk) => {
    if (secureRemote) secureRemote.write(chunk);
    else pending.push(chunk);
  });

  const remote = net.connect(remotePort, remoteHost, () => remote.write(sslRequest));

  remote.once('data', (response) => {
    if (response[0] !== 0x53) {
      client.destroy(new Error('O PostgreSQL remoto recusou TLS.'));
      remote.destroy();
      return;
    }

    secureRemote = tls.connect(
      { socket: remote, servername: remoteHost, ca, rejectUnauthorized: true },
      () => {
        for (const chunk of pending) secureRemote.write(chunk);
        pending.length = 0;
        secureRemote.pipe(client);
      },
    );

    secureRemote.on('error', (error) => client.destroy(error));
    secureRemote.on('close', () => client.end());
  });

  remote.on('error', (error) => client.destroy(error));
  client.on('error', () => secureRemote?.destroy());
  client.on('close', () => secureRemote?.destroy());
});

server.listen(localPort, '127.0.0.1', () => {
  console.log(`PostgreSQL TLS proxy pronto em 127.0.0.1:${localPort}`);
});

