import type { BusinessDetails } from './types';

export type ReportCell = string | number | null | undefined;

export interface ReportExportSection {
  title: string;
  headers: string[];
  rows: ReportCell[][];
}

export interface ReportExportSnapshot {
  title: string;
  periodLabel: string;
  business?: BusinessDetails;
  sections: ReportExportSection[];
}

const escapeCsv = (value: ReportCell) => {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const escapeHtml = (value: ReportCell) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const safeFilename = (value: string) => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'report';

const generatedAt = () => new Date().toLocaleString('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function buildReportCsv(snapshot: ReportExportSnapshot) {
  const rows: ReportCell[][] = [
    [snapshot.title],
    ['Business', snapshot.business?.name || 'Cocoa Factory'],
    ['Address', snapshot.business?.address || ''],
    ['Phone', snapshot.business?.phone || ''],
    ['Email', snapshot.business?.email || ''],
    ['Period', snapshot.periodLabel],
    ['Generated', generatedAt()],
  ];

  snapshot.sections.forEach((section) => {
    rows.push([]);
    rows.push([section.title]);
    rows.push(section.headers);
    rows.push(...section.rows);
  });

  // UTF-8 BOM makes the downloaded CSV open cleanly in Excel, including names with accents.
  return `\uFEFF${rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')}\r\n`;
}

export function downloadReportCsv(snapshot: ReportExportSnapshot) {
  const blob = new Blob([buildReportCsv(snapshot)], { type: 'text/csv;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeFilename(snapshot.title)}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
}

function printableHtml(snapshot: ReportExportSnapshot) {
  const business = snapshot.business ?? { name: 'Cocoa Factory', address: '', phone: '', email: '' };
  const contact = [business.address, business.phone, business.email].filter(Boolean).join(' · ');
  const sections = snapshot.sections.map((section) => `
    <section class="report-section">
      <h2>${escapeHtml(section.title)}</h2>
      <table>
        <thead><tr>${section.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
        <tbody>
          ${section.rows.length
    ? section.rows.map((row) => `<tr>${section.headers.map((_, index) => `<td>${escapeHtml(row[index])}</td>`).join('')}</tr>`).join('')
    : `<tr><td class="empty" colspan="${Math.max(section.headers.length, 1)}">No records in this period.</td></tr>`}
        </tbody>
      </table>
    </section>
  `).join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(snapshot.title)}</title>
    <style>
      @page { size: landscape; margin: 14mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #0f172a; background: #fff; font: 10pt Arial, sans-serif; }
      header { padding-bottom: 12px; margin-bottom: 18px; border-bottom: 2px solid #1a3862; }
      .brand { color: #64748b; font-size: 9pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      .contact { margin-top: 3px; color: #475569; font-size: 8.5pt; }
      h1 { margin: 5px 0 8px; color: #102a43; font-size: 21pt; }
      .meta { display: flex; gap: 28px; color: #475569; font-size: 9pt; }
      .meta strong { color: #0f172a; }
      .report-section { margin: 0 0 22px; break-inside: avoid; }
      h2 { margin: 0 0 8px; color: #1a3862; font-size: 12pt; }
      table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
      thead { display: table-header-group; }
      th { padding: 7px 8px; color: #334155; background: #f1f5f9; border-bottom: 1px solid #94a3b8; text-align: left; font-size: 7.5pt; letter-spacing: .04em; text-transform: uppercase; }
      td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
      tbody tr:nth-child(even) td { background: #f8fafc; }
      .empty { color: #64748b; text-align: center; font-style: italic; }
      footer { margin-top: 22px; padding-top: 8px; border-top: 1px solid #cbd5e1; color: #64748b; font-size: 8pt; text-align: center; }
      .print-action { position: fixed; top: 14px; right: 14px; padding: 8px 14px; border: 0; border-radius: 5px; background: #f7941d; color: #fff; font-weight: 700; cursor: pointer; }
      @media print { .print-action { display: none; } }
    </style>
  </head>
  <body>
    <button class="print-action" type="button" onclick="window.print()">Print / Save PDF</button>
    <header>
      <div class="brand">${escapeHtml(business.name)} · Production records</div>
      ${contact ? `<div class="contact">${escapeHtml(contact)}</div>` : ''}
      <h1>${escapeHtml(snapshot.title)}</h1>
      <div class="meta"><span><strong>Period:</strong> ${escapeHtml(snapshot.periodLabel)}</span><span><strong>Generated:</strong> ${escapeHtml(generatedAt())}</span></div>
    </header>
    ${sections}
    <footer>Generated from Cocoa Factory production records</footer>
  </body>
</html>`;
}

/** Opens a standalone report so the browser can print it or save it as a PDF. */
export function openPrintableReport(snapshot: ReportExportSnapshot, autoPrint = true) {
  const reportWindow = window.open('', '_blank');
  if (!reportWindow) return false;

  reportWindow.document.open();
  reportWindow.document.write(printableHtml(snapshot));
  reportWindow.document.close();
  reportWindow.focus();
  if (autoPrint) {
    reportWindow.setTimeout(() => reportWindow.print(), 300);
  }
  return true;
}
