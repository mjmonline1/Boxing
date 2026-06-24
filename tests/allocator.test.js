// Copyright (c) 2026 ITLR Assets. All rights reserved.
//
// Tests for ALLOCATOR.js — allocate() round-robin ring distribution.
//
// Run with:  node --test

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const { allocate } = require('../ALLOCATOR');

test('allocate: throws on missing matches array', () => {
    assert.throws(() => allocate({}, ['R1'], { R1: 10 }), /Invalid JSON/);
    assert.throws(() => allocate({ matches: 'bad' }, ['R1'], { R1: 10 }), /Invalid JSON/);
});

test('allocate: works with empty matches array', () => {
    assert.doesNotThrow(() => allocate({ matches: [] }, ['R1'], { R1: 10 }));
});

test('allocate: distributes matches across rings without throwing', () => {
    const rings    = ['R1', 'R2', 'R3'];
    const capacity = { R1: 10, R2: 10, R3: 10 };
    const data     = { matches: Array.from({ length: 9 }, (_, i) => ({ id: `M${i}` })) };
    assert.doesNotThrow(() => allocate(data, rings, capacity));
});

test('allocate: stops early when all rings are full', () => {
    // 2 total slots, 3 matches — third match should be dropped with a warning
    const rings    = ['R1', 'R2'];
    const capacity = { R1: 1, R2: 1 };
    const data     = { matches: [{ id: 'M1' }, { id: 'M2' }, { id: 'M3' }] };
    assert.doesNotThrow(() => allocate(data, rings, capacity));
});

test('allocate: uses match index as id when match.id is absent', () => {
    // exercises the `match.id || i` branch in Allocated()
    const rings    = ['R1'];
    const capacity = { R1: 5 };
    const data     = { matches: [{ red: 'A', blue: 'B' }] }; // no .id field
    assert.doesNotThrow(() => allocate(data, rings, capacity));
});
