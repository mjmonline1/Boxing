// Copyright (c) 2026 ITLR Assets. All rights reserved.
//
// Tests for the "Random Select" pairing algorithm (pairBoxersRandom + pairAll
// algorithm:'randomSelect'). Random Select clones greedy's constraints (weight
// tolerance, daily caps, no same-run rematch, club avoidance) but chooses among
// eligible opponents at random, with a soft preference for opponents NOT sparred
// on an earlier day (priorPairs).
//
// Run with:  node --test

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const { pairBoxers, pairBoxersRandom, pairAll, pairKey } = require('../SparMaker');

let _id = 0;
function bx(weight, over = {}) {
    ++_id;
    return { id: _id, name: `B${_id}`, club: `Club${_id}`, gender: 'male',
             yob: 2000, fit: true, weight, experience: 0, ...over };
}

const TOL = 2.0;

// --- constraints hold across many random runs ------------------------------

test('randomSelect: every match within tolerance, no rematch, caps respected', () => {
    for (let run = 0; run < 200; run++) {
        const boxers = [bx(60), bx(60.5), bx(61), bx(61.5), bx(70), bx(70.5), bx(71)];
        const { matches } = pairBoxersRandom(boxers, 'Cat', TOL);
        const seen = new Set();
        for (const m of matches) {
            assert.ok(Math.abs(m.red.weight - m.blue.weight) <= TOL + 1e-9,
                `match out of tolerance: ${m.red.weight} vs ${m.blue.weight}`);
            // no boxer appears twice (all caps default to 1), no rematch
            assert.ok(!seen.has(m.red.id), 'red already used');
            assert.ok(!seen.has(m.blue.id), 'blue already used');
            seen.add(m.red.id); seen.add(m.blue.id);
        }
    }
});

test('randomSelect: actually varies who fights whom across runs', () => {
    // 60/61/62 are all mutually within ±2 → 60's opponent should not be constant.
    const opponentsOf60 = new Set();
    for (let run = 0; run < 100; run++) {
        const boxers = [bx(60), bx(61), bx(62)];
        const { matches } = pairBoxersRandom(boxers, 'Cat', TOL);
        const m = matches.find(x => x.red.weight === 60 || x.blue.weight === 60);
        const other = m.red.weight === 60 ? m.blue.weight : m.red.weight;
        opponentsOf60.add(other);
    }
    assert.ok(opponentsOf60.size > 1, 'Random Select never varied 60\'s opponent');
});

// --- club avoidance stays the top priority ---------------------------------

test('randomSelect: different-club opponent always chosen over same-club', () => {
    // current=60 (ClubA). Two in-tolerance opponents: 61 same club, 62 different.
    // Different-club must ALWAYS win regardless of randomness/weight.
    for (let run = 0; run < 300; run++) {
        const a = bx(60, { club: 'A' });
        const sameClub = bx(61, { club: 'A' });
        const diffClub = bx(62, { club: 'B' });
        const { matches } = pairBoxersRandom([a, sameClub, diffClub], 'Cat', TOL);
        const m = matches.find(x => x.red.id === a.id || x.blue.id === a.id);
        assert.ok(m, 'anchor was matched');
        const other = m.red.id === a.id ? m.blue : m.red;
        assert.equal(other.id, diffClub.id, 'same-club chosen despite a different-club option');
    }
});

// --- cross-day freshness is preferred (soft, below club) -------------------

test('randomSelect: prefers a fresh opponent over a prior-day repeat', () => {
    // 60 (ClubA). Two different-club opponents 61 (ClubB) and 62 (ClubC).
    // Mark 60-vs-61 as a prior-day pair → 62 (fresh) should always be chosen.
    for (let run = 0; run < 300; run++) {
        const a = bx(60, { club: 'A' });
        const repeat = bx(61, { club: 'B' });
        const fresh  = bx(62, { club: 'C' });
        const priorPairs = new Set([pairKey(a, repeat)]);
        const { matches } = pairBoxersRandom([a, repeat, fresh], 'Cat', TOL, undefined, undefined, priorPairs);
        const m = matches.find(x => x.red.id === a.id || x.blue.id === a.id);
        const other = m.red.id === a.id ? m.blue : m.red;
        assert.equal(other.id, fresh.id, 'prior-day repeat chosen over a fresh alternative');
    }
});

test('randomSelect: a repeat still beats leaving someone unmatched', () => {
    // Only one in-tolerance opponent, and it is a prior-day repeat → still pair.
    const a = bx(60, { club: 'A' });
    const repeat = bx(61, { club: 'B' });
    const priorPairs = new Set([pairKey(a, repeat)]);
    const { matches, unmatched } = pairBoxersRandom([a, repeat], 'Cat', TOL, undefined, undefined, priorPairs);
    assert.equal(matches.length, 1, 'the only possible pair was formed despite being a repeat');
    assert.equal(unmatched.length, 0, 'nobody left unmatched when a repeat pairing was available');
});

// --- freshness never overrides club ----------------------------------------

test('randomSelect: different-club repeat beats same-club fresh', () => {
    // 60 (ClubA). Opponents: 61 same-club & fresh, 62 different-club but a repeat.
    // Club dominates freshness → 62 must always be chosen.
    for (let run = 0; run < 300; run++) {
        const a = bx(60, { club: 'A' });
        const sameClubFresh = bx(61, { club: 'A' });
        const diffClubRepeat = bx(62, { club: 'B' });
        const priorPairs = new Set([pairKey(a, diffClubRepeat)]);
        const { matches } = pairBoxersRandom([a, sameClubFresh, diffClubRepeat], 'Cat', TOL, undefined, undefined, priorPairs);
        const m = matches.find(x => x.red.id === a.id || x.blue.id === a.id);
        const other = m.red.id === a.id ? m.blue : m.red;
        assert.equal(other.id, diffClubRepeat.id, 'same-club fresh chosen over different-club repeat');
    }
});

// --- greedy path is untouched ----------------------------------------------

test('randomSelect: pairAll greedy/optimal output unaffected by the new branch', () => {
    const mkBuckets = () => ({ Cat: [bx(70), bx(70.5), bx(80), bx(80.5)] });
    const g1 = pairAll(mkBuckets(), { algorithm: 'greedy' });
    const g2 = pairAll(mkBuckets(), { algorithm: 'greedy' });
    const key = r => r.matches.map(m => [m.red.weight, m.blue.weight].sort((a,b)=>a-b).join('-')).sort();
    assert.deepEqual(key(g1), key(g2), 'greedy is still deterministic');
});
