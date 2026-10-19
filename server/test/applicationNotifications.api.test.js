import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function unusedPort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
  return port;
}

test('HTTP status update emits one retrievable notification for its application', { timeout: 20000 }, async t => {
  const port = await unusedPort();
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), MONGODB_URI: '', JWT_SECRET: 'notification-api-test-secret', NODE_ENV: 'test', ENABLE_DEMO_SEED: 'true' },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  const base = `http://127.0.0.1:${port}/api`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Test API server exited with code ${child.exitCode}`);
    try { if ((await fetch(`${base}/health`)).ok) { ready = true; break; } } catch { /* wait until startup finishes */ }
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  assert.equal(ready, true, 'test API server should become ready');

  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'demo@careerpilot.ai', password: 'Password@123' }) });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  const request = (path, options = {}) => fetch(`${base}${path}`, { ...options, headers: { authorization: `Bearer ${token}`, ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers } });

  const listings = await (await request('/internships')).json();
  assert.ok(listings.internships.length);
  const internshipId = listings.internships[0]._id;
  const saved = await request('/applications', { method: 'POST', body: JSON.stringify({ internshipId, status: 'SAVED' }) });
  assert.equal(saved.status, 200);
  const { application } = await saved.json();
  const updated = await request(`/applications/${application._id}`, { method: 'PATCH', body: JSON.stringify({ status: 'APPLIED' }) });
  assert.equal(updated.status, 200);

  const notifications = await (await request('/notifications')).json();
  const event = notifications.notifications.filter(n => n.applicationId === application._id && n.event === 'APPLIED');
  assert.equal(event.length, 1);
  assert.equal(event[0].userId, application.userId);
  assert.match(event[0].message, /marked as applied/);

  const retry = await request(`/applications/${application._id}`, { method: 'PATCH', body: JSON.stringify({ status: 'APPLIED' }) });
  assert.equal(retry.status, 200);
  const afterRetry = await (await request('/notifications')).json();
  assert.equal(afterRetry.notifications.filter(n => n.applicationId === application._id && n.event === 'APPLIED').length, 1);
});
