# Merge Plan: TimelineView.html → RingManager.html

## Context
`RingManager.html` (kanban list) and `TimelineView.html` (time-scaled grid) render the same schedule from the same source (`DataClient.get('schedule')` → `schedule_grouped.json`). The kanban view shows time only as text inside each card; the timeline view shows time as space (vertical position + block height) plus an 18:00 tea-time line. The timeline view is strictly more informative for the same screen real estate — but is currently read-only. Decision: replace the kanban layout in `RingManager.html` with the timeline layout, port the kanban drag/drop reordering onto the time-scaled blocks, then delete `TimelineView.html`.

## Files

| Action | Path | Why |
|---|---|---|
| Modify | `RingManager.html` | Swap kanban grid for timeline grid, keep DnD + Save/Export/Reset |
| Delete | `TimelineView.html` | Functionality absorbed by RingManager |
| Modify | `index.html` | Step 7 card (line 251) links to `TimelineView.html` — remove card or repoint to `RingManager.html` |
| Modify | `theme.css` | Cosmetic: rename `/* TimelineView */` block comment (line 237) to `RingManager`; `#ruler` styles stay |
| Modify | `SVG\index-data-flow.dot` | Remove `TimelineView` node + inbound edges |

## Implementation

### 1. Layout swap in RingManager.html

Replace current markup:
```
#board (flex)
  .ring × 5 (flex column, stacked .bout cards)
```
with the TimelineView grid:
```
#grid-wrap (flex, overflow: auto, height: calc(100vh - 90px))
  #ruler   (flex 0 0 54px, vertical time ticks)
  #rings   (flex 1, position: relative — hosts ring columns + tea-time line)
    .ring-col × 5 (position: relative, height = topPx(endMins) + 40)
      .ring-col-header  (sticky top — ring id + count + finish indicator)
      .hour-line × N
      .bout-block × N   (absolute, top = topPx(startMinutes), height = duration * PX_PER_MIN)
```

Copy from `TimelineView.html`:
- CSS blocks: `#grid-wrap`, `#ruler`, `.tick-label`, `.tick-line`, `#rings`, `.ring-col`, `.ring-col-header`, `.bout-block`, `.bb-*`, `#tea-line`, `#tea-label`, `.hour-line`
- JS constants: `PX_PER_MIN = 12`, `START_MINS = 15*60`, `TEA_TIME = 18*60`, `CHANGEOVER = 1`, `HEADER_PX = 52`, `GAP_PX = 10`
- Functions: `topPx()`, `buildRuler()`, and inline `buildGrid()` into `render(state)`
- Extend RingManager's `computeTimes()` to also set `bout.startMinutes` (TimelineView already does this; RingManager currently only sets `startTime` / `endMinutes` / `endTime`)

Legend (4 colour swatches) and toolbar (Home / Save / Reset / Export / Theme) stay unchanged.

### 2. Drag/drop on time-scaled blocks

State stays as `{R1: [...], R2: [...], R3: [...], R4: [...], R5: [...]}` — arrays in execution order. Order alone determines time (recomputed from cumulative `duration + CHANGEOVER`), so no Y-coordinate snapping required.

Per-block listeners (port from kanban):
- `dragstart` → `dragged = { bout, fromRing }`, add `.dragging`
- `dragend`   → clear
- `dragover`  → cursor Y vs block midpoint → set `dropTarget = { ringId, index: idx | idx+1 }`, mark `.drop-before` / `.drop-after`

Per-column listeners (port from kanban):
- `dragover`  → toggle `.drag-over` / `.drag-block` based on `canPlaceInR5(dragged.bout)` for R5; empty-area drop sets `dropTarget.index = state[ringId].length`
- `dragleave` → clear
- `drop`      → remove from `fromRing`, splice into `ringId` at `dropTarget.index`, call `computeTimes(state)` + `render(state)` + `updateStats(state)`

Drop-indicator styling needs one small tweak because blocks are absolute: keep `.drop-before { border-top: 3px solid #4caf50 }` / `.drop-after { border-bottom: 3px solid #4caf50 }` on `.bout-block`. If visually weak, swap to a single absolute-positioned `<div>` inserted in the ring column at the drop Y — but try the simpler border approach first.

R5 reject path unchanged: toast `⚠ ${name} (senior male) cannot be placed in R5` + early `return` in drop handler.

### 3. Save / Export / Reset
Unchanged — these read `state`, which has the same shape. Already correct in `RingManager.html`.

### 4. Tea-time line + stats overrun
Both already exist:
- Tea-time line: port from TimelineView (`#tea-line` + `#tea-label` at `topPx(TEA_TIME)`)
- Stats overrun: RingManager already has it (line 392) — keep

### 5. index.html cleanup
Read `index.html` Step 6 / Step 7 cards. If Step 6 already → RingManager.html, drop the Step 7 card entirely. Otherwise repoint Step 7 to `RingManager.html` with caption "View timeline / allocate rings".

### 6. SVG\index-data-flow.dot
Remove the `TimelineView` node. If `schedule_grouped.json → TimelineView` edge exists, delete it (RingManager already covers it).

## Reused functions / utilities

| Function | Location | Reuse note |
|---|---|---|
| `DataClient.get('schedule')` / `DataClient.save('schedule', payload)` | `data-client.js` | Schedule load + save unchanged |
| `scheduleToState(schedule)` | both files | Identical — keep RingManager's |
| `boutType(bout)` | both files | Identical — keep |
| `boutFormat(category)` | both files | Identical — keep |
| `fmtTime(mins)` | both files | Identical — keep |
| `canPlaceInR5(bout)` | RingManager only | Keep — R5 constraint |
| `computeTimes(state)` | both files | Use TimelineView's version (sets `startMinutes` too) |
| `topPx(mins)`, `buildRuler(endMins)` | TimelineView only | Port into RingManager |
| `POST /api/generate-schedule` fallback | RingManager only | Keep |

## Verification

1. `node Server.js`; open `http://localhost:3000/RingManager.html`
2. Left ruler shows ticks every 5 min, hour labels bold (15:00, 16:00, 17:00, 18:00 …)
3. Red dashed line + label `18:00 — Tea Time` spans all 5 columns
4. Each block: top = start, height = duration, content = names / category / weight diff / time / format
5. Drag R1 bout to R3 → block moves to R3 column, R1 + R3 times both recompute, drop indicator appeared on hover
6. Drag a senior-male bout over R5 → column flashes red border, drop rejected, toast shown
7. Reorder inside R2 → adjacent bout times shift correctly
8. **Reset** → restores auto allocation
9. **Save** → POST succeeds, toast `✓ Saved to server`
10. **Export** → downloads `spar_allocation_manual.json`
11. `Grep TimelineView` returns 0 matches across repo
12. `index.html` has no broken Step 7 link
13. Open `SVG\index-data-flow.dot` rendering (if used) → no orphan TimelineView node

## Risks / edge cases

- **Drop indicator on absolute blocks** — border markers may be subtle when blocks are short (8-min = 96 px). Fallback: insert a thin absolute `<div>` line at drop Y inside the ring column.
- **Short blocks (8 min × 12 px/min = 96 px)** — current kanban card content fits in ~110 px; the format line may need to be a single line (it already is). No truncation expected, but verify visually for Junior + Youth bouts.
- **Re-render on every drop** — `render(state)` rebuilds ruler + all blocks. With ≤ ~50 bouts total, cheap. No virtualisation needed.
- **Sticky ring-col-header inside scrolling `#grid-wrap`** — sticky already works in TimelineView; preserve `position: sticky; top: 0; z-index: 10` and ensure parent has no `overflow: hidden`.
- **Reset button** snapshots initial state once at boot — unchanged, works in new layout.
