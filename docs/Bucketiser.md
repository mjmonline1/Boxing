# Bucketiser — Documentation & Reference

## Purpose

Classifies every fighter into exactly one bucket via a fixed decision tree
(**gender → age-by-YOB → experience-by-bouts**). The bucket file it produces is the input for
`SparMaker.js` (auto-pairing). This is the single source of truth for fighter classification —
run it whenever the roster changes.

```bash
node PutAllFightersinBuckets.js         # standalone
# or via the app: buckets-regen.js regenerateBuckets() (Server.js / MCP)
```

---

## I/O

| | Path |
|---|---|
| **Input** | `data/Registered Boxer2026.csv` (roster — the source of truth for membership) |
| **Output** | `output/Buckets/tsc-2026-buckets.json` (+ per-bucket CSVs in `output/Buckets/`) |

Output shape: `{ summary, finalBuckets }`, where `finalBuckets` maps each **bucket key** to a
list of boxer objects (`id, name, club, gender, yob, fit, weight, experience, autoMatch,
sparsPerDay, dob`).

---

## Classification rules

Order of decisions:

1. **Unfit short-circuit** — `fit=no` → `Notfit` (regardless of age/gender/experience).
2. **Female** — any fit female → single `Female` bucket. **No age or experience subdivision.**
3. **Male** — `Male<AgeGroup>_<ExperienceTier>`.

### Age groups — by **YOB** (`constants.js` `AGE_GROUPS`, 2026 classifications)

| Group | YOB |
|---|---|
| Schools | 2012–2014 |
| Junior | 2010–2011 |
| Youth | 2008–2009 |
| Senior | ≤ 2007 |

Matching uses the integer `yob`, not the full `dob` (the `dob` string rides along for reporting
only).

### Experience tiers — by **bouts** (`constants.js` `EXPERIENCE_TIERS`)

| Tier | Bouts |
|---|---|
| Novice | 0–5 |
| Experienced | 6–10 |
| OpenClass | 11+ |

### Bucket keys

`Notfit`, `Female`, and `Male{Schools|Junior|Youth|Senior}_{Novice|Experienced|OpenClass}`.

---

## ⚠ The registration `category` field is IGNORED

The bucketiser **never reads** a fighter's `category` field. A grep for `category` across the
three routine files (`PutAllFightersinBuckets.js`, `hierarchical-filter.js`, `buckets-regen.js`)
returns nothing. Classification is derived purely from `gender` / `yob` / `experience`, so a
stale, plural, or plain-wrong `category` label **cannot** affect bucketing.

`category` is cosmetic — it appears only in the Fighters report and the BoxerManager detail form.

**Worked example:** `#70 Ramsay Lumgair`, yob 2007, stored `category="Youths"` — the bucketiser
still correctly placed him in `MaleSenior_Novice` (yob ≤ 2007 = Senior). Of a 105-fighter roster,
only #70 had a genuine age-group mismatch; ~90 others differed from the canonical label only by
plural/casing (`Juniors` vs `Junior`). None of it affects matching.

> Design intent (`buckets-regen.js`): *"a stale or prefilled category can never override the
> rules"* — the classifier is the single source of truth, and every rebuild re-classifies from
> scratch (no prior/manual placements preserved).

---

## Files

| File | Role |
|---|---|
| `PutAllFightersinBuckets.js` | `runTSCBuckets(cleanCsvPath)` — builds the decision tree (age-group nodes + `makeExperienceBuckets`, Female node), runs it, writes `tsc-2026-buckets.json` + per-bucket CSVs (relative to CWD). |
| `hierarchical-filter.js` | Reusable decision-tree engine used by the bucket script. |
| `buckets-regen.js` | `regenerateBuckets()` — app-facing single-source-of-truth wrapper (called by `Server.js`/MCP). Reads the roster, round-trips a clean `id,name,club,gender,yob,fit,weight,experience` schema through `runTSCBuckets`, then re-attaches `autoMatch`/`sparsPerDay`/`dob` (dropped by the clean-schema round-trip). |
| `constants.js` | `AGE_GROUPS`, `EXPERIENCE_TIERS`, `SENIOR_YOB_MAX`, `R5_ELIGIBLE_YOB_MIN` — shared by Node scripts and the browser tools. |

---

## Notes / gotchas

- `BoxerManager.html` `deriveCategory(yob)` (the fighter-detail form's DOB→category auto-fill) uses
  `currentYear - yob` age bands. These coincide with `AGE_GROUPS` for **2026** but will **drift**
  in later years. It only affects the cosmetic display label, never the bucketiser.
- The roster CSV is authoritative for **membership**; `buckets-regen.js` always covers the live
  roster and never uses stale/positional data.
