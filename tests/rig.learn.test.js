'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildModel, pairKey } = require('../rig/learn');
const SparAssist = require('../spar-assist');

// Write a throwaway Spars tree: { date: { matches, editLog } } -> a temp baseDir.
function fixture(days) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-learn-'));
  for (const [date, spars] of Object.entries(days)) {
    fs.mkdirSync(path.join(base, date), { recursive: true });
    fs.writeFileSync(path.join(base, date, 'Spars.json'), JSON.stringify(spars));
  }
  return base;
}

test('buildModel: flagTolerance = share of manual pairings that overrode each flag', () => {
  const base = fixture({
    '2026-01-01': {
      matches: [],
      editLog: [
        { action: 'pair-added', flags: { sameClub: true,  crossCategory: false, crossGender: false, overWeightRule: false, minorAdult: false } },
        { action: 'pair-added', flags: { sameClub: true,  crossCategory: true,  crossGender: false, overWeightRule: false, minorAdult: false } },
        { action: 'note' }, // not a pairing — ignored
      ],
    },
  });
  const m = buildModel({ baseDir: base });
  assert.strictEqual(m.manualPairings, 2);
  assert.strictEqual(m.flagTolerance.sameClub, 1.0, 'coach paired same-club both times');
  assert.strictEqual(m.flagTolerance.crossCategory, 0.5);
  assert.strictEqual(m.flagTolerance.crossGender, 0);
  assert.ok(!('minorAdult' in m.flagTolerance), 'safety flag is never learned');
});

test('buildModel: affinity counts pairings and consent from board + requested marks', () => {
  const base = fixture({
    '2026-01-01': {
      matches: [
        { red: { name: 'A' }, blue: { name: 'B' }, consent: true },
        { red: { name: 'C' }, blue: { name: 'D' } },
      ],
      editLog: [ { action: 'mark-requested', members: ['C', 'D'] } ],
    },
    '2026-01-02': {
      matches: [ { red: { name: 'A' }, blue: { name: 'B' } } ],
      editLog: [],
    },
  });
  const m = buildModel({ baseDir: base });
  assert.deepStrictEqual(m.affinity[pairKey('A', 'B')], { paired: 2, consented: 1 });
  assert.deepStrictEqual(m.affinity[pairKey('C', 'D')], { paired: 1, consented: 1 }, 'requested mark adds consent');
});

test('buildModel: `before` excludes that day and later (no backtest leakage)', () => {
  const base = fixture({
    '2026-01-01': { matches: [{ red: { name: 'A' }, blue: { name: 'B' } }], editLog: [] },
    '2026-01-05': { matches: [{ red: { name: 'X' }, blue: { name: 'Y' } }], editLog: [] },
  });
  const m = buildModel({ baseDir: base, before: '2026-01-05' });
  assert.strictEqual(m.days, 1);
  assert.ok(m.affinity[pairKey('A', 'B')]);
  assert.ok(!m.affinity[pairKey('X', 'Y')], 'future day not learned');
});

test('score: a learned model softens an overridden flag but never minorAdult', () => {
  const flagsSameClub = { weightGap: 0, sameClub: true };
  const base = SparAssist.score(flagsSameClub);                       // +3 club penalty
  const learned = { flagTolerance: { sameClub: 1.0 }, affinity: {} };
  const soft = SparAssist.score(flagsSameClub, { learned });
  assert.ok(soft < base, 'same-club penalty relaxed');
  assert.ok(soft > 0, 'never fully zeroed (30% floor)');

  const minor = { weightGap: 0, minorAdult: true };
  const learnedMinor = { flagTolerance: { minorAdult: 1.0 }, affinity: {} }; // must be ignored
  assert.strictEqual(SparAssist.score(minor, { learned: learnedMinor }), SparAssist.score(minor),
    'minorAdult penalty is never softened');
});

test('rankCandidates: a consented history pulls a familiar partner up the list', () => {
  const boxer = { name: 'A', weight: 60, club: 'X' };
  const pool = [
    { name: 'B', weight: 60, club: 'X' }, // identical weight — ties on weight with C
    { name: 'C', weight: 60, club: 'X' },
  ];
  const learned = { flagTolerance: {}, affinity: { [pairKey('A', 'C')]: { paired: 3, consented: 3 } } };
  const ranked = SparAssist.rankCandidates(boxer, pool, { learned });
  assert.strictEqual(ranked[0].boxer.name, 'C', 'consented familiar pair ranks first');
});
