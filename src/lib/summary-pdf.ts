import type { PhaseLoss, Summary } from './summary';
import { USUAL_DAYS } from './summary';
import type { BusinessDetails } from './types';

type RGB = [number, number, number];

const colors = {
  navy: [26, 56, 98] as RGB,
  orange: [222, 126, 14] as RGB,
  ink: [15, 23, 42] as RGB,
  muted: [100, 116, 139] as RGB,
  line: [226, 232, 240] as RGB,
  sunk: [244, 247, 251] as RGB,
  headFill: [232, 238, 246] as RGB,
  waste: [201, 162, 122] as RGB,
  expected: [143, 179, 217] as RGB,
  missing: [217, 83, 79] as RGB,
  danger: [220, 38, 38] as RGB,
  warn: [217, 119, 6] as RGB,
  ok: [5, 150, 105] as RGB,
};

// A4 in mm, with the same margin all round
const PAGE_W = 210, PAGE_H = 297, M = 16, W = PAGE_W - 2 * M, BOTTOM = PAGE_H - 18;

/** The built-in PDF fonts cover Western European text only: dashes and arrows become plain characters */
const plain = (text: string) => text.replace(/[–—]/g, '-').replace(/→/g, '->').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...');

const kgText = (value: number, decimals = 1) => `${value.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} kg`;
const pctText = (value: number) => `${value.toFixed(1)}%`;

const stateText: Record<PhaseLoss['state'], string> = { normal: 'Usual', high: 'Higher than usual', low: 'Lower than usual', unknown: 'Not enough history' };
const stateColor: Record<PhaseLoss['state'], RGB> = { normal: colors.ok, high: colors.warn, low: colors.navy, unknown: colors.muted };
const toneColor = { danger: colors.danger, warn: colors.warn, neutral: colors.navy };

/** The summary as an A4 PDF: one page, or more for a long attention list */
export async function summaryPdf(summary: Summary, business: BusinessDetails, made: Date = new Date()) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: `Production summary - ${summary.period.label}`, subject: 'Production summary', creator: business.name || 'Chocolate production' });

  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const ink = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const font = (size: number, style: 'normal' | 'bold' = 'normal') => { doc.setFont('helvetica', style); doc.setFontSize(size); };
  const text = (value: string, x: number, y: number, options?: { align?: 'left' | 'right' | 'center' }) => doc.text(plain(value), x, y, options);
  const wrap = (value: string, width: number) => doc.splitTextToSize(plain(value), width) as string[];

  let y = M;
  const room = (height: number) => {
    if (y + height <= BOTTOM) return;
    doc.addPage();
    y = M;
  };

  // Header: who, what and when
  font(15, 'bold'); ink(colors.navy);
  text(business.name || 'Production summary', M, y + 5);
  font(7.5, 'bold'); ink(colors.orange);
  text('PRODUCTION SUMMARY', M + W, y + 1.5, { align: 'right' });
  font(10, 'bold'); ink(colors.ink);
  text(summary.period.label, M + W, y + 6.5, { align: 'right' });
  const contact = [business.address, business.phone, business.email].filter(Boolean).join('  ·  ');
  if (contact) { font(8); ink(colors.muted); text(contact, M, y + 10.5); }
  y += 14;
  doc.setDrawColor(...colors.line); doc.setLineWidth(0.3); doc.line(M, y, M + W, y);
  y += 8;

  // The answer, in words
  font(11.5); ink(colors.ink);
  const headline = wrap(summary.headline, W);
  doc.text(headline, M, y, { lineHeightFactor: 1.4 });
  y += headline.length * 5.6 + 4;

  // Five numbers
  const tiles: [string, string, string][] = [
    ['Beans in', summary.beans.sacks ? kgText(summary.beans.kg, 0) : '-', summary.beans.sacks ? `${summary.beans.sacks} sacks, ${summary.beans.suppliers} suppliers` : 'No beans received'],
    ['Products per 100 kg', summary.sacks.finished ? kgText(summary.sacks.productsPer100) : '-', summary.sacks.finished ? `From ${summary.sacks.finished} finished sacks` : 'No sack finished'],
    ['Chocolate made', kgText(summary.chocolateKg, 0), 'Taken out of the mixer'],
    ['Pieces made', summary.pieces.count.toLocaleString('en-GB'), `${kgText(summary.pieces.kg, 0)} of chocolate`],
    ['Missing, not weighed', kgText(summary.missing.kg), summary.missing.worstPhase ? `Most at ${summary.missing.worstPhase.toLowerCase()}` : 'Whole line'],
  ];
  const gap = 3, tileW = (W - gap * (tiles.length - 1)) / tiles.length, tileH = 21;
  room(tileH + 6);
  tiles.forEach(([label, value, sub], i) => {
    const x = M + i * (tileW + gap);
    fill(colors.sunk); doc.roundedRect(x, y, tileW, tileH, 1.5, 1.5, 'F');
    font(6.5, 'bold'); ink(colors.muted); text(label.toUpperCase(), x + 3, y + 5);
    font(12.5, 'bold'); ink(i === 4 && summary.missing.kg > 0 ? colors.warn : colors.navy); text(value, x + 3, y + 11.5);
    font(7); ink(colors.muted); doc.text(wrap(sub, tileW - 6).slice(0, 2), x + 3, y + 15.5, { lineHeightFactor: 1.2 });
  });
  y += tileH + 10;

  // Loss at each phase
  room(30);
  font(11, 'bold'); ink(colors.navy); text('Loss at each phase', M, y);
  font(8); ink(colors.muted);
  text(`Share of what went into each phase. "Usual" is the middle 80% of the factory's own batches over the last ${USUAL_DAYS} days.`, M, y + 4.5);
  y += 8;
  const cols = [
    { title: 'Phase', w: 40 }, { title: 'Went in', w: 21, right: true }, { title: 'Waste weighed', w: 27, right: true },
    { title: 'Moisture', w: 18, right: true }, { title: 'Missing', w: 18, right: true }, { title: 'Total loss', w: 28 }, { title: 'Usual', w: 26 },
  ];
  const colX = cols.map((_, i) => M + cols.slice(0, i).reduce((t, c) => t + c.w, 0));
  const header = () => {
    fill(colors.headFill); doc.rect(M, y, W, 7, 'F');
    font(6.8, 'bold'); ink(colors.muted);
    cols.forEach((c, i) => text(c.title.toUpperCase(), c.right ? colX[i] + c.w - 2 : colX[i] + 2, y + 4.6, { align: c.right ? 'right' : 'left' }));
    y += 7;
  };
  if (summary.phases.length === 0) {
    font(9); ink(colors.muted); text('Nothing was weighed in this period.', M, y + 4); y += 10;
  } else {
    header();
    const scale = Math.max(20, ...summary.phases.map((p) => p.lossPct));
    for (const p of summary.phases) {
      const rowH = 10;
      if (y + rowH > BOTTOM) { doc.addPage(); y = M; header(); }
      font(9, 'bold'); ink(colors.ink); text(p.name, colX[0] + 2, y + 4.3);
      const named = p.wasteItems.slice(0, 2).map((w) => `${w.name} ${kgText(w.weight)}`).join(', ');
      if (named) { font(7); ink(colors.muted); text(wrap(named, cols[0].w - 3)[0], colX[0] + 2, y + 8); }
      font(8.5); ink(colors.ink);
      const right = (i: number, value: string) => text(value, colX[i] + cols[i].w - 2, y + 4.3, { align: 'right' });
      right(1, kgText(p.input, 0));
      right(2, p.waste ? kgText(p.waste) : '-');
      right(3, p.expected ? kgText(p.expected) : '-');
      right(4, p.missing ? kgText(p.missing) : '-');
      // The loss as a bar, one colour per kind, all phases on the same scale
      const barX = colX[5] + 2, barW = 13, barY = y + 2.4;
      fill(colors.sunk); doc.rect(barX, barY, barW, 2.6, 'F');
      let at = barX;
      for (const [weight, color] of [[p.waste, colors.waste], [p.expected, colors.expected], [p.missing, colors.missing]] as [number, RGB][]) {
        const width = p.input > 0 ? Math.max(0, (weight / p.input) * 100 / scale * barW) : 0;
        if (width > 0.05) { fill(color); doc.rect(at, barY, Math.min(width, barX + barW - at), 2.6, 'F'); at += width; }
      }
      font(8.5, 'bold'); ink(p.state === 'high' ? colors.warn : colors.ink); text(pctText(p.lossPct), barX + barW + 2, y + 4.3);
      font(8); ink(colors.ink); text(p.usual ? `${pctText(p.usual.low)} - ${pctText(p.usual.high)}` : '-', colX[6] + 2, y + 4.3);
      font(7, 'bold'); ink(stateColor[p.state]); text(stateText[p.state], colX[6] + 2, y + 8);
      doc.setDrawColor(...colors.line); doc.line(M, y + rowH, M + W, y + rowH);
      y += rowH;
    }
    // Legend
    y += 4.5;
    let lx = M;
    font(7.5); ink(colors.muted);
    for (const [label, color] of [['Waste weighed', colors.waste], ['Moisture from the roaster', colors.expected], ['Missing, not weighed', colors.missing]] as [string, RGB][]) {
      fill(color); doc.rect(lx, y - 2.3, 2.6, 2.6, 'F');
      text(label, lx + 4, y);
      lx += doc.getTextWidth(label) + 10;
    }
    text(`Bars are drawn to ${Math.round(scale)}% across.`, M + W, y, { align: 'right' });
    y += 9;
  }

  // Needs attention
  room(16);
  font(11, 'bold'); ink(colors.navy); text('Needs attention', M, y);
  y += 6;
  if (summary.attention.length === 0) {
    font(9); ink(colors.muted); text('Nothing needs a look.', M, y); y += 6;
  }
  for (const item of summary.attention) {
    // Lines are split in the font they are drawn in
    font(9.5, 'bold');
    const titleLines = wrap(item.title, W - 8);
    font(8.5);
    const lines = item.detail ? wrap(item.detail, W - 8) : [];
    const height = titleLines.length * 4.4 + lines.length * 4 + 3;
    room(height);
    fill(toneColor[item.tone]); doc.rect(M, y - 3, 1.6, height - 2.2, 'F');
    font(9.5, 'bold'); ink(colors.ink); doc.text(titleLines, M + 5, y, { lineHeightFactor: 1.3 });
    if (lines.length) { font(8.5); ink(colors.muted); doc.text(lines, M + 5, y + titleLines.length * 4.4, { lineHeightFactor: 1.3 }); }
    y += height + 1.5;
  }

  // Footer on every page
  const pages = doc.getNumberOfPages();
  const stamp = `Made ${made.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} at ${made.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(...colors.line); doc.line(M, PAGE_H - 13, M + W, PAGE_H - 13);
    font(7.5); ink(colors.muted);
    text(`${business.name ? `${business.name} · ` : ''}Production summary · ${summary.period.label}`, M, PAGE_H - 9);
    text(`${stamp} · Page ${page} of ${pages}`, M + W, PAGE_H - 9, { align: 'right' });
  }

  return doc;
}

/** Saves the summary PDF straight to the device, named after its period */
export async function downloadSummaryPdf(summary: Summary, business: BusinessDetails) {
  const doc = await summaryPdf(summary, business);
  const slug = (summary.period.from && summary.period.to ? `${summary.period.from}-to-${summary.period.to}` : summary.period.label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  doc.save(`production-summary-${slug}.pdf`);
}
