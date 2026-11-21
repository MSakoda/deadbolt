// One-time helper: signs in to Google and prints a refresh token that lets the server send mail from
// your Gmail account. Run from the repo root:  npm run gmail-token -w @deadbolt/server
// Needs GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET (a "Desktop app" OAuth client) in the repo-root .env.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

try { process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url))); } catch { /* no .env */ }

const clientId = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in the repo-root .env first.');
  process.exit(1);
}

const PORT = 53682;
const redirect = `http://127.0.0.1:${PORT}`;
const state = randomBytes(16).toString('hex');
const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirect,
  response_type: 'code',
  scope: 'https://www.googleapis.com/auth/gmail.send',
  access_type: 'offline',
  prompt: 'consent',
  state,
});

const server = createServer(async (req, res) => {
  const q = new URL(req.url ?? '/', redirect).searchParams;
  if (!q.has('code') && !q.has('error')) { res.writeHead(404).end(); return; }
  const done = (msg: string, code = 200) => { res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' }).end(msg); setTimeout(() => process.exit(code === 200 ? 0 : 1), 200); };
  if (q.get('state') !== state) return done('State did not match. Start again.', 400);
  if (q.has('error')) return done(`Google said: ${q.get('error')}`, 400);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: q.get('code')!, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: 'authorization_code' }),
  });
  const j = (await r.json()) as { refresh_token?: string; error?: string; error_description?: string };
  if (!r.ok || !j.refresh_token) {
    console.error('Token exchange failed:', j.error, j.error_description ?? '');
    return done('Token exchange failed. See the terminal.', 400);
  }
  console.log('\nRefresh token (keep it secret; paste it into .env and Render as GMAIL_REFRESH_TOKEN):\n\n' + j.refresh_token + '\n');
  done('Done. You can close this tab and go back to the terminal.');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Open this address in your browser and sign in with the Gmail account that should send the mail:\n\n' + url + '\n');
});
