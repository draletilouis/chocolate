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
  await page.getByRole('heading', { name: 'Who is recording?' }).waitFor();
  await action(page, 'Choose a name to sign in', page.getByRole('button', { name: 'Sign in as Alex Morgan' }), async () => {
    await waitForText(page, 'Enter your PIN');
  });
  for (const digit of '111') await page.getByRole('button', { name: digit, exact: true }).click();
  await action(page, 'Enter a wrong PIN', page.getByRole('button', { name: '1', exact: true }), async () => {
    await page.getByRole('alert').filter({ hasText: 'Wrong PIN' }).waitFor();
  });
  await action(page, 'Back to the names', page.getByRole('button', { name: 'Back', exact: true }), async () => {
    await page.getByRole('heading', { name: 'Who is recording?' }).waitFor();
  });
  await action(page, 'Use email and password instead', page.getByRole('button', { name: 'Sign in with email and password' }), async () => {
    await page.getByLabel('Email').waitFor();
  });
  await page.getByLabel('Email').fill('alex.morgan@cocoafactory.example');
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await action(page, 'Sign in — invalid credentials', page.getByRole('button', { name: 'Sign in', exact: true }), async () => {
    await page.getByRole('alert').filter({ hasText: 'Invalid credentials' }).waitFor();
  });
  await action(page, 'Show password', page.getByRole('button', { name: 'Show password' }), async () => {
    await page.getByLabel('Password', { exact: true }).waitFor();
  });
  await page.getByLabel('Password', { exact: true }).fill('cocoa123');
  await action(page, 'Sign in — valid credentials', page.getByRole('button', { name: 'Sign in', exact: true }), async () => {
    await page.getByRole('heading', { name: 'Which batch needs attention?' }).waitFor();
  });
}

async function productionLine(page) {
  const parts = [
    ['Bean processing', 'bean-processing'],
    ['Butter & powder', 'butter-powder'],
    ['Liquor', 'liquor'],
    ['Chocolate making', 'chocolate-making'],
    ['Finishing', 'finishing'],
  ];
  for (let i = 0; i < parts.length; i += 1) {
    const [name, slug] = parts[i];
    await page.goto(`${BASE}/production`);
    await action(page, `Open part ${i + 1} — ${name}`, page.locator('main').getByRole('link', { name: new RegExp(`^\\d+\\s*${name}\\b.*Open part`, 'i') }), async () => {
      await waitForUrl(page, `**/production/parts/${slug}`);
    });
  }
  await page.goto(`${BASE}/production`);
  await action(page, 'Open new batch', page.getByRole('link', { name: 'New batch' }), async () => {
    await waitForUrl(page, '**/production/new');
  });
  await action(page, 'Leave the delivery form', page.getByRole('link', { name: 'My work' }).last(), async () => {
    await waitForUrl(page, '**/work');
  });
}

async function beanAndPressingFlow(page) {
  await page.goto(`${BASE}/production/stations/winnowing`);
  await action(page, 'Choose CB-025 for winnowing', page.getByRole('link', { name: /CB-025/ }), async () => {
    await waitForUrl(page, '**/production/batches/CB-025/record/winnowing');
    await page.getByRole('spinbutton', { name: 'Nibs for liquor', exact: true }).waitFor();
  });
  await action(page, 'Change the input weight', page.getByRole('button', { name: 'Reweighed? Change' }), async () => {
    await page.getByRole('spinbutton', { name: 'Input weight', exact: true }).waitFor();
  });
  for (const [name, value] of [['Nibs for liquor', '50'], ['Nibs for butter', '20'], ['Nibs for sale', '4'], ['Husks', '15.9']]) {
    await page.getByRole('spinbutton', { name, exact: true }).fill(value);
  }
  await action(page, 'Add a note', page.getByRole('button', { name: 'Add a note' }), async () => {
    await page.getByLabel('Note').waitFor();
  });
  await action(page, 'Save winnowing', page.getByRole('button', { name: 'Save winnowing' }), async () => {
    await waitForText(page, 'Winnowing saved.');
    await waitForText(page, 'Liquor grinding also waiting');
  });
  await action(page, 'Show balance details', page.getByRole('button', { name: 'Show details' }), async () => {
    await waitForText(page, 'Missing weight');
  });
  await action(page, 'Continue to pressing', page.getByRole('link', { name: /Record pressing/ }), async () => {
    await waitForUrl(page, '**/record/pressing');
    await page.getByRole('spinbutton', { name: 'Brown butter', exact: true }).waitFor();
  });
  await page.getByRole('spinbutton', { name: 'Brown butter', exact: true }).fill('9');
  await page.getByRole('spinbutton', { name: 'Cocoa cake (powder)', exact: true }).fill('10.8');
  await action(page, 'Add a custom pressing output', page.getByRole('button', { name: 'Add another output' }), async () => {
    await page.getByLabel('Output 4 name').waitFor();
  });
  await page.getByLabel('Output 4 name').fill('Temporary row');
  await action(page, 'Remove custom pressing output', page.getByRole('button', { name: 'Remove output' }).last(), async () => {
    if (await page.getByLabel('Output 4 name').count()) throw new Error('Custom output was not removed');
  });
  await action(page, 'Add custom pressing output again', page.getByRole('button', { name: 'Add another output' }), async () => {
    await page.getByLabel('Output 4 name').waitFor();
  });
  await page.getByLabel('Output 4 name').fill('Screen residue');
  await page.getByLabel('Output 4 type').selectOption('waste');
  await page.getByLabel('Output 4 weight', { exact: true }).fill('0.1');
  await page.getByLabel('Brown butter destination').selectOption('stock');
  await page.getByLabel('Cocoa cake (powder) destination').selectOption('sale');
  await action(page, 'Save pressing', page.getByRole('button', { name: 'Save pressing' }), async () => {
    await waitForText(page, 'Pressing saved.');
  });
  await action(page, 'Continue to liquor grinding', page.getByRole('link', { name: /Record liquor grinding/ }), async () => {
    await waitForUrl(page, '**/record/grinding');
    await page.getByRole('spinbutton', { name: 'Liquor', exact: true }).waitFor();
  });
  await page.getByRole('spinbutton', { name: 'Liquor', exact: true }).fill('49.8');
  await action(page, 'Save liquor grinding', page.getByRole('button', { name: 'Save liquor grinding' }), async () => {
    await waitForText(page, 'Sent on: 49.80 kg liquor to mixing.');
    await waitForText(page, 'Liquor label');
  });
  await action(page, 'Continue to mixing', page.getByRole('link', { name: /Record mixing/ }), async () => {
    await waitForUrl(page, '**/record/mixing');
    await waitForText(page, 'The mixer holds');
  });
  await page.getByLabel('Chocolate type', { exact: true }).selectOption({ label: '70% Dark' });
  await page.getByLabel('Kg to run').fill('30');
  await waitForText(page, 'Add 16.50 kg');
  await action(page, 'Save a 70% Dark run on the 85% in the mixer', page.getByRole('button', { name: 'Save 70% Dark' }), async () => {
    await waitForText(page, 'made as lot D70-0002');
  });
  await action(page, 'Open finish mixing', page.getByRole('button', { name: 'Finish mixing' }), async () => {
    await page.getByLabel('Mixing note').waitFor();
  });
  await action(page, 'Finish mixing', page.getByRole('button', { name: 'Finish mixing' }).last(), async () => {
    await waitForText(page, 'Mixing finished.');
  });
}

async function batchControls(page) {
  await page.goto(`${BASE}/production/batches/CB-025`);
  await action(page, 'Open the winnowing step', page.getByRole('button', { name: 'Details', exact: true }).nth(3), async () => {
    await page.getByRole('button', { name: 'Correct Husks' }).waitFor();
  });
  await action(page, 'Open correction form', page.getByRole('button', { name: 'Correct Husks' }), async () => {
    await page.getByLabel('Corrected weight').waitFor();
  });
  await page.getByLabel('Corrected weight').fill('15.8');
  await page.getByLabel('Correction reason').fill('Bin tare was wrong.');
  await action(page, 'Save correction', page.getByRole('button', { name: 'Save correction' }), async () => {
    await waitForText(page, 'Corrected Husks: 15.90 → 15.80 kg');
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
    await page.getByRole('link', { name: /Review & complete/ }).first().waitFor();
  });
  await action(page, 'Review completion', page.getByRole('link', { name: /Review & complete/ }).first(), async () => {
    await waitForUrl(page, '**/record/completion');
  });
  await action(page, 'Complete CB-025', page.getByRole('button', { name: 'Complete batch' }), async () => {
    await waitForUrl(page, '**/production/batches/CB-025');
    await waitForText(page, 'Completed');
  });
}

async function chocolateFromStoreFlow(page) {
  await page.goto(`${BASE}/production/stations/mixing`);
  await action(page, 'Choose CH-018 for mixing', page.getByRole('link', { name: /CH-018/ }), async () => {
    await waitForUrl(page, '**/production/batches/CH-018/record/mixing');
    await page.getByLabel('Kg to run').waitFor();
  });
  await page.getByLabel('Chocolate type', { exact: true }).selectOption({ label: '100% Dark' });
  await page.getByLabel('Kg to run').fill('20');
  await waitForText(page, 'take the chocolate out of the mixer first');
  page.once('dialog', (d) => d.accept());
  await action(page, 'Take the leftover out of the mixer', page.getByRole('button', { name: 'Take it out of the mixer' }), async () => {
    await waitForText(page, 'The mixer is empty.');
  });
  await page.getByLabel('Chocolate type', { exact: true }).selectOption({ label: '100% Dark' });
  await page.getByLabel('Kg to run').fill('20');
  await page.getByLabel('Kept in the mixer').fill('0');
  await action(page, 'Save a 100% Dark run from an empty mixer', page.getByRole('button', { name: 'Save 100% Dark' }), async () => {
    await waitForText(page, 'made as lot D100-0001');
  });
  page.once('dialog', (d) => d.accept());
  await action(page, 'Undo the 100% Dark run', page.getByRole('button', { name: 'Undo the 100% Dark run' }), async () => {
    await waitForText(page, 'The 100% Dark run was undone.');
  });
  await page.getByLabel('Chocolate type', { exact: true }).selectOption({ label: '100% Dark' });
  await page.getByLabel('Kg to run').fill('20');
  await page.getByLabel('Kept in the mixer').fill('0');
  await action(page, 'Save the 100% Dark run again', page.getByRole('button', { name: 'Save 100% Dark' }), async () => {
    await waitForText(page, 'made as lot D100-0002');
  });
  await action(page, 'Open finish mixing for CH-018', page.getByRole('button', { name: 'Finish mixing' }), async () => {
    await page.getByLabel('Mixing note').waitFor();
  });
  await action(page, 'Finish mixing for CH-018', page.getByRole('button', { name: 'Finish mixing' }).last(), async () => {
    await waitForText(page, 'Mixing finished.');
  });
  await action(page, 'Review CH-018 completion', page.getByRole('link', { name: /Review & complete batch/ }), async () => {
    await waitForUrl(page, '**/record/completion');
  });
  await action(page, 'Complete CH-018', page.getByRole('button', { name: 'Complete batch' }), async () => {
    await waitForUrl(page, '**/production/batches/CH-018');
    await waitForText(page, 'Completed');
  });
}

async function piecesFlow(page) {
  await page.goto(`${BASE}/production/stations/packaging`);
  await action(page, 'Choose chocolate lot D70-0002 for pieces', page.getByRole('link', { name: /D70-0002/ }), async () => {
    await waitForUrl(page, '**/production/pieces/D70-0002');
  });
  await page.getByLabel('45 g bar pieces').fill('400');
  await action(page, 'Save 400 × 45 g bars', page.getByRole('button', { name: 'Save pieces' }), async () => {
    await waitForText(page, 'Pieces saved.');
  });
  page.once('dialog', (d) => d.accept());
  await action(page, 'Undo the pieces just entered', page.getByRole('button', { name: /^Undo FIN-/ }), async () => {
    await waitForText(page, '30.00 kg');
  });
  await page.getByLabel('45 g bar pieces').fill('500');
  await page.getByLabel('80 g bar pieces').fill('90');
  await action(page, 'Save 500 × 45 g and 90 × 80 g bars', page.getByRole('button', { name: 'Save pieces' }), async () => {
    await waitForText(page, '0.30 kg');
  });
  await page.goto(`${BASE}/reports/pieces`);
  await waitForText(page, 'By type and size');
}

async function planFlow(page) {
  await page.goto(`${BASE}/overview`);
  await action(page, 'Open the production plan from Overview', page.getByRole('link', { name: 'Open the plan' }), async () => {
    await waitForUrl(page, '**/plan');
    await waitForText(page, 'pieces left to make');
  });
  await action(page, 'Change the plan', page.getByRole('button', { name: 'Change the plan' }), async () => {
    await page.getByLabel('Line 1 pieces').waitFor();
  });
  await action(page, 'Add a line to the plan', page.getByRole('button', { name: 'Add a line' }), async () => {
    await page.getByLabel('Line 6 pieces').waitFor();
  });
  await action(page, 'Remove the added line', page.getByRole('button', { name: 'Remove line 6' }), async () => {
    await page.getByLabel('Line 6 pieces').waitFor({ state: 'detached' });
  });
  await action(page, 'Cancel changing the plan', page.getByRole('button', { name: 'Cancel' }), async () => {
    await page.getByRole('button', { name: 'Change the plan' }).waitFor();
  });
  await page.getByRole('button', { name: 'Change the plan' }).click();
  await page.getByLabel('Line 5 pieces').fill('450');
  await action(page, 'Save the plan', page.getByRole('button', { name: 'Save plan' }), async () => {
    await page.getByRole('button', { name: 'Change the plan' }).waitFor();
    await waitForText(page, '450');
  });
}

async function materialsAndRecipes(page) {
  await page.goto(`${BASE}/materials`);
  await action(page, 'Filter intermediate lots', page.getByRole('button', { name: 'Intermediate' }), async () => {
    await waitForText(page, 'D70-0001');
  });
  await page.goto(`${BASE}/materials/receive`);
  await page.getByLabel('Measured weight').fill('120');
  await action(page, 'Save material receipt', page.getByRole('button', { name: 'Save receipt' }), async () => {
    await waitForUrl(page, '**/materials/BEAN-*');
    await waitForText(page, 'Kuapa Kokoo');
  });

  await page.goto(`${BASE}/recipes/R-70`);
  await action(page, 'Open new recipe version', page.getByRole('button', { name: 'New version' }), async () => {
    await page.getByText('New version v2').waitFor();
  });
  await action(page, 'Add recipe ingredient row', page.getByRole('button', { name: '+ Add ingredient' }), async () => {
    await page.getByLabel('Ingredient 4', { exact: true }).waitFor();
  });
  await page.getByLabel('Ingredient 4', { exact: true }).fill('Vanilla');
  await page.getByLabel('Ingredient 4 percent').fill('0');
  await page.getByLabel('What changed?').fill('Demo audit version.');
  await action(page, 'Save recipe version', page.getByRole('button', { name: 'Save version' }), async () => {
    await waitForText(page, 'v2');
  });

  await page.goto(`${BASE}/recipes/new`);
  await page.getByLabel('Chocolate type name').fill('45% Milk');
  for (const [ingredient, percent] of [['Liquor', '15'], ['Cocoa butter', '30'], ['Sugar', '30'], ['Milk powder', '25']]) await page.getByLabel(`${ingredient} percent`).fill(percent);
  await action(page, 'Save new chocolate type', page.getByRole('button', { name: 'Save chocolate type' }), async () => {
    await waitForUrl(page, '**/recipes/R-45-MILK');
    await waitForText(page, 'Liquor 15% · Cocoa butter 30% · Sugar 30% · Milk powder 25%');
  });
}

async function setupControls(page) {
  const forms = [
    ['products', 'Add product', [['Name', 'Audit product'], ['Batch prefix', 'AU']], 'Add product'],
    ['pack-sizes', 'Add piece size', [['Name', '60 g bar'], ['Grams per piece', '60']], 'Add piece size'],
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
    }
    if (section === 'users') await page.getByLabel(/^PIN/).fill('4321');
    if (section === 'outputs') {
      await page.getByLabel('Station').selectOption('winnowing');
      await page.getByRole('combobox', { name: /^Type/ }).selectOption('waste');
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
    ['Chocolate types', '/recipes', 'Chocolate types'],
    ['Reports', '/reports', 'Reports'],
    ['Setup', '/setup', 'Setup'],
  ]) {
    await page.goto(`${BASE}${url}`);
    await waitForText(page, text);
  }
  await page.goto(`${BASE}/reports/variance`);
  await page.getByLabel('Station filter').selectOption('winnowing');
  await page.locator('td').filter({ hasText: 'Winnowing' }).first().waitFor({ timeout: 10000 });
  await page.goto(`${BASE}/reports/losses`);
  await page.getByLabel('Batch to follow').selectOption('CB-025');
  if ((await page.getByLabel('Batch to follow').inputValue()) !== 'CB-025') throw new Error('Batch to follow did not change');
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
  try {
    await signIn(page);
    await productionLine(page);
    await beanAndPressingFlow(page);
    await batchControls(page);
    await chocolateFromStoreFlow(page);
    await piecesFlow(page);
    await planFlow(page);
    await materialsAndRecipes(page);
    await setupControls(page);
    await navigationAndFilters(page);
    await page.goto(`${BASE}/production`);
    await action(page, 'Sign out', page.getByRole('button', { name: 'Sign out' }).last(), async () => {
      await page.getByRole('heading', { name: 'Who is recording?' }).waitFor();
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
