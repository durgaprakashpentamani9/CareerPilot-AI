import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = await readFile(fileURLToPath(new URL('../src/ui.jsx', import.meta.url)), 'utf8');

test('authentication form starts with empty name, email, and password fields', () => {
  assert.match(source, /\[email,setEmail\]=useState\(''\),\[password,setPassword\]=useState\(''\),\[name,setName\]=useState\(''\)/);
  assert.match(source, /type="text" autoComplete="name" placeholder="Name" value=\{name\}/);
  assert.match(source, /type="email" autoComplete=\{register\?'email':'username'\} placeholder="Email" value=\{email\}/);
  assert.match(source, /type="password" autoComplete=\{register\?'new-password':'current-password'\} placeholder="Password" value=\{password\}/);
  assert.doesNotMatch(source, /demo@careerpilot\.ai|Password@123/);
});
