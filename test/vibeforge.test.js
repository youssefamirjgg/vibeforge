
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Youssef Amir


import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveSafe, planWrites, slugify } from '../src/writer.js';
import { parseModelJson } from '../src/gemini.js';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'vibeforge.js');

let server;
let base;
let nextReply;
let lastRequest;

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      lastRequest = { url: req.url, key: req.headers['x-goog-api-key'], body: JSON.parse(body || '{}') };
      const payload = typeof nextReply === 'function' ? nextReply() : nextReply;
      res.writeHead(payload.status ?? 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload.json));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/v1beta`;
});

after(() => server.close());

const reply = (obj) => ({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }] } });

function run(args, { cwd, env = {}, input } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vf-home-"));
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd,
      env: { PATH: process.env.PATH, VIBEFORGE_HOME: home, VIBEFORGE_API_BASE: base, NO_COLOR: "1", ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (status) => resolve({ status, stdout, stderr, home }));
    child.stdin.end(input ?? "");
  });
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vf-work-'));

test('resolveSafe blocks traversal, absolute paths, .git and node_modules', async () => {
  const root = '/tmp/proj';
  for (const bad of ['../x', 'a/../../x', '/etc/passwd', 'C:\\win\\x', '.git/config', 'a/node_modules/x', '', 'a\0b']) {
    assert.throws(() => resolveSafe(root, bad), undefined, `should reject ${JSON.stringify(bad)}`);
  }
  assert.equal(resolveSafe(root, './src\\app.js'), path.resolve(root, 'src', 'app.js'));
});

test('planWrites rejects duplicates and refuses symlinks', async () => {
  const root = tmp();
  assert.throws(() => planWrites(root, [{ path: 'a.txt', content: '1' }, { path: './a.txt', content: '2' }]), /duplicate/);
  let canSymlink = true;
  try {
    fs.symlinkSync('/etc/hostname', path.join(root, 'link.txt'));
  } catch {
    canSymlink = false; // Windows needs admin / Developer Mode to create symlinks
  }
  if (canSymlink) assert.throws(() => planWrites(root, [{ path: 'link.txt', content: 'x' }]), /symlink/);
});

test('slugify handles Arabic / empty names', async () => {
  assert.equal(slugify('My Cool App!'), 'my-cool-app');
  assert.equal(slugify('بورتفوليو'), 'vibeforge-project');
});

test('parseModelJson tolerates code fences', async () => {
  assert.deepEqual(parseModelJson('```json\n{"a":1}\n```'), { a: 1 });
});

test('build writes files into the folder chosen by the model', async () => {
  nextReply = reply({
    project_name: 'My Portfolio',
    summary: 'Built a portfolio.',
    files: [
      { path: 'index.html', content: '<h1>hi</h1>' },
      { path: 'css/style.css', content: 'body{}' },
    ],
    next_steps: ['open index.html'],
  });
  const cwd = tmp();
  const r = await run(['build', 'a portfolio'], { cwd, env: { GEMINI_API_KEY: 'test-key-1234567890abcdef' } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(path.join(cwd, 'my-portfolio', 'index.html'), 'utf8'), '<h1>hi</h1>');
  assert.ok(fs.existsSync(path.join(cwd, 'my-portfolio', 'css', 'style.css')));
  assert.equal(lastRequest.key, 'test-key-1234567890abcdef');
  assert.match(lastRequest.url, /models\/gemini-.*:generateContent$/);
  assert.match(r.stdout, /Wrote 2 files/);
});

test('build blocks a path-traversal response and writes nothing', async () => {
  nextReply = reply({
    project_name: 'evil',
    summary: 'x',
    files: [
      { path: 'ok.txt', content: 'ok' },
      { path: '../../escape.txt', content: 'pwned' },
    ],
  });
  const cwd = tmp();
  const r = await run(['build', 'evil'], { cwd, env: { GEMINI_API_KEY: 'test-key-1234567890abcdef' } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /escapes|not allowed/);
  assert.deepEqual(fs.readdirSync(cwd), []);
});

test('build refuses a non-empty folder unless --force', async () => {
  nextReply = reply({ project_name: 'p', summary: 's', files: [{ path: 'a.txt', content: 'new' }] });
  const cwd = tmp();
  fs.mkdirSync(path.join(cwd, 'out'));
  fs.writeFileSync(path.join(cwd, 'out', 'keep.txt'), 'mine');
  const env = { GEMINI_API_KEY: 'test-key-1234567890abcdef' };
  const r1 = await run(['build', 'x', '-o', 'out'], { cwd, env });
  assert.equal(r1.status, 1);
  assert.match(r1.stderr, /not empty/);
  const r2 = await run(['build', 'x', '-o', 'out', '--force'], { cwd, env });
  assert.equal(r2.status, 0, r2.stderr);
  assert.equal(fs.readFileSync(path.join(cwd, 'out', 'keep.txt'), 'utf8'), 'mine');
});

test('--dry-run writes nothing', async () => {
  nextReply = reply({ project_name: 'dry', summary: 's', files: [{ path: 'a.txt', content: 'x' }] });
  const cwd = tmp();
  const r = await run(['build', 'x', '--dry-run'], { cwd, env: { GEMINI_API_KEY: 'test-key-1234567890abcdef' } });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fs.readdirSync(cwd), []);
});

test('edit sends existing files, skips node_modules/.env, and applies with --yes', async () => {
  nextReply = reply({ project_name: 'p', summary: 'Edited.', files: [{ path: 'index.html', content: 'NEW' }, { path: 'extra.js', content: '1' }] });
  const cwd = tmp();
  fs.writeFileSync(path.join(cwd, 'index.html'), 'OLD');
  fs.writeFileSync(path.join(cwd, '.env'), 'SECRET=topsecret');
  fs.mkdirSync(path.join(cwd, 'node_modules'));
  fs.writeFileSync(path.join(cwd, 'node_modules', 'junk.js'), 'junk');
  const r = await run(['edit', 'change it', '--yes'], { cwd, env: { GEMINI_API_KEY: 'test-key-1234567890abcdef' } });
  assert.equal(r.status, 0, r.stderr);
  const sent = JSON.stringify(lastRequest.body);
  assert.ok(sent.includes('OLD'));
  assert.ok(!sent.includes('topsecret'), 'must never send .env to the model');
  assert.ok(!sent.includes('junk'));
  assert.equal(fs.readFileSync(path.join(cwd, 'index.html'), 'utf8'), 'NEW');
  assert.ok(fs.existsSync(path.join(cwd, 'extra.js')));
});

test('edit without --yes in a non-interactive shell refuses to write', async () => {
  nextReply = reply({ project_name: 'p', summary: 's', files: [{ path: 'index.html', content: 'NEW' }] });
  const cwd = tmp();
  fs.writeFileSync(path.join(cwd, 'index.html'), 'OLD');
  const r = await run(['edit', 'x'], { cwd, env: { GEMINI_API_KEY: 'test-key-1234567890abcdef' } });
  assert.equal(r.status, 1);
  assert.equal(fs.readFileSync(path.join(cwd, 'index.html'), 'utf8'), 'OLD');
});

test('missing key gives a helpful error', async () => {
  const r = await run(['build', 'x'], { cwd: tmp() });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /vibeforge login/);
});

test('API errors are surfaced cleanly', async () => {
  nextReply = { status: 400, json: { error: { message: 'API key not valid.' } } };
  const r = await run(['build', 'x'], { cwd: tmp(), env: { GEMINI_API_KEY: 'bad-key-1234567890abcdefgh' } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /400.*API key not valid/);
});

test('login stores the key with owner-only permissions and never prints it', async () => {
  const key = 'AIzaFakeKey1234567890abcdefXYZ';
  const r = await run(['login'], { cwd: tmp(), input: key + '\n' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.stdout.includes(key));
  const file = path.join(r.home, 'config.json');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).apiKey, key);
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});
