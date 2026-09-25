/**
 * Local TCP -> WebSocket proxy for reaching the Supabase Postgres database
 * from a host where outbound TCP is firewalled to everything except 443.
 *
 * Postgres clients (Prisma, pg, psql) connect to 127.0.0.1:<LOCAL_PORT> in
 * plaintext. Each connection is bridged to the `pg-relay` edge function over a
 * WebSocket on 443, which opens a raw TCP socket to the real database and
 * pipes bytes both ways. TLS is negotiated end-to-end between the client and
 * Postgres over that pipe, so credentials are never visible to the relay.
 *
 * Config comes from the environment (see .env):
 *   PG_PROXY_PORT        local listen port (default 5433)
 *   PG_RELAY_URL         wss URL of the pg-relay edge function
 *   PG_RELAY_TOKEN       shared secret expected by the relay
 *   PG_RELAY_TARGET_HOST upstream DB host the relay should dial
 *   PG_RELAY_TARGET_PORT upstream DB port the relay should dial
 */
require('dotenv').config();
const net = require('net');

const LOCAL_PORT = Number(process.env.PG_PROXY_PORT || 5433);
const RELAY_URL = process.env.PG_RELAY_URL;
const RELAY_TOKEN = process.env.PG_RELAY_TOKEN;
const TARGET_HOST =
  process.env.PG_RELAY_TARGET_HOST || 'db.eyvzguxlshilclzvpvqc.supabase.co';
const TARGET_PORT = Number(process.env.PG_RELAY_TARGET_PORT || 5432);

if (!RELAY_URL || !RELAY_TOKEN) {
  console.error('[pg-proxy] PG_RELAY_URL and PG_RELAY_TOKEN must be set');
  process.exit(1);
}

function relayEndpoint() {
  const u = new URL(RELAY_URL);
  u.searchParams.set('token', RELAY_TOKEN);
  u.searchParams.set('host', TARGET_HOST);
  u.searchParams.set('port', String(TARGET_PORT));
  return u.toString();
}

const server = net.createServer((client) => {
  client.pause();
  const buffered = [];
  let ws;
  let wsOpen = false;

  const cleanup = () => {
    try { client.destroy(); } catch { /* ignore */ }
    try { ws && ws.close(); } catch { /* ignore */ }
  };

  try {
    ws = new WebSocket(relayEndpoint());
  } catch (e) {
    console.error('[pg-proxy] ws construct failed:', e.message);
    return cleanup();
  }
  ws.binaryType = 'arraybuffer';

  ws.addEventListener('open', () => {
    wsOpen = true;
    for (const chunk of buffered) ws.send(chunk);
    buffered.length = 0;
    client.resume();
  });

  ws.addEventListener('message', (ev) => {
    const data = ev.data;
    const buf = Buffer.isBuffer(data)
      ? data
      : Buffer.from(data instanceof ArrayBuffer ? data : new Uint8Array(data));
    if (client.writable) client.write(buf);
  });

  ws.addEventListener('close', () => cleanup());
  ws.addEventListener('error', (e) => {
    console.error('[pg-proxy] ws error:', e.message || 'unknown');
    cleanup();
  });

  client.on('data', (chunk) => {
    const ab = chunk.buffer.slice(
      chunk.byteOffset,
      chunk.byteOffset + chunk.byteLength
    );
    if (wsOpen) ws.send(ab);
    else buffered.push(ab);
  });
  client.on('close', () => cleanup());
  client.on('error', () => cleanup());
});

server.on('error', (e) => {
  console.error('[pg-proxy] listen error:', e.message);
  process.exit(1);
});

server.listen(LOCAL_PORT, '127.0.0.1', () => {
  console.log(
    `[pg-proxy] listening on 127.0.0.1:${LOCAL_PORT} -> ${TARGET_HOST}:${TARGET_PORT} via relay`
  );
});
