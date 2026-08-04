// Browser smoke test for the Attribute Map. NOT part of `npm test` (needs a live server).
// Run manually:  node Server.js   then   node tests/map.smoke.js
// Drives real clicks in headless Chrome and asserts select / switch / pair-keeps-nodes-in-view.
const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SHOT = 'C:\\Users\\MICHAE~1.MAR\\AppData\\Local\\Temp\\claude\\C--Code-javascript-Boxing\\7e72f3a6-854a-4205-9b9e-199aee056bb0\\scratchpad\\';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--window-size=1600,1000'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));

  await page.goto('http://localhost:6502/SparManager.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#dateSelect option', { timeout: 20000 });
  await sleep(800);
  // pick a date that has data
  await page.select('#dateSelect', '2026-07-08').catch(() => {});
  await sleep(1800);
  const poolCount = await page.$$eval('#unmatched-list > *', els => els.length).catch(() => 0);
  console.log('POOL tiles:', poolCount);

  await page.click('#mapBtn');
  await sleep(300);
  const overlayShown = await page.$eval('#mapOverlay', el => getComputedStyle(el).display !== 'none');
  console.log('overlay shown:', overlayShown);

  // wait for the sim to settle
  for (let i = 0; i < 40; i++) { const s = await page.evaluate(() => window.__map()); if (s.frozen) break; await sleep(100); }
  let st = await page.evaluate(() => window.__map());
  console.log('nodes:', st.nodes.length, 'frozen:', st.frozen, 'cam scale:', st.cam.scale.toFixed(3));

  const canvasBox = await page.$eval('#mapCanvas', el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const toScreen = n => ({ x: canvasBox.x + n.x * st.cam.scale + st.cam.x, y: canvasBox.y + n.y * st.cam.scale + st.cam.y });
  const inView = n => { const p = toScreen(n); return p.x >= canvasBox.x && p.x <= canvasBox.x + canvasBox.w && p.y >= canvasBox.y && p.y <= canvasBox.y + canvasBox.h; };
  console.log('nodes in view (initial):', st.nodes.filter(inView).length, '/', st.nodes.length);
  await page.screenshot({ path: SHOT + 'map-1-open.png' });

  // click the node nearest the canvas centre that is in view
  const cxw = (canvasBox.w / 2 - st.cam.x) / st.cam.scale, cyw = (canvasBox.h / 2 - st.cam.y) / st.cam.scale;
  const pickable = st.nodes.filter(inView).sort((a, b) => Math.hypot(a.x - cxw, a.y - cyw) - Math.hypot(b.x - cxw, b.y - cyw));
  const A = pickable[0];
  const pa = toScreen(A);
  // click OFF-CENTRE (+11px) to prove the hit target is forgiving, not centre-only
  await page.mouse.click(pa.x + 11, pa.y + 8);
  await sleep(300);
  st = await page.evaluate(() => window.__map());
  const sideA = await page.$eval('#mapSide', el => el.innerText.slice(0, 60));
  console.log(`off-centre click near A=${A.name}(#${A.id}) -> sel=${st.sel} (${st.sel === A.id ? 'HIT' : 'MISS'}) side="${sideA.replace(/\n/g, ' ')}"`);
  await page.screenshot({ path: SHOT + 'map-2-clickA.png' });

  // click a different node B -> selection should switch
  const B = pickable.find(n => n.id !== A.id && Math.hypot(n.x - A.x, n.y - A.y) > 40) || pickable[1];
  const pb = toScreen(B);
  await page.mouse.click(pb.x, pb.y);
  await sleep(300);
  st = await page.evaluate(() => window.__map());
  console.log(`clicked B=${B.name}(#${B.id}) -> sel=${st.sel} (switch ${st.sel === B.id ? 'OK' : 'FAIL'})`);
  await page.screenshot({ path: SHOT + 'map-3-clickB.png' });

  // --- unmatched-only + pair flow ---
  await page.click('#mapPoolOnly');
  await sleep(200);
  for (let i = 0; i < 30; i++) { const s = await page.evaluate(() => window.__map()); if (s.frozen) break; await sleep(100); }
  st = await page.evaluate(() => window.__map());
  const before = st.nodes.length;
  console.log('poolOnly nodes:', before);

  // recompute view mapping (cam changed after relayout/fit)
  const map2 = st;
  const toScreen2 = n => ({ x: canvasBox.x + n.x * map2.cam.scale + map2.cam.x, y: canvasBox.y + n.y * map2.cam.scale + map2.cam.y });
  const cxw2 = (canvasBox.w / 2 - map2.cam.x) / map2.cam.scale, cyw2 = (canvasBox.h / 2 - map2.cam.y) / map2.cam.scale;
  const inView2 = n => { const p = toScreen2(n); return p.x >= canvasBox.x && p.x <= canvasBox.x + canvasBox.w && p.y >= canvasBox.y && p.y <= canvasBox.y + canvasBox.h; };
  if (before === 0) { console.log('NO UNMATCHED on this date — cannot test pair flow'); console.log('CONSOLE ERRORS:', errs.length ? errs.slice(0,5) : 'none'); await browser.close(); return; }
  const C = map2.nodes.filter(inView2).sort((a, b) => Math.hypot(a.x - cxw2, a.y - cyw2) - Math.hypot(b.x - cxw2, b.y - cyw2))[0];
  const pc = toScreen2(C);
  await page.mouse.click(pc.x, pc.y);
  await sleep(300);
  const pairBtns = await page.$$('#mapSide .assist-pair-btn');
  console.log(`clicked C=${C.name} -> pair buttons in side panel: ${pairBtns.length}`);
  if (pairBtns.length) {
    await pairBtns[0].click();
    await sleep(500);
    for (let i = 0; i < 30; i++) { const s = await page.evaluate(() => window.__map()); if (s.frozen) break; await sleep(100); }
    const after = await page.evaluate(() => window.__map());
    const cam3 = after.cam;
    const inView3 = n => { const x = canvasBox.x + n.x * cam3.scale + cam3.x, y = canvasBox.y + n.y * cam3.scale + cam3.y; return x >= canvasBox.x && x <= canvasBox.x + canvasBox.w && y >= canvasBox.y && y <= canvasBox.y + canvasBox.h; };
    console.log(`after PAIR: nodes ${before} -> ${after.nodes.length}, in-view ${after.nodes.filter(inView3).length}/${after.nodes.length}, sel=${after.sel}`);
    await page.screenshot({ path: SHOT + 'map-4-afterpair.png' });
  } else {
    console.log('NO PAIR BUTTON — cannot test pair flow');
  }

  // --- scatter view ---
  await page.click('.map-view-btn[data-view="scatter"]');
  await sleep(400);
  let sc = await page.evaluate(() => window.__map());
  const withXY = sc.nodes.filter(n => n.sx != null);
  console.log(`SCATTER: view=${sc.view}, nodes with screen coords=${withXY.length}/${sc.nodes.length}`);
  await page.screenshot({ path: SHOT + 'scatter-1.png' });
  // click a dot (off-centre) → should select
  if (withXY.length) {
    const D = withXY[Math.floor(withXY.length / 2)];
    await page.mouse.click(canvasBox.x + D.sx + 9, canvasBox.y + D.sy + 7);
    await sleep(300);
    sc = await page.evaluate(() => window.__map());
    const sideD = await page.$eval('#mapSide', el => el.innerText.slice(0, 50));
    console.log(`scatter off-centre click D=${D.name}(#${D.id}) -> sel=${sc.sel} (${sc.sel === D.id ? 'HIT' : 'MISS'})`);
    await page.screenshot({ path: SHOT + 'scatter-2-selected.png' });
  }

  console.log('CONSOLE ERRORS:', errs.length ? errs.slice(0, 5) : 'none');
  await browser.close();
})().catch(e => { console.error('SCRIPT FAIL', e); process.exit(1); });
