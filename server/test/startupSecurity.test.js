import test from 'node:test';
import assert from 'node:assert/strict';
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

async function startApi(env) {
  const port = await unusedPort();
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), MONGODB_URI: '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
  child.stderr.setEncoding('utf8').on('data', chunk => { output += chunk; });
  const base = `http://127.0.0.1:${port}/api`;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) break;
    try { if ((await fetch(`${base}/health`)).ok) return { child, base, getOutput: () => output }; }
    catch { /* wait for startup */ }
    await new Promise(resolveWait => setTimeout(resolveWait, 50));
  }
  return { child, base, getOutput: () => output };
}

test('server exits with a clear error when JWT_SECRET is missing', { timeout: 10000 }, async () => {
  const { child, getOutput } = await startApi({ JWT_SECRET: '', NODE_ENV: 'test' });
  if (child.exitCode === null) child.kill();
  if (child.exitCode === null) await once(child, 'exit');
  assert.equal(child.exitCode, 1);
  assert.match(getOutput(), /JWT_SECRET must be configured/);
  assert.doesNotMatch(getOutput(), /careerpilot-local-development-secret/);
});

test('demo account is not created by default or in production, even when explicitly requested', { timeout: 15000 }, async t => {
  const configurations = [
    { JWT_SECRET: 'demo-seed-default-test-secret', NODE_ENV: 'test', ENABLE_DEMO_SEED: '' },
    { JWT_SECRET: 'demo-seed-production-test-secret', NODE_ENV: 'production', ENABLE_DEMO_SEED: 'true' },
  ];
  for (const env of configurations) {
    const { child, base } = await startApi(env);
    if (child.exitCode !== null) throw new Error('Test API server exited before becoming ready');
    t.after(() => { if (child.exitCode === null) child.kill(); });
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'demo@careerpilot.ai', password: 'Password@123' }),
    });
    assert.equal(login.status, 401);
    child.kill();
    await once(child, 'exit');
  }
});
