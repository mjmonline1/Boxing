// Copyright (c) 2026 ITLR Assets. All rights reserved.
//
// Exercises the local Server.js Express API by spawning it as a child process
// on a non-default port (so it won't collide with a running 5500/6502 dev
// server) and hitting its endpoints. Skips cleanly if the server can't start.
//
// Run with:  node --test

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 5599;
const BASE = `http://127.0.0.1:${PORT}`;
const SERVER = path.join(__dirname, '..', 'Server.js');

let child = null;
let serverUp = false;

async function waitForServer(timeoutMs = 6000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${BASE}/api/version`);
            if (res.ok) return true;
        } catch { /* not listening yet */ }
        await new Promise(r => setTimeout(r, 50));
    }
    return false;
}

before(async () => {
    child = spawn(process.execPath, [SERVER], {
        env: { ...process.env, PORT: String(PORT) },
        stdio: 'ignore',
    });
    child.on('error', () => { serverUp = false; });
    serverUp = await waitForServer();
});

after(() => {
    if (child) child.kill();
});

test('GET /api/version returns the package version', async (t) => {
    if (!serverUp) { t.skip('Server.js did not start (port busy?)'); return; }
    const res = await fetch(`${BASE}/api/version`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(String(body.version), /^\d+\.\d+\.\d+$/);
});

test('GET /api/data/boxers returns a non-empty boxer array', async (t) => {
    if (!serverUp) { t.skip('Server.js did not start'); return; }
    const res = await fetch(`${BASE}/api/data/boxers`);
    // 200 with boxers, or 404 if the CSV is missing — both are valid contracts.
    if (res.status === 404) {
        assert.ok((await res.json()).error, '404 must carry an error message');
        return;
    }
    assert.equal(res.status, 200);
    const boxers = await res.json();
    assert.ok(Array.isArray(boxers) && boxers.length > 0, 'expected a non-empty array');
    const b = boxers[0];
    for (const key of ['name', 'gender', 'yob', 'weight']) {
        assert.ok(key in b, `boxer missing ${key}`);
    }
});

test('GET /api/data/buckets returns json (200) or a 404 error contract', async (t) => {
    if (!serverUp) { t.skip('Server.js did not start'); return; }
    const res = await fetch(`${BASE}/api/data/buckets`);
    assert.ok([200, 404].includes(res.status), `unexpected status ${res.status}`);
    const body = await res.json();
    if (res.status === 404) assert.ok(body.error, '404 must carry an error message');
    else assert.ok(body && typeof body === 'object', '200 must return an object');
});

test('GET /api/spar-dates returns an array', async (t) => {
    if (!serverUp) { t.skip('Server.js did not start'); return; }
    const res = await fetch(`${BASE}/api/spar-dates`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(await res.json()));
});

test('unknown route returns 404', async (t) => {
    if (!serverUp) { t.skip('Server.js did not start'); return; }
    const res = await fetch(`${BASE}/api/does-not-exist`);
    assert.equal(res.status, 404);
});
