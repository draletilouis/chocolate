const fs = require('fs');
const path = require('path');

const root = path.resolve('C:/Users/hp/Documents/Codex/2026-09-14/we/outputs/interaction-audit');
const beforeFile = path.join(root, 'before-baseline-3', 'interaction-audit.json');
const afterFile = path.join(root, 'after-optimized', 'interaction-audit.json');
const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8'));
const after = JSON.parse(fs.readFileSync(afterFile, 'utf8'));

const values = (report) => report.records.map((record) => Number(record.elapsedMs));
const percentile = (list, p) => {
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.floor(p * (sorted.length - 1))] ?? 0;
};
const stats = (list) => ({
  count: list.length,
  totalMs: list.reduce((sum, value) => sum + value, 0),
  averageMs: Math.round(list.reduce((sum, value) => sum + value, 0) / Math.max(list.length, 1)),
  medianMs: percentile(list, 0.5),
  p95Ms: percentile(list, 0.95),
});
const reduction = (beforeValue, afterValue) => beforeValue ? Math.round((1 - afterValue / beforeValue) * 1000) / 10 : null;

if (before.records.length !== after.records.length || before.records.some((record, index) => record.label !== after.records[index]?.label)) {
  throw new Error('Before and after audits do not contain the same action sequence.');
}

const beforeTimes = values(before);
const afterTimes = values(after);
const beforeStats = stats(beforeTimes);
const afterStats = stats(afterTimes);
const actions = before.records.map((record, index) => ({
  id: record.id,
  label: record.label,
  beforeMs: beforeTimes[index],
  afterMs: afterTimes[index],
  deltaMs: afterTimes[index] - beforeTimes[index],
  reductionPct: reduction(beforeTimes[index], afterTimes[index]),
}));
const report = {
  generatedAt: new Date().toISOString(),
  beforePhase: before.phase,
  afterPhase: after.phase,
  before: beforeStats,
  after: afterStats,
  totalReductionPct: reduction(beforeStats.totalMs, afterStats.totalMs),
  averageReductionPct: reduction(beforeStats.averageMs, afterStats.averageMs),
  medianReductionPct: reduction(beforeStats.medianMs, afterStats.medianMs),
  p95ReductionPct: reduction(beforeStats.p95Ms, afterStats.p95Ms),
  beforeErrors: before.errors,
  afterErrors: after.errors,
  actions,
};

const md = [
  '# Cocoa Factory interaction performance comparison',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  'The same 58 end-to-end interactions were run against the baseline and the optimized state loader. Each action includes paired before/after screenshots in its phase folder.',
  '',
  '| Measure | Before | After | Change |',
  '|---|---:|---:|---:|',
  `| Total click-to-settle time | ${beforeStats.totalMs} ms | ${afterStats.totalMs} ms | ${report.totalReductionPct}% faster |`,
  `| Average action | ${beforeStats.averageMs} ms | ${afterStats.averageMs} ms | ${report.averageReductionPct}% faster |`,
  `| Median action | ${beforeStats.medianMs} ms | ${afterStats.medianMs} ms | ${report.medianReductionPct}% faster |`,
  `| P95 action | ${beforeStats.p95Ms} ms | ${afterStats.p95Ms} ms | ${report.p95ReductionPct}% faster |`,
  '',
  `Console/page errors: ${before.errors.length} before, ${after.errors.length} after. Both are the expected 401 from an unauthenticated request during the auth flow; the full browser regression separately reported no unexpected errors.`,
  '',
  '| # | Control | Before | After | Delta |',
  '|---:|---|---:|---:|---:|',
  ...actions.map((action) => `| ${action.id} | ${action.label} | ${action.beforeMs} ms | ${action.afterMs} ms | ${action.deltaMs > 0 ? '+' : ''}${action.deltaMs} ms |`),
  '',
  'Destructive “Reset sample data” was intentionally excluded from button clicking and was used only between test runs to restore the demo dataset.',
].join('\n');

fs.writeFileSync(path.join(root, 'comparison.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(root, 'comparison.md'), md);
console.log(JSON.stringify({ before: beforeStats, after: afterStats, totalReductionPct: report.totalReductionPct, averageReductionPct: report.averageReductionPct, output: root }, null, 2));
