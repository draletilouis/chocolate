// End-to-end browser check for the production system.
// Run with the dev server on http://127.0.0.1:3100:  node browser-check.cjs  (another address: set BASE_URL)
const { chromium } = require('@playwright/test');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100';
const SCREENSHOT_DIR = 'C:/Users/hp/Documents/Codex/2026-09-14/we/work/chocolate-checks';
const STATIONS = ['receiving', 'sorting', 'roasting', 'winnowing', 'pressing', 'sieving', 'filtering', 'powder-roasting', 'powder-crushing', 'grinding', 'mixing', 'refining', 'conching', 'tempering', 'moulding', 'packaging', 'completion'];
const STATION_NAMES = { sieving: 'Butter sieving', filtering: 'Filter pan', 'powder-roasting': 'Powder roasting', 'powder-crushing': 'Powder crushing', grinding: 'Liquor grinding', packaging: 'Pieces' };
const stationLabel = (id) => STATION_NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
const checked = [];
const ok = (label) => checked.push(label);

// Waits for the text so checks never run against the "Loading records…" placeholder.
async function expectText(page, text) {
  try {
    await page.locator('main').filter({ hasText: text }).waitFor({ timeout: 10000 });
  } catch {
    console.log((await page.locator('main').innerText()).slice(0, 3000));
    throw new Error(`Expected to find "${text}" on ${page.url()}`);
  }
}

// Station forms pick the container last used for each output; the weights this check types are net, so it weighs without one.
async function noContainers(page) {
  for (const select of await page.locator('main select[aria-label$=" container"]').all()) await select.selectOption('');
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // The check enters a wrong PIN and a wrong password on purpose; the browser logs the server's two refusals.
  let expectedRefusals = 2;
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (expectedRefusals > 0 && m.text().includes('status of 401') && m.location().url.endsWith('/api/session')) { expectedRefusals -= 1; return; }
    errors.push(m.text());
  });

  // Start from the sample factory: the data lives on the server now, so reset the demo there (this signs everyone out).
  await page.goto(`${BASE}/production`);
  const reset = await page.evaluate(async () => {
    const signIn = await fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method: 'password', email: 'alex.morgan@cocoafactory.example', password: 'cocoa123' }) });
    if (!signIn.ok) return `sign-in answered ${signIn.status}`;
    const res = await fetch('/api/demo/reset', { method: 'POST' });
    return res.ok ? 'ok' : `reset answered ${res.status}`;
  });
  if (reset !== 'ok') throw new Error(`Run this check against a demo instance (DEMO_MODE=true): ${reset}`);
  await page.context().clearCookies();
  await page.goto(`${BASE}/production`);

  // Login: quick sign-in (tap your name, enter a PIN) with email + password as the fallback.
  await page.getByRole('heading', { name: 'Who is recording?' }).waitFor();
  if (await page.getByRole('navigation', { name: 'Main navigation' }).count()) throw new Error('App shell visible before sign-in');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screen-login.png` });
  await page.getByRole('button', { name: 'Sign in as Alex Morgan' }).click();
  for (const digit of '1111') await page.getByRole('button', { name: digit, exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Wrong PIN' }).waitFor();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in with email and password' }).click();
  await page.getByLabel('Email').fill('alex.morgan@cocoafactory.example');
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Invalid credentials' }).waitFor();
  await page.getByLabel('Password', { exact: true }).fill('cocoa123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Which batch needs attention?' }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'Which batch needs attention?' }).waitFor(); // session survives a reload
  ok('login: wrong PIN and wrong password rejected, email sign-in works, session persists');

  // The demo is weeks of production made when it is reset, ending today, so the batches and lots this check
  // works with are looked up in it, and lot numbers the check makes are read from the screen.
  const demo = await page.evaluate(async () => (await (await fetch('/api/sync')).json()).full);
  const atWinnowing = demo.batches.find((b) => b.status === 'active' && b.nextStation === 'winnowing');
  const fromStore = demo.batches.find((b) => b.status === 'active' && b.route === 'chocolate' && b.records.length === 0);
  if (!atWinnowing || !fromStore) throw new Error('The demo should have a bean batch waiting at winnowing and a Chocolate from store batch waiting at mixing');
  const WIN = atWinnowing.id;
  const WIN_LABEL = atWinnowing.name || WIN;
  const CHM = fromStore.id;
  const supplierOf = (id) => demo.suppliers.find((s) => s.id === id)?.name;
  const runs = demo.batches.flatMap((b) => b.records.flatMap((r) => (r.runs ?? []).map((run) => ({ batch: b, run }))));
  const piecesOf = (type, size) => demo.lots.filter((l) => l.pieces && l.pieces.type === type && l.pieces.size === size).reduce((n, l) => n + l.received, 0);
  // The plan's progress as the plan page works it out: pieces made since its start date, each line counted up to its target.
  const planFigures = (lines, extra = {}) => {
    const rows = lines.map((l) => {
      const made = demo.lots.filter((x) => x.pieces && x.receivedAt.slice(0, 10) >= demo.plan.from && x.pieces.recipeId === l.recipeId && x.pieces.packSizeId === l.packSizeId).reduce((n, x) => n + x.received, 0) + (extra[`${l.recipeId}|${l.packSizeId}`] ?? 0);
      return { ...l, made, left: Math.max(0, l.pieces - made) };
    });
    const planned = rows.reduce((n, r) => n + r.pieces, 0);
    const made = rows.reduce((n, r) => n + Math.min(r.made, r.pieces), 0);
    return { rows, planned, made, left: planned - made };
  };
  const captured = async (pattern) => {
    await page.locator('main').filter({ hasText: pattern }).waitFor({ timeout: 10000 });
    return (await page.locator('main').innerText()).match(pattern)[1];
  };

  // Sidebar: six destinations, active state, counts, no "All screens".
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  for (const label of ['Overview', 'Production line', 'Store', 'Dispatch', 'Batch tracing', 'Chocolate types', 'Reports', 'Setup']) await nav.getByRole('link', { name: label }).waitFor();
  if (await nav.getByText('All screens').count()) throw new Error('"All screens" link still present');
  const active = await nav.locator('[aria-current="page"]').innerText();
  if (!active.includes('Production line')) throw new Error(`Expected Production line active, got ${active}`);
  if (!(await nav.getByLabel(/batches$/).innerText()).match(/\d/)) throw new Error('Active batch count missing');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screen-production.png`, fullPage: true });
  ok('sidebar navigation, active state and counts');

  // Active batch rows show batch, product, where it is waiting, and Continue.
  await expectText(page, WIN);
  await expectText(page, 'Waiting at');
  await page.getByRole('link', { name: `Continue ${WIN_LABEL}` }).waitFor();
  ok('active batch rows');

  // Each part of the line has its own sidebar entry and page; the production page itself stays short.
  const PARTS = { 'bean-processing': ['receiving', 'sorting', 'roasting', 'winnowing'], 'butter-powder': ['pressing', 'sieving', 'filtering', 'powder-roasting', 'powder-crushing'], liquor: ['grinding'], 'chocolate-making': ['mixing'], finishing: ['packaging', 'completion'] };
  const PART_LABELS = { 'bean-processing': 'Bean processing', 'butter-powder': 'Butter & powder', liquor: 'Liquor', 'chocolate-making': 'Chocolate making', finishing: 'Finishing' };
  const sidebarParts = page.getByRole('group', { name: 'Parts of the production line' });
  for (const [slug, ids] of Object.entries(PARTS)) {
    const label = PART_LABELS[slug];
    await page.goto(`${BASE}/production`);
    await sidebarParts.getByRole('link', { name: new RegExp(`^${label}`) }).click();
    await page.waitForURL(`**/production/parts/${slug}`);
    await page.getByRole('heading', { level: 1, name: label, exact: true }).waitFor();
    await sidebarParts.locator('[aria-current="page"]').filter({ hasText: label }).waitFor();
    if ((await page.getByRole('link', { name: /Open station/ }).count()) !== ids.length) throw new Error(`${label} should list ${ids.length} stations`);
    // Every station in the part opens its queue directly.
    for (const id of ids) {
      await page.goto(`${BASE}/production/parts/${slug}`);
      await page.getByRole('link', { name: new RegExp(`^\\d\\d\\s*${stationLabel(id)}\\b`) }).click();
      await page.waitForURL(`**/production/stations/${id}`);
      await page.getByRole('heading', { level: 1 }).waitFor();
    }
  }
  await page.goto(`${BASE}/production/parts/butter-powder`);
  await expectText(page, 'filter pan');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screen-part-butter-powder.png`, fullPage: true });
  await page.goto(`${BASE}/production`);
  if (await page.getByRole('link', { name: /Open station/ }).count()) throw new Error('Production page should not list stations (long scroll)');
  ok('five parts as sidebar entries with their own pages; all 13 stations of the line open their queues');

  // Winnowing on one screen: input already filled in, each output shows where it goes, one Save.
  await page.goto(`${BASE}/production/stations/winnowing`);
  await page.getByRole('link', { name: new RegExp(WIN) }).click();
  await page.waitForURL(`**/production/batches/${WIN}/record/winnowing`);
  await expectText(page, 'roasted beans');
  await expectText(page, '90.40 kg');
  for (const [name, value] of [['Nibs for liquor', 'continue:grinding'], ['Nibs for butter', 'continue:pressing'], ['Nibs for sale', 'sale'], ['Husks', 'waste']]) {
    if ((await page.getByLabel(`${name} destination`).inputValue()) !== value) throw new Error(`${name} should default to ${value}`);
  }
  await noContainers(page);
  for (const [name, value] of [['Nibs for liquor', '50'], ['Nibs for butter', '20'], ['Nibs for sale', '4'], ['Husks', '15.9']]) await page.getByRole('spinbutton', { name, exact: true }).fill(value);
  await expectText(page, 'Entered 89.90 of 90.40 kg');
  await expectText(page, 'Balance OK · 0.50 kg missing (0.55%)');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screen-record-winnowing.png`, fullPage: true });
  await page.getByRole('button', { name: 'Save winnowing' }).click();
  await page.getByText('Winnowing saved.').waitFor();
  await page.getByText('Sent on: 50.00 kg nibs for liquor to liquor grinding · 20.00 kg nibs for butter to pressing.').waitFor();
  await page.getByRole('button', { name: 'Show details' }).click();
  const balance = await page.locator('main').innerText();
  const expected = [['Went in', '90.40 kg'], ['Weighed out', '89.90 kg'], ['Good output', '74.00 kg'], ['Missing weight', '0.50 kg'], ['Missing %', '0.55%'], ['Yield', '81.86%']];
  for (const [label, value] of expected) {
    const re = new RegExp(`${label}\\s*\\n?\\s*${value.replace('.', '\\.')}`);
    if (!re.test(balance)) throw new Error(`Balance missing "${label} ${value}"`);
  }
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screen-winnowing-saved.png`, fullPage: true });
  ok('winnowing on one screen: default destinations, live check, verdict and details (89.90 / 74.00 / 0.50 / 0.55% / 81.86%)');

  // The split waits at two stations; the next steps are offered at the top.
  await page.getByRole('link', { name: /Record pressing/ }).waitFor();
  await page.getByRole('link', { name: /Liquor grinding also waiting/ }).waitFor();
  for (const id of ['pressing', 'grinding']) {
    await page.goto(`${BASE}/production/stations/${id}`);
    await page.getByRole('link', { name: new RegExp(WIN) }).waitFor();
  }
  ok('nib split waits at pressing and liquor grinding at the same time');

  // Pressing with a custom output row; butter kept in store, cake for sale, so the batch ends after grinding.
  await page.goto(`${BASE}/production/batches/${WIN}/record/pressing`);
  await expectText(page, '20.00 kg');
  await noContainers(page);
  await page.getByRole('spinbutton', { name: 'Brown butter', exact: true }).fill('9');
  await page.getByRole('spinbutton', { name: 'Cocoa cake (powder)', exact: true }).fill('10.8');
  await page.getByRole('button', { name: 'Add another output' }).click();
  await page.getByLabel('Output 4 name').fill('Screen residue');
  await page.getByLabel('Output 4 type').selectOption('waste');
  await page.getByLabel('Output 4 weight', { exact: true }).fill('0.1');
  await page.getByLabel('Brown butter destination').selectOption('stock');
  await page.getByLabel('Cocoa cake (powder) destination').selectOption('sale');
  await page.getByRole('button', { name: 'Save pressing' }).click();
  await page.getByText('Pressing saved.').waitFor();
  await page.getByRole('link', { name: /Record liquor grinding/ }).click();
  await page.waitForURL('**/record/grinding');
  await expectText(page, '50.00 kg'); // only the nibs for liquor became the grinding input
  ok('pressing with custom output row; only continued output becomes the next input');

  // Liquor grinding: weighed after fine grinding, labelled with the batch name and supplier, and sent on to mixing.
  if ((await page.getByLabel('Liquor destination').inputValue()) !== 'continue:mixing') throw new Error('Liquor should go on to mixing by default');
  await noContainers(page);
  await page.getByRole('spinbutton', { name: 'Liquor', exact: true }).fill('49.8');
  await page.getByRole('button', { name: 'Save liquor grinding' }).click();
  await page.getByText('Liquor grinding saved.').waitFor();
  await page.getByText('Sent on: 49.80 kg liquor to mixing.').waitFor();
  await expectText(page, 'Liquor label');
  await expectText(page, supplierOf(atWinnowing.supplierId));
  ok('liquor grinding labels the liquor with the batch and supplier, and sends it on to mixing');

  // Mixing, the changeover sheet's example: 30 kg of 70% Dark on the 10 kg of 85% Dark the demo's last run left in the mixer.
  await page.getByRole('link', { name: /Record mixing/ }).click();
  await page.waitForURL(`**/${WIN}/record/mixing`);
  await expectText(page, '49.80 kg left');
  await expectText(page, 'of 85% Dark');
  await page.getByLabel('Chocolate type', { exact: true }).selectOption({ label: '70% Dark' });
  await page.getByLabel('Kg to run').fill('30');
  for (const t of ['Add 16.50 kg', 'Add 3.00 kg', 'Add 10.50 kg', 'Everything accounted for']) await expectText(page, t);
  if ((await page.getByLabel('Liquor from').inputValue()) !== '') throw new Error('Liquor should come from the batch itself');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screen-mixing-run.png`, fullPage: true });
  await page.getByRole('button', { name: 'Save 70% Dark' }).click();
  const D70 = await captured(/70% Dark saved: 30\.00 kg made as lot (D70-\d+), 10\.00 kg kept in the mixer\./);
  await expectText(page, '33.30 kg left');
  await page.getByRole('button', { name: 'Finish mixing' }).click();
  await page.getByRole('button', { name: 'Finish mixing' }).last().click();
  await expectText(page, 'Mixing finished.');
  await captured(/kept in store as (LIQ-\d+)/);
  ok('mixing: 70% Dark on 10 kg of 85% adds 16.5 liquor, 3 butter, 10.5 sugar as in the sheet; unused liquor kept in store');

  // One step list with the weights behind each step, and corrections next to the weight.
  await page.goto(`${BASE}/production/batches/${WIN}`);
  await page.getByRole('heading', { name: 'Steps' }).waitFor();
  for (const t of ['Receiving', 'Sorting', 'Roasting', 'Winnowing', 'Pressing', 'Liquor grinding', 'Mixing', 'missing 0.50 kg (0.55%)', 'Completion']) await expectText(page, t);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screen-batch-timeline.png`, fullPage: true });
  await page.getByRole('button', { name: 'Details', exact: true }).nth(3).click();
  await expectText(page, 'For sale');
  await page.getByRole('button', { name: 'Correct Husks' }).click();
  await page.getByLabel('Corrected weight').fill('15.8');
  await page.getByLabel('Correction reason').fill('Bin tare was wrong.');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expectText(page, 'Corrected Husks: 15.90 → 15.80 kg');
  await page.getByRole('button', { name: 'Put on hold' }).click();
  await page.getByLabel('Hold reason').fill('Waiting for quality sign-off.');
  await page.getByRole('button', { name: 'Place hold' }).click();
  await expectText(page, 'On hold');
  await page.getByRole('button', { name: 'Release hold' }).click();
  await page.getByLabel('Release note').fill('Approved.');
  await page.getByRole('button', { name: 'Release', exact: true }).click();
  await page.getByRole('link', { name: /Review & complete/ }).first().click();
  await page.waitForURL('**/record/completion');
  await page.getByRole('button', { name: 'Complete batch' }).click();
  await page.waitForURL(`**/production/batches/${WIN}`);
  await expectText(page, 'Completed');
  ok('batch steps, inline correction, hold/release, completion');

  // Chocolate from store: a batch mixes from lots. The 70% Dark the bean batch left must come out before 100% Dark.
  await page.goto(`${BASE}/production/stations/mixing`);
  await page.getByRole('link', { name: new RegExp(CHM) }).click();
  await page.waitForURL(`**/${CHM}/record/mixing`);
  await expectText(page, 'take each ingredient from a lot in store');
  await page.getByLabel('Chocolate type', { exact: true }).selectOption({ label: '100% Dark' });
  await page.getByLabel('Kg to run').fill('20');
  await expectText(page, 'which has sugar. 100% Dark has none: take the chocolate out of the mixer first.');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Take it out of the mixer' }).click();
  await captured(/taken out as lot (D70-\d+)\. The mixer is empty\./);
  await page.getByLabel('Chocolate type', { exact: true }).selectOption({ label: '100% Dark' });
  await page.getByLabel('Kg to run').fill('20');
  await expectText(page, 'Add 18.00 kg');
  await page.getByLabel('Kept in the mixer').fill('0');
  await page.getByRole('button', { name: 'Save 100% Dark' }).click();
  const D100 = await captured(/100% Dark saved: 20\.00 kg made as lot (D100-\d+)\./);
  await page.getByRole('button', { name: 'Finish mixing' }).click();
  await page.getByRole('button', { name: 'Finish mixing' }).last().click();
  await page.getByRole('link', { name: /Review & complete batch/ }).click();
  await expectText(page, '100% Dark made');
  await page.getByRole('button', { name: 'Complete batch' }).click();
  await page.waitForURL(`**/production/batches/${CHM}`);
  ok('chocolate from store: a blocked changeover, the leftover taken out as a lot, a run from empty, completion');

  // Pieces: the chocolate lots wait at Pieces; good pieces of each size are counted from a lot.
  await page.goto(`${BASE}/production/stations/packaging`);
  for (const t of ['Chocolate to make into pieces', D70, '30.00 kg', D100]) await expectText(page, t);
  await page.getByRole('link', { name: new RegExp(D70) }).click();
  await page.waitForURL(`**/production/pieces/${D70}`);
  await page.getByLabel('1 kg pack pieces').fill('31');
  await expectText(page, '1.00 kg more than the lot has');
  await page.getByLabel('1 kg pack pieces').fill('');
  await page.getByLabel('45 g bar pieces').fill('500');
  await page.getByLabel('80 g bar pieces').fill('90');
  await expectText(page, '590 pieces · 29.70 kg of chocolate');
  await expectText(page, '0.30 kg stays in the lot');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screen-pieces.png`, fullPage: true });
  await page.getByRole('button', { name: 'Save pieces' }).click();
  const [, FIN45, FIN80] = (await captured(/(Pieces saved\. 500 × 45 g bar \(FIN-\d+\) · 90 × 80 g bar \(FIN-\d+\)\.)/)).match(/\((FIN-\d+)\).*\((FIN-\d+)\)/);
  await expectText(page, '0.30 kg');
  ok(`pieces: good pieces per size from a chocolate lot (590 = 29.70 kg), too much refused, lots ${FIN45} and ${FIN80}`);

  // Dispatch: goods out to a customer from a chosen lot, more than the lot has refused, a delivery note, the
  // customer on the trace, and a cancel that puts the goods back.
  await page.goto(`${BASE}/store`);
  await page.getByRole('link', { name: 'Dispatch goods' }).click();
  await page.waitForURL('**/dispatch/new');
  await page.getByLabel('Customer', { exact: true }).selectOption({ label: 'Factory shop' });
  await page.getByLabel('Order or invoice number').fill('CHECK-1');
  await page.getByLabel('Product 1').selectOption('70% Dark · 45 g bar');
  await page.getByLabel('From 1').selectOption(FIN45);
  await page.getByLabel('Quantity 1').fill('600');
  await expectText(page, '100 pieces more than is in store for this line.');
  await page.getByLabel('Quantity 1').fill('120');
  await expectText(page, `Taken from ${FIN45} (120 pieces)`);
  await page.getByRole('button', { name: 'Save dispatch' }).click();
  await page.waitForURL(/\/dispatch\/DSP-\d+\?saved=1$/);
  const DSP = page.url().match(/(DSP-\d+)/)[1];
  for (const t of ['Dispatch saved.', 'Factory shop', 'CHECK-1', FIN45, '120 pieces']) await expectText(page, t);
  const [note] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Print delivery note' }).click()]);
  await note.waitForLoadState();
  for (const t of ['Delivery note', DSP, 'Factory shop', FIN45, '120 pieces']) if (!(await note.content()).includes(t)) throw new Error(`Delivery note is missing ${t}`);
  await note.close();
  await page.goto(`${BASE}/trace/${FIN45}`);
  for (const t of ['Customers it reached', DSP, 'Factory shop', '380 pieces']) await expectText(page, t);
  await page.goto(`${BASE}/reports/dispatched`);
  await expectText(page, DSP);
  await page.goto(`${BASE}/dispatch/${DSP}`);
  await page.getByRole('button', { name: 'Cancel dispatch' }).click();
  await page.getByLabel('Cancel reason').fill('Entered twice.');
  await page.getByRole('button', { name: 'Cancel dispatch' }).last().click();
  await expectText(page, 'Entered twice. The goods went back to their lots.');
  await page.goto(`${BASE}/materials/${FIN45}`);
  await expectText(page, '500 units received, 500 units available');
  ok(`dispatch: ${DSP} from ${FIN45}, more than the lot has refused, delivery note printed, customer on the trace, cancelled and back in store`);

  // A bean delivery is one form: the batch and its receiving record are saved together.
  await page.goto(`${BASE}/production/new`);
  await page.getByRole('heading', { name: 'Receive a delivery' }).waitFor();
  if (await page.getByLabel(/Cocoa beans lot/).count()) throw new Error('Cocoa bean lot selector should not appear on the new batch screen');
  await page.getByRole('spinbutton', { name: 'Delivered weight', exact: true }).fill('50');
  await page.getByRole('spinbutton', { name: 'Accepted beans', exact: true }).fill('49.5');
  await page.getByRole('button', { name: 'Save delivery' }).click();
  await page.waitForURL(/\/production\/batches\/CB-\d+\/record\/receiving\?saved=1$/);
  const NEW_CB = page.url().match(/batches\/(CB-\d+)\//)[1];
  await expectText(page, 'Receiving saved.');
  await expectText(page, 'Batch card');
  await page.getByRole('link', { name: /Record sorting/ }).waitFor();
  ok('receive a delivery: batch and receiving saved in one form, batch card printed from there');

  // Lot records: traceability, labels, receive. The old Materials list now opens the Store.
  await page.goto(`${BASE}/materials`);
  await page.waitForURL('**/store');
  // Liquor ground from beans taken out of a lot in store, then weighed into a Chocolate from store batch
  const liquor = demo.lots.find((l) => l.material === 'Liquor' && l.source.type === 'batch' && l.source.station === 'grinding' && l.uses.some((u) => u.batchId.startsWith('CH-')) && demo.batches.find((b) => b.id === l.source.batchId).startInput.lotIds.length);
  await page.goto(`${BASE}/materials/${liquor.id}`);
  await page.getByRole('heading', { name: 'Traceability' }).waitFor();
  for (const t of [liquor.source.batchId, demo.batches.find((b) => b.id === liquor.source.batchId).startInput.lotIds[0], liquor.uses.find((u) => u.batchId.startsWith('CH-')).batchId, 'Print label']) await expectText(page, t);
  const firstPieces = demo.lots.find((l) => l.pieces);
  await page.goto(`${BASE}/materials/${firstPieces.id}`);
  for (const t of [`${firstPieces.received} pieces of ${firstPieces.pieces.size}`, firstPieces.pieces.fromLotId, firstPieces.source.batchId, 'Print label']) await expectText(page, t);
  await page.goto(`${BASE}/materials/receive`);
  await page.getByLabel('Measured weight').fill('120');
  await page.getByRole('button', { name: 'Save receipt' }).click();
  await page.waitForURL('**/materials/BEAN-*');
  await expectText(page, 'Kuapa Kokoo');
  ok('lot records: traceability (upstream and downstream), labels, receive material');

  // Store and batch tracing: finished pieces back to every delivery, a delivery on to the pieces.
  await page.goto(`${BASE}/store`);
  const inStore = (material) => demo.lots.find((l) => l.material === material && l.available > 0).id;
  for (const t of ['Other stored products', inStore('Sugar'), inStore('Cocoa beans'), inStore('Silk butter'), demo.lots.find((l) => l.pieces && l.available > 0).id]) await expectText(page, t);
  // Pieces of chocolate made on top of what an earlier run left in the mixer, and the sugar lot that went into them
  const onTop = runs.find(({ run }) => run.held && run.ingredients.some((i) => i.name === 'Sugar' && i.lotId) && demo.lots.some((l) => l.pieces?.fromLotId === run.lotId));
  const sugar = onTop.run.ingredients.find((i) => i.name === 'Sugar' && i.lotId).lotId;
  const madeOnTop = demo.lots.find((l) => l.pieces?.fromLotId === onTop.run.lotId).id;
  await page.goto(`${BASE}/trace/${madeOnTop}`);
  for (const t of ['Deliveries behind it', sugar, `Left in the mixer: ${onTop.run.held.type}`]) await expectText(page, t);
  await page.goto(`${BASE}/trace/${sugar}`);
  for (const t of ['Where it went', madeOnTop]) await expectText(page, t);
  ok('store, and a batch traced from the pieces back to the deliveries and forward again');

  // Chocolate types: the sheet's recipes, versions and expected vs actual.
  await page.goto(`${BASE}/recipes`);
  for (const t of ['34% White', '50% Milk', '56% Dark', '100% Dark','Liquor 44% · Cocoa butter 10% · Sugar 46%']) await expectText(page, t);
  await page.getByRole('link', { name: /70% Dark/ }).click();
  for (const t of ['v1', 'Liquor 60% · Cocoa butter 10% · Sugar 30%', 'Expected vs actual', runs.find(({ run }) => run.recipeId === 'R-70').batch.id, WIN]) await expectText(page, t);
  await page.getByRole('button', { name: 'New version' }).click();
  await page.getByLabel('What changed?').fill('Trial.');
  await page.getByRole('button', { name: 'Save version' }).click();
  await expectText(page, 'v2');
  ok('chocolate types from the sheet, recipe versions and expected vs actual');

  // A new chocolate type, then offered at mixing in a new "Chocolate from store" batch.
  await page.goto(`${BASE}/recipes`);
  await page.getByRole('link', { name: 'New chocolate type' }).click();
  await page.getByLabel('Chocolate type name').fill('60% Dark');
  await page.getByLabel('Liquor percent').fill('50');
  await page.getByLabel('Cocoa butter percent').fill('10');
  await expectText(page, 'Total 60.00%');
  if (await page.getByRole('button', { name: 'Save chocolate type' }).isEnabled()) throw new Error('A recipe below 100% should not be saveable');
  await page.getByLabel('Sugar percent').fill('40');
  await page.getByRole('button', { name: 'Save chocolate type' }).click();
  await page.waitForURL('**/recipes/R-60-DARK');
  await expectText(page, 'Liquor 50% · Cocoa butter 10% · Sugar 40%');
  await page.goto(`${BASE}/production/new?chocolate=1`);
  if ((await page.getByLabel('Product', { exact: true }).inputValue()) !== 'P-CHOC') throw new Error('Mixing from store should start a Chocolate from store batch');
  await page.getByRole('button', { name: /Create batch/ }).click();
  await page.waitForURL(/\/production\/batches\/CH-\d+\/record\/mixing$/);
  await page.getByLabel('Chocolate type', { exact: true }).selectOption({ label: '60% Dark' });
  ok('new chocolate type saved and offered at mixing in a new Chocolate from store batch');

  // Reports.
  await page.goto(`${BASE}/reports`);
  await page.waitForURL('**/reports/pieces');
  for (const t of ['By type and size', '70% Dark', '45 g bar', String(piecesOf('70% Dark', '45 g bar') + 500), '80 g bar', String(piecesOf('70% Dark', '80 g bar') + 90), '85% Dark']) await expectText(page, t);
  for (const [section, text] of [['losses', 'Every batch as a share of its starting weight'], ['losses', 'Follow one batch down the line'], ['losses', 'Loss at each process, all batches'], ['variance', 'Unaccounted variance'], ['batches', 'All batches'], ['corrections', 'Bin tare was wrong.'], ['holds', 'Waiting for quality sign-off.']]) {
    await page.goto(`${BASE}/reports/${section}`);
    await expectText(page, text);
  }
  ok('reports: pieces made by type and size, waste & variance, batch history, corrections, holds');

  // Production plan: pieces planned per type and size, counted from the pieces recorded since its start date.
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Production plan' }).click();
  await page.waitForURL('**/plan');
  // The check's own pieces count too: 500 × 45 g and 90 × 80 g of 70% Dark, made today.
  const before = planFigures(demo.plan.lines, { 'R-70|PK-45': 500, 'R-70|PK-80': 90 });
  for (const t of [`${before.left} pieces left to make`, `Counting pieces made from ${demo.plan.from}`, String(before.planned), String(before.made), 'Chocolate still to mix', 'Ingredients to mix it', 'Milk powder']) await expectText(page, t);
  const row70 = before.rows.find((r) => r.recipeId === 'R-70' && r.packSizeId === 'PK-45');
  const planRow = page.getByRole('row').filter({ hasText: '70% Dark' }).filter({ hasText: '45 g bar' });
  for (const t of [row70.pieces, row70.made, row70.left].map(String)) if (!(await planRow.innerText()).includes(t)) throw new Error(`Plan row for 70% Dark 45 g bar is missing ${t}`);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screen-plan.png`, fullPage: true });
  await page.getByRole('button', { name: 'Change the plan' }).click();
  const lineOne = demo.plan.lines[0];
  const added = demo.plan.lines.length + 1;
  await page.getByLabel('Line 1 pieces').fill('2500');
  await page.getByRole('button', { name: 'Add a line' }).click();
  await page.getByLabel(`Line ${added} chocolate type`).selectOption({ label: '70% Dark' });
  await page.getByLabel(`Line ${added} size`).selectOption({ label: '45 g bar (45 g)' });
  await page.getByLabel(`Line ${added} pieces`).fill('5');
  await page.getByRole('button', { name: 'Save plan' }).click();
  await expectText(page, '70% Dark · 45 g bar is in the plan twice. Give it one line.');
  await page.getByLabel(`Line ${added} chocolate type`).selectOption({ label: '60% Dark' });
  await page.getByLabel(`Line ${added} size`).selectOption({ label: '1 kg pack (1000 g)' });
  await page.getByLabel(`Line ${added} pieces`).fill('10');
  await page.getByLabel('Plan note').fill('Week 40 orders');
  await page.getByRole('button', { name: 'Save plan' }).click();
  const after = planFigures([{ ...lineOne, pieces: 2500 }, ...demo.plan.lines.slice(1), { recipeId: 'R-60-DARK', packSizeId: 'PK-1000', pieces: 10 }], { 'R-70|PK-45': 500, 'R-70|PK-80': 90 });
  for (const t of [`${after.left} pieces left to make`, 'Week 40 orders', String(after.planned), '60% Dark']) await expectText(page, t);
  await page.goto(`${BASE}/overview`);
  for (const t of ['Production plan', `${after.made} of ${after.planned} pieces made`]) await expectText(page, t);
  ok(`production plan: pieces left per type and size from the pieces made (${before.left}), a duplicate line refused, plan changed (${after.left}), shown on Overview`);

  // Setup.
  for (const [section, text] of [['products', 'Batch prefix'], ['pack-sizes', '45 g bar'], ['outputs', 'Nibs for liquor'], ['containers', 'Husk bin'], ['routes', 'Beans to chocolate'], ['suppliers', 'Kuapa Kokoo'], ['customers', 'Lakeview Hotel'], ['users', 'Current user'], ['alerts', 'Variance limit per station']]) {
    await page.goto(`${BASE}/setup/${section}`);
    await expectText(page, text);
  }
  await page.goto(`${BASE}/setup/users`);
  await page.getByRole('button', { name: 'Use Ama' }).click();
  await page.goto(`${BASE}/setup/alerts`);
  await page.getByLabel('Winnowing variance limit').fill('0.1');
  await page.getByLabel('Winnowing variance limit').press('Enter');
  await page.getByLabel('Saved').first().waitFor(); // saved on the server
  await page.goto(`${BASE}/overview`);
  await page.getByRole('heading', { name: 'How production is doing' }).waitFor();
  await expectText(page, 'Alerts');
  ok('setup sections, user switch, threshold change, overview');

  // Mobile layout: bottom navigation, no horizontal overflow, record screen usable.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/production`);
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: /Production/ }).waitFor();
  const sidebarVisible = await page.getByRole('navigation', { name: 'Main navigation' }).isVisible();
  if (sidebarVisible) throw new Error('Desktop sidebar visible on mobile');
  let overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error('Horizontal overflow on mobile production page');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screen-mobile-production.png`, fullPage: true });
  await page.goto(`${BASE}/production/batches/${NEW_CB}/record/sorting`);
  await page.getByRole('button', { name: 'Save sorting' }).waitFor();
  overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error('Horizontal overflow on mobile record page');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screen-mobile-record.png`, fullPage: true });
  if (await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: /Plan/ }).count()) throw new Error('The plan should stay off the phone bar');
  await page.goto(`${BASE}/plan`);
  await expectText(page, `${after.left} pieces left to make`);
  overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error('Horizontal overflow on mobile plan page');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screen-mobile-plan.png`, fullPage: true });
  ok('mobile layout: bottom navigation, no overflow on production, record and plan pages');

  // Sign out returns to the login screen (mobile header button), and the login screen fits a phone.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('heading', { name: 'Who is recording?' }).waitFor();
  overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error('Horizontal overflow on mobile login page');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screen-login-mobile.png`, fullPage: true });
  ok('sign out returns to login; mobile login layout');

  // An operator signs in with a PIN and lands on their own work.
  await page.getByRole('button', { name: 'Sign in as Ama Boateng' }).click();
  for (const digit of '1234') await page.getByRole('button', { name: digit, exact: true }).click();
  await page.waitForURL('**/work');
  await page.getByRole('link', { name: /Record Sorting for/ }).first().waitFor();
  if ((await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link').count()) !== 2) throw new Error('Operators should see only My work and Production line');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screen-my-work.png`, fullPage: true });
  ok('operator PIN sign-in lands on My work with a two-item menu');

  // Operators can read the plan but not change it.
  await page.goto(`${BASE}/plan`);
  await expectText(page, `${after.left} pieces left to make`);
  if (await page.getByRole('button', { name: 'Change the plan' }).count()) throw new Error('Operators should not change the plan');
  ok('operators read the plan without the button to change it');

  console.log(JSON.stringify({ checked, errors }, null, 2));
  await browser.close();
  if (errors.length) process.exit(1);
})().catch((error) => { console.error(error); process.exit(1); });
