import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import pdfParse from 'pdf-parse';
import { makePdf } from '../src/services/resumePdf.js';

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function unusedPort() {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const { port } = listener.address();
  await new Promise((resolveClose, reject) => listener.close(error => error ? reject(error) : resolveClose()));
  return port;
}

test('generated resume PDF opens as a valid PDF containing the tailored resume text', { timeout: 20000 }, async t => {
  const port = await unusedPort();
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), MONGODB_URI: '', JWT_SECRET: 'pdf-api-test-secret', NODE_ENV: 'test', ENABLE_DEMO_SEED: 'true' },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  t.after(() => { if (child.exitCode === null) child.kill(); });

  const base = `http://127.0.0.1:${port}/api`;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Test API server exited with code ${child.exitCode}`);
    try { if ((await fetch(`${base}/health`)).ok) { ready = true; break; } }
    catch { /* wait for the test server to start */ }
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  assert.equal(ready, true, 'test API server should become ready');

  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'demo@careerpilot.ai', password: 'Password@123' }),
  });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  const request = (path, options = {}) => fetch(`${base}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${token}`, ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers },
  });

  const listings = await (await request('/internships')).json();
  const generated = await request('/application-materials/generate', {
    method: 'POST',
    body: JSON.stringify({ internshipId: listings.internships[0]._id }),
  });
  assert.equal(generated.status, 201);
  const { resumeVersion } = await generated.json();
  assert.ok(resumeVersion.content.includes('Demo Candidate'));

  const versionsResponse = await request('/application-materials');
  assert.equal(versionsResponse.status, 200);
  const { resumeVersions } = await versionsResponse.json();
  assert.ok(resumeVersions.some(version => version._id === resumeVersion._id));

  const response = await request(`/application-materials/${resumeVersion._id}/pdf`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /application\/pdf/);
  const pdf = Buffer.from(await response.arrayBuffer());
  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
  const parsed = await pdfParse(Uint8Array.from(pdf));
  assert.match(parsed.text, /Demo Candidate/);
  assert.match(parsed.text, /Skills:/i);
});

test('PDF renderer preserves words and contact details, formats bullets and grouped unique skills', async () => {
  const content = [
    'Alex Example',
    'Email: alex@example.com',
    'Technical Skills: JavaScript, React, HTML, CSS, Git, React',
    'Projects',
    `* Career Navigator: ${'A'.repeat(70)} involving retrieval-augmented search and reporting for student opportunities. Technologies: React, JavaScript, Git`,
    'Experience',
    '* Data Analyst Intern: Created reporting solutions involving large datasets.',
    'Education',
    'State University - Bachelor of Science',
  ].join('\n');
  const pdf = makePdf(content);
  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
  const parsed = await pdfParse(Uint8Array.from(pdf));
  assert.match(parsed.text, /Alex Example/);
  assert.match(parsed.text, /alex@example\.com/);
  assert.match(parsed.text, /involving/);
  assert.match(parsed.text, /retrieval-augmented/);
  assert.doesNotMatch(parsed.text, /involv\s+ing|retrievalaugmented|\?/);
  assert.match(parsed.text, /\u2022\s+Career Navigator/);
  assert.match(parsed.text, /Career Navigator:[\s\S]*Technologies: React, JavaScript, Git/);
  assert.match(parsed.text, /Technical Skills[\s\S]*Languages: JavaScript[\s\S]*Frameworks & Libraries: React[\s\S]*Web Technologies: HTML, CSS[\s\S]*Tools & Platforms: Git/);
  const skillsSection = parsed.text.split(/Technical Skills/i)[1]?.split(/Projects/i)[0] || '';
  assert.equal((skillsSection.match(/\bReact\b/g) || []).length, 1, 'duplicate skills should be removed in the PDF');
});
