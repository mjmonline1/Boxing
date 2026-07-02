# Boxing Tournament — Business Rules Spec

> Source of truth for classification, matching, and scheduling rules.
> Validate code and tests against this file.

---

## Boxer Data Schema

```
id, name, club, gender, yob, fit, weight, experience
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | unique identifier |
| `name` | string | |
| `club` | string | used for club-avoidance in pairing |
| `gender` | `Male` / `Female` | |
| `yob` | integer | year of birth — used to derive age group |
| `fit` | `yes` / `no` | `no` → excluded from all matching |
| `weight` | float (kg) | |
| `experience` | integer | number of bouts |

---

## Bucket Classification (2026 — client confirmed)

Boxers are placed into buckets before pairing. All pairing is within-bucket only.

### Age Groups

| Group | Year of Birth |
|---|---|
| Schools | 2012, 2013, 2014 |
| Juniors | 2010, 2011 |
| Youths | 2008, 2009 |
| Seniors | 2007 and older |

### Experience Tiers (within each age group)

| Tier | Bouts |
|---|---|
| Novice | 0–5 |
| Experienced | 6–10 |
| Open Class | 11+ |

4 age groups × 3 experience tiers = **12 buckets**.

### Female boxers

Single flat `FitFemales` bucket — no age or experience subdivision. (May be expanded in future.)

### Excluded

`NotFit` bucket — boxers with `fit=no`. Skipped by all downstream steps.

---

## Pairing Rules

**All pairing is within-bucket only.** Boxers from different buckets never fight each other. The bucket definition guarantees all boxers within it are eligible opponents.

---

## Spar Matching (SparMaker)

Matching runs in three phases, all within-bucket only.

| Phase | Rule |
|---|---|
| 1 | Pair within ±2.0 kg |
| 2 | Re-attempt unmatched from Phase 1 within ±2.5 kg |
| 3 | Unmatched boxers join an existing 1v1 pair (same bucket, ±2.0 kg) → 3-person round-robin group |

- Boxers sorted by weight (lightest first) before each phase
- Same-club pairs avoided where possible

---

## Ring Allocation (RingAssigner)

- 5 rings: R1–R5
- R5 eligibility: all boxers female **or** male Schools/Junior . Youth and Senior males cannot use R5.
- Bout duration: Senior male = 3 × 3 min; all others = 3 × 2 min
- Match ordering by day parity (heaviest first on odd days, lightest first on even days)
