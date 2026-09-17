// End-to-end browser check for the production system.
// Run with the dev server on http://127.0.0.1:3100:  node browser-check.cjs
const { chromium } = require('@playwright/test');

const BASE = 'http://127.0.0.1:3100';
const SCREENSHOT_DIR = 'C:/Users/hp/Documents/Codex/2026-09-14/we/work/chocolate-checks';
const STATIONS = ['receiving', 'roasting', 'winnowing', 'grinding', 'pressing', 'mixing', 'refining', 'conching', 'tempering', 'moulding', 'packaging', 'completion'];
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

  // Login: the app is gated behind a standard email + password sign-in.
  await page.getByRole('heading', { name: 'Enter your workspace' }).waitFor();
  if (await page.getByRole('navigation', { name: 'Main navigation' }).count()) throw new Error('App shell visible before sign-in');
  await page.getByLabel('Email').fill('alex.morgan@cocoafactory.example');
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('alert').filter({ hasText: 'Invalid credentials' }).waitFor();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screen-login.png` });
  await page.getByLabel('Password', { exact: true }).fill('cocoa123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'Which batch needs attention?' }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'Which batch needs attention?' }).waitFor(); // session survives a reload
  ok('login screen: rejects wrong password, signs in, session persists');

  // Sidebar: six destinations, active state, counts, no "All screens".
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  for (const label of ['Overview', 'Production line', 'Materials', 'Recipes', 'Reports', 'Setup']) await nav.getByRole('link', { name: label }).waitFor();
  if (await nav.getByText('All screens').count()) throw new Error('"All screens" link still present');
  const active = await nav.locator('[aria-current="page"]').innerText();
  if (!active.includes('Production line')) throw new Error(`Expected Production line active, got ${active}`);
  if (!(await nav.getByLabel(/batches$/).innerText()).match(/\d/)) throw new Error('Active batch count missing');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screen-production.png`, fullPage: true });
  ok('sidebar navigation, active state and counts');

  // Active batch rows show batch, product, current station, next step and Continue.
  await expectText(page, 'CB-025');
  await expectText(page, 'Current station');
  await expectText(page, 'Next step');
  await page.getByRole('link', { name: 'Continue CB-025' }).waitFor();
  ok('active batch rows');

  // Each part of the line has its own sidebar entry and page; the production page itself stays short.
  const PARTS = { 'bean-processing': ['receiving', 'roasting', 'winnowing', 'grinding'], pressing: ['pressing'], 'chocolate-making': ['mixing', 'refining', 'conching', 'tempering'], finishing: ['moulding', 'packaging', 'completion'] };
  const sidebarParts = page.getByRole('group', { name: 'Parts of the production line' });
  for (const [slug, ids] of Object.entries(PARTS)) {
    const label = slug === 'pressing' ? 'Pressing' : slug === 'finishing' ? 'Finishing' : slug === 'bean-processing' ? 'Bean processing' : 'Chocolate making';
    await page.goto(`${BASE}/production`);
    await sidebarParts.getByRole('link', { name: new RegExp(`^\\d\\s*${label}`) }).click();
    await page.waitForURL(`**/production/parts/${slug}`);
    await page.getByRole('heading', { level: 1, name: label, exact: true }).waitFor();
    await sidebarParts.locator('[aria-current="page"]').filter({ hasText: label }).waitFor();
    if ((await page.getByRole('link', { name: /Open station/ }).count()) !== ids.length) throw new Error(`${label} should list ${ids.length} stations`);
    // Every station in the part opens its queue directly.
    for (const id of ids) {
      await page.goto(`${BASE}/production/parts/${slug}`);
      await page.getByRole('link', { name: new RegExp(`^\\d\\d\\s*${id.charAt(0).toUpperCase() + id.slice(1)}\\b`) }).click();
      await page.waitForURL(`**/production/stations/${id}`);
      await page.getByRole('heading', { level: 1 }).waitFor();
    }
  }
  await page.goto(`${BASE}/production/parts/pressing`);
  await expectText(page, 'Branch from grinding');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screen-part-pressing.png`, fullPage: true });
  await page.goto(`${BASE}/production`);
  if (await page.getByRole('link', { name: /Open station/ }).count()) throw new Error('Production page should not list stations (long scroll)');
  ok('four parts as sidebar entries with their own pages; all 12 stations open their queues');

  // Winnowing: exact worked example.
  await page.goto(`${BASE}/production/stations/winnowing`);
  await page.getByRole('link', { name: /CB-025/ }).click();
  await page.waitForURL('**/production/batches/CB-025/record/winnowing');
  await expectText(page, 'Roasted beans');
  await expectText(page, '92.40 kg');
  await page.getByRole('button', { name: 'Confirm input' }).click();
  for (const [name, value] of [['Nibs', '72'], ['Whole peeled beans', '5'], ['Husks', '13.8'], ['Unusable beans', '1.1']]) await page.getByRole('spinbutton', { name, exact: true }).fill(value);
  await expectText(page, '91.90 kg of 92.40 kg');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screen-record-winnowing.png`, fullPage: true });
  await page.getByRole('button', { name: 'Save measurements' }).click();
  await page.getByText('Winnowing saved.').waitFor();
  const balance = await page.locator('main').innerText();
  const expected = [['Measured output', '91.90 kg'], ['Useful output', '77.00 kg'], ['Recorded waste / by-product', '14.90 kg'], ['Unaccounted variance', '0.50 kg'], ['Material accounted for', '99.46%'], ['Variance', '0.54%'], ['Yield', '83.33%']];
  for (const [label, value] of expected) {
    const re = new RegExp(`${label.replace(/[/]/g, '\\/')}\\s*\\n?\\s*${value.replace('.', '\\.')}`);
    if (!re.test(balance)) throw new Error(`Balance missing "${label} ${value}"`);
  }
  ok('winnowing mass balance example (91.90 / 77.00 / 14.90 / 0.50 / 99.46% / 0.54%)');

  // Destinations: split outputs stay separate; nibs continue, peeled beans to rework, husks stored.
  await page.getByLabel('Whole peeled beans destination').selectOption('rework');
  await page.getByLabel('Husks destination').selectOption('stock');
  await page.getByRole('button', { name: 'Save destinations' }).click();
  await page.getByText('72.00 kg nibs available. Record grinding.').waitFor();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screen-winnowing-saved.png`, fullPage: true });
  await page.getByRole('link', { name: /Record grinding/ }).click();
  await page.waitForURL('**/record/grinding');
  await expectText(page, '72.00 kg'); // only nibs became the grinding input
  ok('destinations saved, only continued output becomes next input');

  // Grinding → pressing branch, custom output row.
  await page.getByRole('button', { name: 'Confirm input' }).click();
  await page.getByRole('spinbutton', { name: 'Liquor', exact: true }).fill('70.9');
  await page.getByRole('button', { name: 'Add another output' }).click();
  await page.getByLabel('Output 5 name').fill('Screen residue');
  await page.getByLabel('Output 5 type').selectOption('waste');
  await page.getByLabel('Output 5 weight').fill('0.4');
  await page.getByRole('button', { name: 'Save measurements' }).click();
  await page.getByText('Grinding saved.').waitFor();
  await page.getByLabel('Liquor destination').selectOption('continue:pressing');
  await page.getByRole('button', { name: 'Save destinations' }).click();
  await page.getByText('Record pressing.').waitFor();
  await page.getByRole('link', { name: /Record pressing/ }).click();
  await page.getByRole('button', { name: 'Confirm input' }).click();
  await page.getByRole('spinbutton', { name: 'Cocoa butter', exact: true }).fill('32.1');
  await page.getByRole('spinbutton', { name: 'Cocoa cake', exact: true }).fill('38.2');
  await page.getByRole('button', { name: 'Save measurements' }).click();
  await page.getByText('Pressing saved.').waitFor();
  await page.getByLabel('Cocoa butter destination').selectOption('stock');
  await page.getByRole('button', { name: 'Save destinations' }).click();
  await page.getByText('Complete the batch.').waitFor();
  ok('grinding → pressing branch with custom output row, butter and cake split');

  // Batch timeline shows completed stations, next station, outputs, destinations, variance.
  await page.goto(`${BASE}/production/batches/CB-025`);
  await page.getByRole('heading', { name: 'Batch timeline' }).waitFor();
  for (const t of ['Receiving', 'Roasting', 'Winnowing', 'Grinding', 'Pressing', 'Store as lot', 'Rework', 'Variance 0.50 kg (0.54%)', 'Completion']) await expectText(page, t);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screen-batch-timeline.png`, fullPage: true });
  // Correction and hold.
  await page.getByRole('button', { name: 'Add correction' }).click();
  await page.getByLabel('Recorded output').selectOption({ label: 'Winnowing · Husks (13.80 kg)' });
  await page.getByLabel('Corrected weight').fill('13.7');
  await page.getByLabel('Correction reason').fill('Bin tare was wrong.');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expectText(page, 'Corrected Husks: 13.80 → 13.70 kg');
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
  ok('batch timeline, correction, hold/release, completion');

  // Batch-first process list exposes later stations for independent entry.
  await page.goto(`${BASE}/production/batches/CH-018`);
  await expectText(page, 'Process weights');
  await page.getByRole('link', { name: /Enter Packaging weights independently for CH-018/ }).waitFor();

  // Chocolate finishing: moulding → packaging → completion.
  await page.goto(`${BASE}/production/stations/moulding`);
  await page.getByRole('link', { name: /CH-018/ }).click();
  await page.getByRole('button', { name: 'Confirm input' }).click();
  await page.getByRole('spinbutton', { name: 'Finished chocolate', exact: true }).fill('94.8');
  await page.getByRole('spinbutton', { name: 'Recoverable chocolate', exact: true }).fill('1.2');
  await page.getByRole('button', { name: 'Save measurements' }).click();
  await page.getByText('Moulding saved.').waitFor();
  await page.getByRole('button', { name: 'Save destinations' }).click();
  await page.getByText('94.80 kg finished chocolate available. Record packaging.').waitFor();
  await page.getByRole('link', { name: /Record packaging/ }).click();
  await page.getByRole('button', { name: 'Confirm input' }).click();
  await page.getByLabel('Pack size').selectOption({ label: '45 g bar' });
  await page.getByLabel('Total units made').fill('2090');
  await page.getByLabel('Rejected units').fill('14');
  await expectText(page, '2076');
  await page.getByRole('button', { name: 'Save packaging' }).click();
  await page.getByText('Packaging saved.').waitFor();
  await page.getByRole('button', { name: 'Save destinations' }).click();
  await page.getByText('2076 accepted units ready. Complete the batch.').waitFor();
  await page.getByRole('link', { name: /Review & complete batch/ }).click();
  await expectText(page, '2076 × 45 g');
  await page.getByRole('button', { name: 'Complete batch' }).click();
  await page.waitForURL('**/production/batches/CH-018');
  ok('moulding, packaging (accepted units calculated), completion');

  // New batch starts from the scale; source-lot selection is intentionally not shown here.
  await page.goto(`${BASE}/production/new`);
  if (await page.getByLabel(/Cocoa beans lot/).count()) throw new Error('Cocoa bean lot selector should not appear on the new batch screen');
  await page.getByLabel('Starting weight').fill('50');
  await page.getByRole('button', { name: /Create batch and record receiving/ }).click();
  await page.waitForURL('**/production/batches/CB-026/record/receiving');
  await expectText(page, '50.00 kg');
  ok('new batch uses the scale weight without a source-lot selector');

  // Materials: lots, traceability, receive.
  await page.goto(`${BASE}/materials`);
  await page.getByRole('link', { name: /LIQ-024/ }).click();
  await page.getByRole('heading', { name: 'Traceability' }).waitFor();
  for (const t of ['CB-024', 'BEAN-0905', 'CL-007']) await expectText(page, t);
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
  for (const [section, text] of [['products', 'Batch prefix'], ['pack-sizes', '45 g bar'], ['outputs', 'Whole peeled beans'], ['routes', 'Beans to liquor'], ['suppliers', 'Kuapa Kokoo'], ['users', 'Current user'], ['alerts', 'Variance limit per station']]) {
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
  await page.goto(`${BASE}/production/batches/CB-026/record/receiving`);
  await page.getByRole('button', { name: 'Confirm input' }).click();
  overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error('Horizontal overflow on mobile record page');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screen-mobile-record.png`, fullPage: true });
  ok('mobile layout: bottom navigation, no overflow');

  // Sign out returns to the login screen (mobile header button), and the login screen fits a phone.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('heading', { name: 'Enter your workspace' }).waitFor();
  overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error('Horizontal overflow on mobile login page');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screen-login-mobile.png`, fullPage: true });
  ok('sign out returns to login; mobile login layout');

  console.log(JSON.stringify({ checked, errors }, null, 2));
  await browser.close();
  if (errors.length) process.exit(1);
})().catch((error) => { console.error(error); process.exit(1); });
