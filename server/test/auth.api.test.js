import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function unusedPort() {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const { port } = listener.address();
  await new Promise((resolveClose, reject) => listener.close(error => error ? reject(error) : resolveClose()));
  return port;
}

test('registration validates, normalizes, hashes, rejects duplicates, and supports login', { timeout: 20000 }, async t => {
  const port = await unusedPort();
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), MONGODB_URI: '', JWT_SECRET: 'auth-api-test-secret' },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  t.after(() => { if (child.exitCode === null) child.kill(); });

  const base = `http://127.0.0.1:${port}/api/auth`;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Test API server exited with code ${child.exitCode}`);
    try {
      if ((await fetch(`${base.replace('/auth', '')}/health`)).ok) { ready = true; break; }
    } catch { /* wait for the test server to start */ }
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  assert.equal(ready, true, 'test API server should become ready');

  const post = (path, body) => fetch(`${base}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal((await post('register', { name: '', email: 'bad', password: 'long-enough' })).status, 400);
  assert.equal((await post('register', { name: 'Candidate', email: 'not-an-email', password: 'long-enough' })).status, 400);
  assert.equal((await post('register', { name: 'Candidate', email: 'valid@example.com', password: 'short' })).status, 400);

  const unique = randomUUID().replaceAll('-', '');
  const originalEmail = `  Candidate.${unique}@Example.COM  `;
  const normalizedEmail = originalEmail.trim().toLowerCase();
  const password = `Secure-${unique}`;
  const registered = await post('register', { name: '  Career Pilot  ', email: originalEmail, password });
  assert.equal(registered.status, 201);
  const registration = await registered.json();
  assert.equal(registration.user.name, 'Career Pilot');
  assert.equal(registration.user.email, normalizedEmail);
  assert.ok(registration.token);
  assert.equal(Object.hasOwn(registration.user, 'password'), false);

  const duplicate = await post('register', { name: 'Another Name', email: normalizedEmail.toUpperCase(), password });
  assert.equal(duplicate.status, 409);

  const login = await post('login', { email: ` ${normalizedEmail.toUpperCase()} `, password });
  assert.equal(login.status, 200);
  const session = await login.json();
  assert.equal(session.user.email, normalizedEmail);
  assert.ok(session.token);

  assert.equal((await post('login', { email: normalizedEmail, password: 'incorrect-password' })).status, 401);
  assert.equal((await post('login', { email: `unknown-${unique}@example.com`, password })).status, 401);
});
