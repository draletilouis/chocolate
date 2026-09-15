// End-to-end interaction audit for the local Chocolate Factory demo.
// Run with the dev server on http://127.0.0.1:3100:
//   $env:AUDIT_PHASE='before'; node interaction-audit.cjs
//   $env:AUDIT_PHASE='after';  node interaction-audit.cjs
//
// Every recorded action captures the visible state before and after the click,
// plus a screenshot pair and the time taken for the resulting UI to settle.
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const BASE = 'http://127.0.0.1:3100';
const phase = process.env.AUDIT_PHASE || 'run';
const OUT = path.resolve('C:/Users/hp/Documents/Codex/2026-09-14/we/outputs/interaction-audit', phase);
fs.mkdirSync(OUT, { recursive: true });

const records = [];
let step = 0;

function safeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
}

async function visibleState(page) {
  const text = await page.locator('body').innerText().catch(() => '');
  const buttons = await page.locator('button').allTextContents().catch(() => []);
  return {
    url: page.url(),
    title: await page.title().catch(() => ''),
    text: text.replace(/\s+/g, ' ').trim().slice(0, 900),
    buttons: buttons.map((b) => b.trim()).filter(Boolean).slice(0, 20),
  };
}

async function action(page, label, target, settle) {
  const id = String(++step).padStart(3, '0');
  const slug = safeName(label);
  const before = await visibleState(page);
  await page.screenshot({ path: path.join(OUT, `${id}-${slug}-before.png`), fullPage: true });
  const started = performance.now();
  await target.click();
  if (settle) await settle();
  await page.waitForTimeout(25);
  const elapsedMs = Math.round(performance.now() - started);
  const after = await visibleState(page);
  await page.screenshot({ path: path.join(OUT, `${id}-${slug}-after.png`), fullPage: true });
  records.push({ id: Number(id), label, elapsedMs, before, after,
    beforeScreenshot: `${id}-${slug}-before.png`, afterScreenshot: `${id}-${slug}-after.png` });
}

async function waitForText(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout: 10000 });
}

async function waitForUrl(page, pattern) {
  await page.waitForURL(pattern, { timeout: 10000 });
}

async function signIn(page) {
  await page.goto(`${BASE}/production`);
  await page.evaluate(() => { localStorage.clear(); });
  await page.goto(`${BASE}/production`);
  await page.getByRole('heading', { name: 'Enter your workspace' }).waitFor();
  await page.getByLabel('Email').fill('alex.morgan@cocoafactory.example');
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await action(page, 'Sign in — invalid credentials', page.getByRole('button', { name: 'Sign in' }), async () => {
    await page.getByRole('alert').filter({ hasText: 'Invalid credentials' }).waitFor();
  });
  await action(page, 'Forgot password help', page.getByRole('button', { name: 'Forgot password?' }), async () => {
    await waitForText(page, 'Ask the production manager');
  });
  await action(page, 'Show password', page.getByRole('button', { name: 'Show password' }), async () => {
    await page.getByLabel('Password', { exact: true }).waitFor();
  });
  await page.getByLabel('Password', { exact: true }).fill('cocoa123');
  await action(page, 'Sign in — valid credentials', page.getByRole('button', { name: 'Sign in' }), async () => {
    await page.getByRole('heading', { name: 'Which batch needs attention?' }).waitFor();
  });
}

async function productionLine(page) {
  const parts = [
    ['Bean processing', 'bean-processing'],
    ['Pressing', 'pressing'],
    ['Chocolate making', 'chocolate-making'],
    ['Finishing', 'finishing'],
  ];
  for (let i = 0; i < parts.length; i += 1) {
    const [name, slug] = parts[i];
    await page.goto(`${BASE}/production`);
    await action(page, `Open part ${i + 1} — ${name}`, page.locator('main').getByRole('link', { name: new RegExp(`${name}.*Open part`, 'i') }), async () => {
      await waitForUrl(page, `**/production/parts/${slug}`);
    });
  }
  await page.goto(`${BASE}/production`);
  await action(page, 'Open new batch', page.getByRole('link', { name: 'New batch' }), async () => {
    await waitForUrl(page, '**/production/new');
  });
  await action(page, 'Cancel new batch', page.getByRole('link', { name: 'Cancel' }), async () => {
    await waitForUrl(page, '**/production');
  });
}

async function beanAndPressingFlow(page) {
  await page.goto(`${BASE}/production/stations/winnowing`);
  await action(page, 'Choose CB-025 for winnowing', page.getByRole('link', { name: /CB-025/ }), async () => {
    await waitForUrl(page, '**/production/batches/CB-025/record/winnowing');
  });
  await action(page, 'Confirm winnowing input', page.getByRole('button', { name: 'Confirm input' }), async () => {
    await page.getByRole('spinbutton', { name: 'Nibs', exact: true }).waitFor();
  });
  for (const [name, value] of [['Nibs', '72'], ['Whole peeled beans', '5'], ['Husks', '13.8'], ['Unusable beans', '1.1']]) {
    await page.getByRole('spinbutton', { name, exact: true }).fill(value);
  }
  await action(page, 'Save winnowing measurements', page.getByRole('button', { name: 'Save measurements' }), async () => {
    await waitForText(page, 'Winnowing saved.');
  });
  await page.getByLabel('Whole peeled beans destination').selectOption('rework');
  await page.getByLabel('Husks destination').selectOption('stock');
  await action(page, 'Save winnowing destinations', page.getByRole('button', { name: 'Save destinations' }), async () => {
    await waitForText(page, 'Record grinding.');
  });
  await action(page, 'Continue to grinding', page.getByRole('link', { name: /Record grinding/ }), async () => {
    await waitForUrl(page, '**/record/grinding');
  });
  await action(page, 'Confirm grinding input', page.getByRole('button', { name: 'Confirm input' }), async () => {
    await page.getByRole('spinbutton', { name: 'Liquor', exact: true }).waitFor();
  });
  await page.getByRole('spinbutton', { name: 'Liquor', exact: true }).fill('70.9');
  await action(page, 'Add a custom grinding output', page.getByRole('button', { name: 'Add another output' }), async () => {
    await page.getByLabel('Output 5 name').waitFor();
  });
  await page.getByLabel('Output 5 name').fill('Screen residue');
  await page.getByLabel('Output 5 type').selectOption('waste');
  await page.getByLabel('Output 5 weight').fill('0.4');
  await action(page, 'Remove custom grinding output', page.getByRole('button', { name: 'Remove output' }).last(), async () => {
    await page.getByLabel('Output 5 name').waitFor({ state: 'detached' });
  });
  await action(page, 'Add custom grinding output again', page.getByRole('button', { name: 'Add another output' }), async () => {
    await page.getByLabel('Output 5 name').waitFor();
  });
  await page.getByLabel('Output 5 name').fill('Screen residue');
  await page.getByLabel('Output 5 type').selectOption('waste');
  await page.getByLabel('Output 5 weight').fill('0.4');
  await action(page, 'Save grinding measurements', page.getByRole('button', { name: 'Save measurements' }), async () => {
    await waitForText(page, 'Grinding saved.');
  });
  await page.getByLabel('Liquor destination').selectOption('continue:pressing');
  await action(page, 'Save grinding destinations', page.getByRole('button', { name: 'Save destinations' }), async () => {
    await waitForText(page, 'Record pressing.');
  });
  await action(page, 'Continue to pressing', page.getByRole('link', { name: /Record pressing/ }), async () => {
    await waitForUrl(page, '**/record/pressing');
  });
  await action(page, 'Confirm pressing input', page.getByRole('button', { name: 'Confirm input' }), async () => {
    await page.getByRole('spinbutton', { name: 'Cocoa butter', exact: true }).waitFor();
  });
  await page.getByRole('spinbutton', { name: 'Cocoa butter', exact: true }).fill('32.1');
  await page.getByRole('spinbutton', { name: 'Cocoa cake', exact: true }).fill('38.2');
  await action(page, 'Save pressing measurements', page.getByRole('button', { name: 'Save measurements' }), async () => {
    await waitForText(page, 'Pressing saved.');
  });
  await page.getByLabel('Cocoa butter destination').selectOption('stock');
  await action(page, 'Save pressing destinations', page.getByRole('button', { name: 'Save destinations' }), async () => {
    await waitForText(page, 'Complete the batch.');
  });
}

async function batchControls(page) {
  await page.goto(`${BASE}/production/batches/CB-025`);
  await action(page, 'Open correction form', page.getByRole('button', { name: 'Add correction' }), async () => {
    await page.getByLabel('Recorded output').waitFor();
  });
  await page.getByLabel('Recorded output').selectOption({ label: 'Winnowing · Husks (13.80 kg)' });
  await page.getByLabel('Corrected weight').fill('13.7');
  await page.getByLabel('Correction reason').fill('Bin tare was wrong.');
  await action(page, 'Save correction', page.getByRole('button', { name: 'Save correction' }), async () => {
    await waitForText(page, 'Corrected Husks: 13.80 → 13.70 kg');
  });
  await action(page, 'Open hold form', page.getByRole('button', { name: 'Put on hold' }), async () => {
    await page.getByLabel('Hold reason').waitFor();
  });
  await page.getByLabel('Hold reason').fill('Waiting for quality sign-off.');
  await action(page, 'Place batch on hold', page.getByRole('button', { name: 'Place hold' }), async () => {
    await waitForText(page, 'On hold');
  });
  await action(page, 'Open release form', page.getByRole('button', { name: 'Release hold' }), async () => {
    await page.getByLabel('Release note').waitFor();
  });
  await page.getByLabel('Release note').fill('Approved.');
  await action(page, 'Release batch hold', page.getByRole('button', { name: 'Release', exact: true }), async () => {
    await page.getByRole('link', { name: /Review & complete/ }).waitFor();
  });
  await action(page, 'Review completion', page.getByRole('link', { name: /Review & complete/ }).first(), async () => {
    await waitForUrl(page, '**/record/completion');
  });
  await action(page, 'Complete CB-025', page.getByRole('button', { name: 'Complete batch' }), async () => {
    await waitForUrl(page, '**/production/batches/CB-025');
    await waitForText(page, 'Completed');
  });
}

async function chocolateFinishingFlow(page) {
  await page.goto(`${BASE}/production/stations/moulding`);
  await action(page, 'Choose CH-018 for moulding', page.getByRole('link', { name: /CH-018/ }), async () => {
    await waitForUrl(page, '**/production/batches/CH-018/record/moulding');
  });
  await action(page, 'Confirm moulding input', page.getByRole('button', { name: 'Confirm input' }), async () => {
    await page.getByRole('spinbutton', { name: 'Finished chocolate', exact: true }).waitFor();
  });
  await page.getByRole('spinbutton', { name: 'Finished chocolate', exact: true }).fill('94.8');
  await page.getByRole('spinbutton', { name: 'Recoverable chocolate', exact: true }).fill('1.2');
  await action(page, 'Save moulding measurements', page.getByRole('button', { name: 'Save measurements' }), async () => {
    await waitForText(page, 'Moulding saved.');
  });
  await action(page, 'Save moulding destinations', page.getByRole('button', { name: 'Save destinations' }), async () => {
    await waitForText(page, 'Record packaging.');
  });
  await action(page, 'Continue to packaging', page.getByRole('link', { name: /Record packaging/ }), async () => {
    await waitForUrl(page, '**/record/packaging');
  });
  await action(page, 'Confirm packaging input', page.getByRole('button', { name: 'Confirm input' }), async () => {
    await page.getByLabel('Pack size').waitFor();
  });
  await page.getByLabel('Pack size').selectOption({ label: '45 g bar' });
  await page.getByLabel('Total units made').fill('2090');
  await page.getByLabel('Rejected units').fill('14');
  await action(page, 'Save packaging counts', page.getByRole('button', { name: 'Save packaging' }), async () => {
    await waitForText(page, 'Packaging saved.');
  });
  await action(page, 'Save packaging destinations', page.getByRole('button', { name: 'Save destinations' }), async () => {
    await waitForText(page, 'Review & complete batch.');
  });
  await action(page, 'Review CH-018 completion', page.getByRole('link', { name: /Review & complete batch/ }), async () => {
    await waitForUrl(page, '**/record/completion');
  });
  await action(page, 'Complete CH-018', page.getByRole('button', { name: 'Complete batch' }), async () => {
    await waitForUrl(page, '**/production/batches/CH-018');
    await waitForText(page, 'Completed');
  });
}

async function materialsAndRecipes(page) {
  await page.goto(`${BASE}/materials`);
  await action(page, 'Filter finished goods', page.getByRole('button', { name: 'Finished goods' }), async () => {
    await waitForText(page, 'FIN-0001');
  });
  await page.goto(`${BASE}/materials/receive`);
  await page.getByLabel('Measured weight').fill('120');
  await action(page, 'Save material receipt', page.getByRole('button', { name: 'Save receipt' }), async () => {
    await waitForUrl(page, '**/materials/BEAN-*');
    await waitForText(page, 'Kuapa Kokoo');
  });

  await page.goto(`${BASE}/recipes/R-70`);
  await action(page, 'Open new recipe version', page.getByRole('button', { name: 'New version' }), async () => {
    await page.getByText('New version v4').waitFor();
  });
  await action(page, 'Add recipe ingredient row', page.getByRole('button', { name: '+ Add ingredient' }), async () => {
    await page.getByLabel('Ingredient 5').waitFor();
  });
  await page.getByLabel('Ingredient 5').fill('Vanilla');
  await page.getByLabel('Ingredient 5 percent').fill('0');
  await page.getByLabel('What changed?').fill('Demo audit version.');
  await action(page, 'Save recipe version', page.getByRole('button', { name: 'Save version' }), async () => {
    await waitForText(page, 'v4');
  });
}

async function setupControls(page) {
  const forms = [
    ['products', 'Add product', [['Name', 'Audit product'], ['Batch prefix', 'AU']], 'Add product'],
    ['pack-sizes', 'Add pack size', [['Name', '60 g bar'], ['Grams per unit', '60']], 'Add pack size'],
    ['outputs', 'Add output row', [['Output name', 'Audit residue']], 'Add output row'],
    ['suppliers', 'Add supplier', [['Name', 'Audit supplier'], ['Supplies', 'Cocoa beans'], ['Contact', 'audit@example.com']], 'Add supplier'],
    ['users', 'Add user', [['Name', 'Audit User'], ['Role', 'Operator'], ['Email', 'audit.user@cocoafactory.example'], ['Password', 'cocoa123']], 'Add user'],
  ];
  for (const [section, openLabel, fields, title] of forms) {
    await page.goto(`${BASE}/setup/${section}`);
    await action(page, `Open ${title} form`, page.getByRole('button', { name: openLabel }), async () => {
      await page.getByRole('button', { name: 'Cancel' }).waitFor();
    });
    for (const [label, value] of fields) await page.getByLabel(label, { exact: true }).fill(value);
    if (section === 'products') {
      await page.getByLabel('Route').selectOption('beans');
      await page.getByLabel('Recipe (chocolate only)').selectOption('');
    }
    if (section === 'outputs') {
      await page.getByLabel('Station').selectOption('winnowing');
      await page.getByLabel('Type').selectOption('waste');
    }
    await action(page, `Save ${title}`, page.getByRole('button', { name: 'Add', exact: true }), async () => {
      await page.getByText(fields[0][1], { exact: false }).first().waitFor();
    });
  }
  await page.goto(`${BASE}/setup/users`);
  await action(page, 'Switch recording user to Ama', page.getByRole('button', { name: 'Use Ama' }), async () => {
    await page.getByText('Current user').waitFor();
  });
}

async function navigationAndFilters(page) {
  for (const [label, url, text] of [
    ['Overview', '/overview', 'How production is doing'],
    ['Production line', '/production', 'Which batch needs attention?'],
    ['Materials', '/materials', 'Material lots'],
    ['Recipes', '/recipes', 'Recipes'],
    ['Reports', '/reports', 'Reports'],
    ['Setup', '/setup', 'Setup'],
  ]) {
    await page.goto(`${BASE}${url}`);
    await waitForText(page, text);
  }
  await page.goto(`${BASE}/reports/losses`);
  await page.getByLabel('Station filter').selectOption('winnowing');
  await waitForText(page, 'Winnowing');
  await page.goto(`${BASE}/reports/variance`);
  await page.getByLabel('Batch to follow').selectOption('CB-025');
  await waitForText(page, 'CB-025');
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await signIn(page);
    await productionLine(page);
    await beanAndPressingFlow(page);
    await batchControls(page);
    await chocolateFinishingFlow(page);
    await materialsAndRecipes(page);
    await setupControls(page);
    await navigationAndFilters(page);
    await page.goto(`${BASE}/production`);
    await action(page, 'Sign out', page.getByRole('button', { name: 'Sign out' }).last(), async () => {
      await page.getByRole('heading', { name: 'Enter your workspace' }).waitFor();
    });
    const report = { phase, generatedAt: new Date().toISOString(), totalActions: records.length, errors, records };
    fs.writeFileSync(path.join(OUT, 'interaction-audit.json'), JSON.stringify(report, null, 2));
    const lines = [
      `# Chocolate Factory interaction audit (${phase})`,
      '',
      `Generated: ${report.generatedAt}`,
      `Recorded actions: ${report.totalActions}`,
      `Console/page errors: ${errors.length}`,
      '',
      '| # | Control | ms | Before | After |',
      '|---:|---|---:|---|---|',
      ...records.map((r) => `| ${r.id} | ${r.label} | ${r.elapsedMs} | ${r.before.url.replace(BASE, '')} | ${r.after.url.replace(BASE, '')} |`),
      '',
      'Each action has paired before/after PNGs in this folder. The audit intentionally does not accept the destructive “Reset sample data” confirmation.',
    ];
    fs.writeFileSync(path.join(OUT, 'interaction-audit.md'), lines.join('\n'));
    console.log(JSON.stringify({ phase, totalActions: records.length, errors, output: OUT, durationsMs: records.map((r) => r.elapsedMs) }, null, 2));
    if (errors.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
