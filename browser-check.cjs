// End-to-end browser check for the production system.
// Run with the dev server on http://127.0.0.1:3100:  node browser-check.cjs
const { chromium } = require('@playwright/test');

const BASE = 'http://127.0.0.1:3100';
const SCREENSHOT_DIR = 'C:/Users/hp/Documents/Codex/2026-09-14/we/work/chocolate-checks';
const STATIONS = ['receiving', 'sorting', 'roasting', 'winnowing', 'pressing', 'sieving', 'filtering', 'powder-roasting', 'powder-crushing', 'grinding', 'mixing', 'refining', 'conching', 'tempering', 'moulding', 'packaging', 'completion'];
const STATION_NAMES = { sieving: 'Butter sieving', filtering: 'Filter pan', 'powder-roasting': 'Powder roasting', 'powder-crushing': 'Powder crushing', grinding: 'Liquor grinding' };
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

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
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

  // Sidebar: six destinations, active state, counts, no "All screens".
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  for (const label of ['Overview', 'Production line', 'Materials', 'Recipes', 'Reports', 'Setup']) await nav.getByRole('link', { name: label }).waitFor();
  if (await nav.getByText('All screens').count()) throw new Error('"All screens" link still present');
  const active = await nav.locator('[aria-current="page"]').innerText();
  if (!active.includes('Production line')) throw new Error(`Expected Production line active, got ${active}`);
  if (!(await nav.getByLabel(/batches$/).innerText()).match(/\d/)) throw new Error('Active batch count missing');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screen-production.png`, fullPage: true });
  ok('sidebar navigation, active state and counts');

  // Active batch rows show batch, product, where it is waiting, and Continue.
  await expectText(page, 'CB-025');
  await expectText(page, 'Waiting at');
  await page.getByRole('link', { name: 'Continue CB-025' }).waitFor();
  ok('active batch rows');

  // Each part of the line has its own sidebar entry and page; the production page itself stays short.
  const PARTS = { 'bean-processing': ['receiving', 'sorting', 'roasting', 'winnowing'], 'butter-powder': ['pressing', 'sieving', 'filtering', 'powder-roasting', 'powder-crushing'], liquor: ['grinding'], 'chocolate-making': ['mixing', 'refining', 'conching', 'tempering'], finishing: ['moulding', 'packaging', 'completion'] };
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
  ok('five parts as sidebar entries with their own pages; all 17 stations open their queues');

  // Winnowing on one screen: input already filled in, each output shows where it goes, one Save.
  await page.goto(`${BASE}/production/stations/winnowing`);
  await page.getByRole('link', { name: /CB-025/ }).click();
  await page.waitForURL('**/production/batches/CB-025/record/winnowing');
  await expectText(page, 'roasted beans');
  await expectText(page, '90.40 kg');
  for (const [name, value] of [['Nibs for liquor', 'continue:grinding'], ['Nibs for butter', 'continue:pressing'], ['Nibs for sale', 'sale'], ['Husks', 'waste']]) {
    if ((await page.getByLabel(`${name} destination`).inputValue()) !== value) throw new Error(`${name} should default to ${value}`);
  }
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
    await page.getByRole('link', { name: /CB-025/ }).waitFor();
  }
  ok('nib split waits at pressing and liquor grinding at the same time');

  // Pressing with a custom output row; butter kept in store, cake for sale, so the batch ends after grinding.
  await page.goto(`${BASE}/production/batches/CB-025/record/pressing`);
  await expectText(page, '20.00 kg');
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

  // Liquor grinding: weighed after fine grinding, labelled with the batch name and supplier.
  await page.getByRole('spinbutton', { name: 'Liquor', exact: true }).fill('49.8');
  await page.getByRole('button', { name: 'Save liquor grinding' }).click();
  await page.getByText('Liquor grinding saved.').waitFor();
  await page.getByText('Nothing else is waiting. Complete the batch.').waitFor();
  await expectText(page, 'Liquor label');
  await expectText(page, 'Kuapa Kokoo');
  ok('liquor grinding stores labelled liquor; label carries the batch and supplier');

  // One step list with the weights behind each step, and corrections next to the weight.
  await page.goto(`${BASE}/production/batches/CB-025`);
  await page.getByRole('heading', { name: 'Steps' }).waitFor();
  for (const t of ['Receiving', 'Sorting', 'Roasting', 'Winnowing', 'Pressing', 'Liquor grinding', 'missing 0.50 kg (0.55%)', 'Completion']) await expectText(page, t);
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
  await page.waitForURL('**/production/batches/CB-025');
  await expectText(page, 'Completed');
  ok('batch steps, inline correction, hold/release, completion');

  // The step list exposes later stations for early entry.
  await page.goto(`${BASE}/production/batches/CH-018`);
  await page.getByRole('heading', { name: 'Steps' }).waitFor();
  await page.getByRole('link', { name: /Enter Packaging weights early for CH-018/ }).waitFor();

  // Chocolate finishing: moulding → packaging → completion.
  await page.goto(`${BASE}/production/stations/moulding`);
  await page.getByRole('link', { name: /CH-018/ }).click();
  await page.getByRole('spinbutton', { name: 'Finished chocolate', exact: true }).fill('94.8');
  await page.getByRole('spinbutton', { name: 'Recoverable chocolate', exact: true }).fill('1.2');
  await page.getByRole('button', { name: 'Save moulding' }).click();
  await page.getByText('Moulding saved.').waitFor();
  await page.getByText('Sent on: 94.80 kg finished chocolate to packaging.').waitFor();
  await page.getByRole('link', { name: /Record packaging/ }).click();
  await page.getByLabel('Pack size').selectOption({ label: '45 g bar' });
  await page.getByLabel('Total units made').fill('2090');
  await page.getByLabel('Rejected units').fill('14');
  await expectText(page, '2076');
  await page.getByRole('button', { name: 'Save packaging' }).click();
  await page.getByText('Packaging saved.').waitFor();
  await expectText(page, '2076 accepted units ready.');
  await page.getByText('Nothing else is waiting. Complete the batch.').waitFor();
  await page.getByRole('link', { name: /Review & complete batch/ }).click();
  await expectText(page, '2076 × 45 g');
  await page.getByRole('button', { name: 'Complete batch' }).click();
  await page.waitForURL('**/production/batches/CH-018');
  ok('moulding, packaging (accepted units calculated), completion');

  // A bean delivery is one form: the batch and its receiving record are saved together.
  await page.goto(`${BASE}/production/new`);
  await page.getByRole('heading', { name: 'Receive a delivery' }).waitFor();
  if (await page.getByLabel(/Cocoa beans lot/).count()) throw new Error('Cocoa bean lot selector should not appear on the new batch screen');
  await page.getByRole('spinbutton', { name: 'Delivered weight', exact: true }).fill('50');
  await page.getByRole('spinbutton', { name: 'Accepted beans', exact: true }).fill('49.5');
  await page.getByRole('button', { name: 'Save delivery' }).click();
  await page.waitForURL('**/production/batches/CB-026/record/receiving?saved=1');
  await expectText(page, 'Receiving saved.');
  await expectText(page, 'Batch card');
  await page.getByRole('link', { name: /Record sorting/ }).waitFor();
  ok('receive a delivery: batch and receiving saved in one form, batch card printed from there');

  // Materials: lots, traceability, receive.
  await page.goto(`${BASE}/materials`);
  await page.getByRole('link', { name: /LIQ-024/ }).click();
  await page.getByRole('heading', { name: 'Traceability' }).waitFor();
  for (const t of ['CB-024', 'BEAN-0905', 'CH-018', 'Print label']) await expectText(page, t);
  await page.goto(`${BASE}/materials`);
  await page.getByRole('button', { name: 'Finished goods' }).click();
  await page.getByRole('link', { name: /FIN-0001/ }).click();
  await expectText(page, 'CH-018');
  await page.goto(`${BASE}/materials/receive`);
  await page.getByLabel('Measured weight').fill('120');
  await page.getByRole('button', { name: 'Save receipt' }).click();
  await page.waitForURL('**/materials/BEAN-*');
  await expectText(page, 'Kuapa Kokoo');
  ok('materials list, lot traceability (upstream and downstream), receive material');

  // Recipes: versions and expected vs actual.
  await page.goto(`${BASE}/recipes`);
  await page.getByRole('link', { name: /70% Dark chocolate/ }).click();
  for (const t of ['v3', 'Expected vs actual', 'CH-018', '+0.10 kg']) await expectText(page, t);
  await page.getByRole('button', { name: 'New version' }).click();
  await page.getByLabel('What changed?').fill('Trial.');
  await page.getByRole('button', { name: 'Save version' }).click();
  await expectText(page, 'v4');
  ok('recipe versions and expected vs actual');

  // Reports.
  for (const [section, text] of [['losses', 'Weigh-in at each stage, every batch'], ['losses', 'Lost this step'], ['losses', 'Loss at each process, all batches'], ['variance', 'Unaccounted variance'], ['batches', 'All batches'], ['corrections', 'Bin tare was wrong.'], ['holds', 'Waiting for quality sign-off.']]) {
    await page.goto(`${BASE}/reports/${section}`);
    await expectText(page, text);
  }
  ok('reports: waste & variance, batch history, corrections, holds');

  // Setup.
  for (const [section, text] of [['products', 'Batch prefix'], ['pack-sizes', '45 g bar'], ['outputs', 'Nibs for liquor'], ['containers', 'Husk bin'], ['routes', 'Beans to liquor'], ['suppliers', 'Kuapa Kokoo'], ['users', 'Current user'], ['alerts', 'Variance limit per station']]) {
    await page.goto(`${BASE}/setup/${section}`);
    await expectText(page, text);
  }
  await page.goto(`${BASE}/setup/users`);
  await page.getByRole('button', { name: 'Use Ama' }).click();
  await page.goto(`${BASE}/setup/alerts`);
  await page.getByLabel('Winnowing variance limit').fill('0.1');
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
  await page.goto(`${BASE}/production/batches/CB-026/record/sorting`);
  await page.getByRole('button', { name: 'Save sorting' }).waitFor();
  overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error('Horizontal overflow on mobile record page');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screen-mobile-record.png`, fullPage: true });
  ok('mobile layout: bottom navigation, no overflow');

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
  await page.getByRole('link', { name: /Record Sorting for/ }).waitFor();
  if ((await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link').count()) !== 2) throw new Error('Operators should see only My work and Production line');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screen-my-work.png`, fullPage: true });
  ok('operator PIN sign-in lands on My work with a two-item menu');

  console.log(JSON.stringify({ checked, errors }, null, 2));
  await browser.close();
  if (errors.length) process.exit(1);
})().catch((error) => { console.error(error); process.exit(1); });
