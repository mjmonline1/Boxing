# Attribute Map + Scatter — Review

**Version:** 1.3.73 · **Branch:** random-select · **Status:** built, browser-verified, **NOT committed**

Origin: the "graph proposal" from the shared chat *Clustering nodes by attributes in graph theory*
(claude.ai/share/1a8dd9ad-…). Logic layer was already built (rig assistant); this adds the missing
**visual layer**.

---

## What shipped

A **Map** button in the SparManager toolbar opens a full-screen overlay with two views (toggle in
header): **Graph** and **Scatter**. Both share one canvas, selection, side panel, and pair path.
Nothing auto-pairs — rules stay advisory, minor↔adult still forces a confirm.

### Graph view
Boxer nodes gravitate around **attribute hubs** (Gender → age/experience/weight sub-hubs).
- Click a boxer → **hunt**: green (tight) / amber (stretch) match lines to viable partners only;
  non-candidates fade back. Side panel ranks the field.
- Camera: **scroll = zoom to cursor · drag empty = pan · Fit button · drag a boxer = inspect** (springs back).
- Layout **freezes once settled** so nodes stay still and clickable.
- Labels declutter: dots-only until you zoom in (>0.7) or select.
- `×N` gold badge = spars that boxer already has today (no badge = still needs one).
- Red dashed minor↔adult edges **removed** (clutter) — safety chip stays in the side panel + pair confirm.

### Scatter view  ← the new part
**weight (x) × bouts (y)**, with the dashed **auto-match zone box** around the selected boxer:
**±2 kg × their experience tier** (Novice 0-5 / Experienced 6-10 / OpenClass 11+, from `constants.js`).
- **Inside box** = green (auto-matcher would've accepted).
- **Just outside** = amber (the judgement calls — near-misses).
- **Far** = muted grey. **Already-matched** = hollow ring. **Free** = filled.
- Click a leftover → box redraws around it → pick a candidate in the side panel → **Pair**.
- Click-select only (fixed axes, no pan/zoom/drag).

---

## How to use the scatter (leftover workflow)

1. Map → **Scatter** → tick **unmatched only** (shows just the ~15 hard cases).
2. **Click a leftover.** Box = who the auto-matcher would have accepted.
3. **Look just outside the box** — those are your overrides. Axis tells you why:
   right = heavier, left = lighter, up = more bouts, below = greener, diagonal-far = skip.
4. Prefer dots hugging the box edge (smallest override).
5. Side panel → **Pair**. Hollow dots (already sparring) are still fair game — multi-spar/day.

Graph = explore the whole room. Scatter = resolve one stubborn leftover with tolerances drawn.

---

## Files

| File | Change |
|---|---|
| `SparManager.html` | Map button, overlay, Graph+Scatter, all interaction (biggest change) |
| `spar-map.js` | **new** — pure layout/physics + `tapResult` (click decision) |
| `constants.js` | now `<script>`-included in SparManager (was Node-only there) — gives scatter its tier bounds |
| `tests/sparMap.test.js` | **new** — 9 unit tests (layout, physics, tapResult) |
| `tests/map.smoke.js` | **new** — headless-Chrome browser test (needs live server; NOT in `npm test`) |
| `package.json` | version bumps 1.3.62 → 1.3.73; added devDep `puppeteer-core` |

Read-only debug hook `window.__map()` exposes node positions for the smoke test.

---

## How to run / test

```
node Server.js                 # serves on :6502 (per .env)
# browser: http://localhost:6502/SparManager.html  → Map
node --test tests/*.test.js    # unit tests (221/222 — see caveat)
node tests/map.smoke.js        # browser smoke test (server must be running); writes screenshots
```

---

## Verified (headless Chrome, date 2026-07-08, 16 unmatched)

- Graph: 65 nodes render/settle · click selects · click switches · off-centre click (~14px) hits ·
  pair keeps nodes in view (16→14, all 14 framed).
- Scatter: view switches · 14/14 plotted · off-centre click hits · box + tier label render.

## Not verified / caveats

- **1 pre-existing test failure**: `pipeline.e2e` expects 87 boxers, gets 89 — dirty `output/Buckets`
  CSVs from an earlier session. Fails identically with this work stashed. **Not caused by the map.**
- `npm test` also sweeps the nested `Boxing/` clone (extra spurious fails) — scope with `tests/*.test.js`.
- Benign 404 in browser console — pre-existing, unrelated (constants.js loads fine; box shows tier).
- On a fully-matched date, "unmatched only" is legitimately **empty** (not a bug).

## Open items / decisions for you

- **Scatter gender split** — cross-gender dots plot but aren't flagged on the plot (chip only in side
  panel). Filter gender out of scatter, or mark cross-gender dots? *(undecided)*
- Graph tuning — you said you'd come back to it.
- Still unbuilt from the chat: pool convex hulls, shortlist ☆.
- Intensity dial deliberately skipped (tournament tolerance is fixed, not gym-intensity).
- **Not committed** — all above is in the working tree.
