// Copyright (c) 2026 ITLR Assets. All rights reserved.
// Attribute map core — pure layout + physics for the SparManager "Map" view (UMD-lite,
// like spar-assist.js). No DOM here: SparManager owns the canvas, events and drawing.
//
// Model: attribute values are gravity hubs. Every boxer node gets an anchor — its
// primary hub, or a sub-hub when a second attribute is chosen — and a spring sim pulls
// nodes to their anchors while short-range repulsion stops them stacking.
(function (global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.SparMap = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Band labels sort by their first number ("0–5" < "6–15" < "31+"), else alphabetically.
  function bandSort(a, b) {
    const na = parseFloat(a), nb = parseFloat(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function groupBy(nodes, fn) {
    const m = new Map();
    for (const n of nodes) {
      const k = fn(n);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(n);
    }
    return new Map([...m.entries()].sort((a, b) => bandSort(a[0], b[0])));
  }

  // Build hub positions + per-node anchors for a w×h canvas.
  // primary/secondary are functions boxer -> band label (secondary may be null).
  // Returns { hubs: [{label, x, y, count, sub}], anchors: Map<node, {x,y}> }.
  function layout(nodes, primary, secondary, w, h) {
    const cx = w / 2, cy = h / 2;
    const groups = groupBy(nodes, primary);
    const k = groups.size;
    const hubs = [], anchors = new Map();
    let i = 0;
    for (const [label, members] of groups) {
      // k hubs on an ellipse, starting at the left so two hubs sit side by side
      const ang = Math.PI + (i * 2 * Math.PI) / k;
      const hx = k === 1 ? cx : cx + Math.cos(ang) * w * 0.34;
      const hy = k === 1 ? cy : cy + Math.sin(ang) * h * 0.34;
      const hub = { label, x: hx, y: hy, count: members.length, sub: false };
      hubs.push(hub);
      if (secondary) {
        const subs = groupBy(members, secondary);
        const r2 = Math.min(w, h) * 0.24;   // sub-hub orbit radius (bigger = more spread)
        let j = 0;
        for (const [subLabel, subMembers] of subs) {
          const sang = -Math.PI / 2 + (j * 2 * Math.PI) / subs.size;
          const sx = subs.size === 1 ? hx : hx + Math.cos(sang) * r2;
          const sy = subs.size === 1 ? hy : hy + Math.sin(sang) * r2;
          hubs.push({ label: subLabel, x: sx, y: sy, count: subMembers.length, sub: true });
          for (const n of subMembers) anchors.set(n, { x: sx, y: sy });
          j++;
        }
      } else {
        for (const n of members) anchors.set(n, { x: hx, y: hy });
      }
      i++;
    }
    return { hubs, anchors };
  }

  // One physics tick. Nodes need x,y,vx,vy; a node with .pinned (being dragged) is left
  // alone. ponytail: O(n²) repulsion — fine for a 100-boxer floor, grid it if ever slow.
  function simStep(nodes, anchors, { pull = 0.02, repel = 46, damp = 0.85 } = {}) {
    for (const n of nodes) {
      if (n.pinned) continue;
      const a = anchors.get(n);
      if (a) { n.vx += (a.x - n.x) * pull; n.vy += (a.y - n.y) * pull; }
      for (const o of nodes) {
        if (o === n) continue;
        const dx = n.x - o.x, dy = n.y - o.y;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < repel) { const f = ((repel - d) / d) * 0.06; n.vx += dx * f; n.vy += dy * f; }
      }
      n.vx *= damp; n.vy *= damp;
      n.x += n.vx; n.y += n.vy;
    }
  }

  // Cool→hot fill by weight (30kg blue → 100kg red), for drawing.
  function weightHue(w) {
    const t = Math.max(0, Math.min(1, ((w || 60) - 30) / 70));
    return 210 - t * 210;
  }

  // Resolve a press→release gesture into a selection action. Pure so it can be tested
  // without a DOM. `down`/`up` are {x,y} screen points; hitId is the node under the
  // release (or null); selectedId is the current selection.
  //   moved beyond slop      -> 'drag'  (caller moved a node / panned; selection unchanged)
  //   released on empty space -> 'clear'
  //   released on the selected node -> 'clear' (toggle off)
  //   released on another node -> 'select' (switch straight to it)
  function tapResult(down, up, hitId, selectedId, slop = 4) {
    if (down && up && Math.hypot(up.x - down.x, up.y - down.y) > slop) return { action: 'drag', selectedId };
    if (hitId == null) return { action: 'clear', selectedId: null };
    if (hitId === selectedId) return { action: 'clear', selectedId: null };
    return { action: 'select', selectedId: hitId };
  }

  return { layout, simStep, groupBy, weightHue, tapResult };
});
