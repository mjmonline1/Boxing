# Matching Optimality & Round-Robin Spread — Design Note

> **STATUS: DO NOT IMPLEMENT unless explicitly instructed.**
> This documents two *known, linked limitations* and the options for fixing them.
> The current code is intentional and correct for the production roster. No change
> should be made to the matcher or group-join tolerance on the basis of this note
> alone — only on an explicit, specific instruction from the maintainer.

## Scope

Two parked issues in `SparMaker.pairAll` (the 3-phase pairing algorithm). They are
two ends of the **same tradeoff knob**, so they are documented together.

- **(A) Greedy strands a pairable boxer** — the matcher is locally maximal but not
  globally optimal.
- **(B) Round-robin trio internal weight spread** — a 3-person group can contain an
  internal bout above tolerance.

Neither affects the real 2026 roster (137 boxers): **0 strandings, and group spread
only occurs in contrived clusters.** They surface in tight, adversarial weight bands.

## Current behaviour (what ships today)

Three phases, all **within a single bucket** (gender + age + experience):

1. **Phase 1** — greedy 1v1 pairing at **±2.0 kg** (`WEIGHT_TOLERANCE`).
2. **Phase 2** — greedy 1v1 pairing of phase-1 leftovers at **±2.5 kg** (`PHASE2_TOLERANCE`).
3. **Phase 3b** — fold each still-unmatched boxer into an existing 1v1 pair to make a
   round-robin trio, requiring the joiner be within **±2.0 kg** of *one* pair member.

"Greedy" = boxers are processed lightest-first; each commits to its best available
opponent immediately and the choice is never revisited.

## (A) Greedy strands a pairable boxer

### Symptom
A boxer whose *only* in-tolerance partner sits in the **(2.0, 2.5] kg** band can end up
with no spar, even though a different overall pairing would have given everyone one.

### Worked example (repro: fuzz seed 255, Female bucket)
Four boxers: `63.5, 65.7, 67.4, 67.4`.

| Step | Action | Result |
|---|---|---|
| Phase 1 (±2.0) | `65.7` ↔ `67.4` (1.7 apart) paired | `65.7` consumed |
| Phase 2 (±2.5) | `63.5`'s only neighbour `65.7` is gone; next is `67.4` at 3.9 | `63.5` unmatched |
| Phase 3b (±2.0) | `63.5` → `65.7` = **2.2** (>2.0, rejected); → `67.4` = 3.9 | `63.5` **stranded** |

**Achievable instead:** `63.5↔65.7` (2.2) + `67.4↔67.4` (0.0) → everyone spars.
Greedy simply committed `65.7` to the wrong partner first.

### Why phase-3b doesn't rescue her
The group-join tolerance is the tight **±2.0**, and her nearest boxer is **2.2** away —
she misses the rescue by 0.2 kg. (See (B) for why that tolerance is tight.)

## (B) Round-robin trio internal weight spread

### Symptom
Phase-3b folds a third onto a pair when the third is within ±2.0 of **one** member.
A trio = everyone fights everyone, so the third also fights the *far* member — which can
exceed tolerance.

### Worked example
Pair `70.0` + `72.0` (a legal ±2.0 phase-1 pair). Third `73.9` joins on its 1.9 kg gap
to `72.0`. But the trio now contains **`70.0` vs `73.9` = 3.9 kg** — an over-tolerance bout.

(SPEC wording says the join is "±2.0 kg to the pair"; the code enforces proximity to the
*nearer* member only.)

## The linked tradeoff

The phase-3b join tolerance is the shared knob:

| Change | Helps | Hurts |
|---|---|---|
| **Loosen phase-3b join to ±2.5** | Rescues strandees like 63.5 (A) | Wider trios — worsens (B) |
| **Tighten phase-3b / require ±tol to BOTH members** | Removes over-spread trios (B) | Forms fewer trios → more unmatched (A worse) |

You cannot improve one by adjusting this knob without worsening the other. The only way
to fix **both** is to stop pairing greedily.

## Options

### Option 0 — Do nothing (current, recommended default)
Zero real-roster impact. Behaviour is byte-identical and well-tested. Keep until a real
roster demonstrably strands a boxer or ships an over-spread trio.

### Option 1 — Maximum-weight matching (proper fix for both)
Replace the 3-phase greedy with optimal matching per bucket (e.g. blossom / Hungarian on
a graph where edges are in-tolerance pairs weighted by closeness), then a separate
optimal trio-assignment for the genuine odd-one-out.

- **Pros:** globally optimal — maximises boxers sparring; lets trio rules be enforced
  cleanly (e.g. only form a trio when all three pairwise gaps are in tolerance).
- **Cons:** large change; new dependency or a non-trivial hand-rolled matcher; **breaks
  the byte-identical baseline** (the regression guard that proves refactors are safe);
  needs its own extensive test corpus.

### Option 2 — Targeted "scarce partner" heuristic (cheaper, partial)
Keep greedy but, in phase 1, when a boxer has several equally-good opponents, prefer the
opponent who has *other* options — leaving a boxer whose only partner is scarce its match.
Addresses (A) in common cases; does **not** fix (B); still not globally optimal; adds
lookahead complexity to a currently simple loop.

## If/when implementing

Do not start without an explicit instruction naming which option. Whatever is chosen:

- Treat the **byte-identical real-roster baseline** as the headline risk. Capture the
  current `Spars.json` first; any diff must be justified as a *rescued* boxer or a
  *tightened* trio, never a silent regression.
- The permanent invariants already added to `tests/realistic.streak.test.js`
  (`assertInvariants`: no-rematch, 1v1-cap, **local maximality**) must stay green. A
  global-optimality fix should additionally assert *global* maximality (max boxers matched)
  on the seed-255 class of cases.
- Cross-check `SPEC.md` wording on the trio join rule and reconcile code vs spec as part
  of the change.

## Related

- `Boxing.md` — "Tenth hunt" (A) and the "Round-robin group internal spread" note (B).
- `docs/superpowers/specs/2026-05-24-round-robin-group-design.md` — original trio design.
- `SparMaker.js` — `pairAll` phases 1/2/3b; `WEIGHT_TOLERANCE`, `PHASE2_TOLERANCE`.
