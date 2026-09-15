import ExcelJS from 'exceljs';
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

const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const HEADER_FILL = '0F766E';
const SUBHEADER_FILL = 'CCFBF1';
const WEIGHT_FORMAT = '#,##0.00;[Red](#,##0.00);-';
const COUNT_FORMAT = '#,##0';
const PERCENT_FORMAT = '0.0%;[Red]-0.0%;-';
const DATE_FORMAT = 'yyyy-mm-dd';
const DATE_TIME_FORMAT = 'yyyy-mm-dd hh:mm';

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

const excelColumnName = (column: number) => {
  let value = column;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
};

const isDateHeader = (header: string) => /^(date|started|recorded|when|placed|released)$/i.test(header.trim());
const isPercentHeader = (header: string) => /%|share of input/i.test(header);
const isCountHeader = (header: string) => /(^|\s)(batches|sections|rows|count|units)(\s|$)/i.test(header);

function cellKind(header: string) {
  if (isDateHeader(header)) return 'date';
  if (isPercentHeader(header)) return 'percent';
  if (isCountHeader(header)) return 'count';
  return /kg|input|output|useful|waste|by-product|variance|lost|amount|limit|before|after/i.test(header) ? 'number' : 'text';
}

function parseExcelCell(value: ReportCell, header: string) {
  if (value == null || value === '' || value === '—') return '';
  if (typeof value === 'number') return value;

  const text = String(value);
  if (/^-?\d+(?:\.\d+)?\s*kg$/i.test(text)) return Number.parseFloat(text);
  if (/^-?\d+(?:\.\d+)?%$/.test(text)) return Number.parseFloat(text) / 100;
  if (cellKind(header) === 'date' && /^\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?$/.test(text)) {
    const parsed = new Date(text.replace(' ', 'T') + (text.length === 10 ? 'T00:00:00' : ':00'));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (cellKind(header) !== 'text' && /^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  return text;
}

function numberFormatFor(header: string) {
  const kind = cellKind(header);
  return kind === 'date' ? (/(recorded|when|placed|released)/i.test(header) ? DATE_TIME_FORMAT : DATE_FORMAT)
    : kind === 'percent' ? PERCENT_FORMAT
      : kind === 'count' ? COUNT_FORMAT
        : kind === 'number' ? WEIGHT_FORMAT
          : undefined;
}

function columnWidth(header: string, rows: ReportCell[][], index: number) {
  const longest = Math.max(header.length, ...rows.slice(0, 100).map((row) => String(row[index] ?? '').length));
  if (isDateHeader(header)) return 18;
  if (isPercentHeader(header)) return 14;
  if (isCountHeader(header)) return 12;
  return Math.min(42, Math.max(14, longest + 2));
}

function reportSubtitle(snapshot: ReportExportSnapshot) {
  const business = snapshot.business ?? { name: 'Chocolate Factory', address: '', phone: '', email: '' };
  return [business.name, business.address, business.phone, business.email, snapshot.periodLabel].filter(Boolean).join(' | ');
}

function styleTitle(sheet: ExcelJS.Worksheet, title: string, subtitle: string, columnCount: number) {
  const endColumn = excelColumnName(Math.max(8, columnCount));
  sheet.mergeCells(`A1:${endColumn}1`);
  const titleCell = sheet.getCell('A1');
  titleCell.value = title;
  titleCell.font = { name: 'Arial', bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HEADER_FILL}` } };
  titleCell.alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 30;

  sheet.mergeCells(`A2:${endColumn}2`);
  const subtitleCell = sheet.getCell('A2');
  subtitleCell.value = subtitle;
  subtitleCell.font = { name: 'Arial', color: { argb: 'FF475569' }, italic: true, size: 10 };
  subtitleCell.alignment = { vertical: 'middle' };
  sheet.getRow(2).height = 22;
  sheet.views = [{ state: 'frozen', ySplit: 4 }];
  sheet.properties.showGridLines = false;
}

function styleTableHeader(row: ExcelJS.Row) {
  row.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HEADER_FILL}` } };
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  row.height = 24;
}

function styleSectionHeader(row: ExcelJS.Row) {
  row.font = { name: 'Arial', bold: true, color: { argb: 'FF0F172A' }, size: 10 };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${SUBHEADER_FILL}` } };
  row.alignment = { vertical: 'middle' };
}

function addDetailSheet(workbook: ExcelJS.Workbook, snapshot: ReportExportSnapshot, section: ReportExportSection, name: string) {
  const sheet = workbook.addWorksheet(name);
  styleTitle(sheet, section.title, reportSubtitle(snapshot), section.headers.length);
  const headerRow = sheet.getRow(4);
  section.headers.forEach((header, index) => {
    const column = sheet.getColumn(index + 1);
    column.width = columnWidth(header, section.rows, index);
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
  });
  styleTableHeader(headerRow);

  if (section.rows.length) {
    section.rows.forEach((row) => {
      const excelRow = sheet.addRow(section.headers.map((header, index) => parseExcelCell(row[index], header)));
      excelRow.font = { name: 'Arial', size: 10, color: { argb: 'FF0F172A' } };
      excelRow.alignment = { vertical: 'middle' };
      section.headers.forEach((header, index) => {
        const format = numberFormatFor(header);
        if (format) excelRow.getCell(index + 1).numFmt = format;
      });
    });
    sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: section.rows.length + 4, column: section.headers.length } };
  } else {
    const empty = sheet.getRow(5);
    empty.getCell(1).value = 'No records for this reporting period.';
    empty.getCell(1).font = { name: 'Arial', italic: true, color: { argb: 'FF64748B' }, size: 10 };
  }

  return sheet;
}

function addSummarySheet(workbook: ExcelJS.Workbook, snapshot: ReportExportSnapshot, generated: Date) {
  const sheet = workbook.addWorksheet('Summary');
  styleTitle(sheet, snapshot.title, reportSubtitle(snapshot), 8);

  const business = snapshot.business ?? { name: 'Chocolate Factory', address: '', phone: '', email: '' };
  sheet.getCell('A4').value = 'Generated';
  sheet.getCell('B4').value = generated;
  sheet.getCell('B4').numFmt = DATE_TIME_FORMAT;
  sheet.getCell('D4').value = 'Report type';
  sheet.getCell('E4').value = snapshot.title;
  sheet.getCell('G4').value = 'Period';
  sheet.getCell('H4').value = snapshot.periodLabel;
  ['A4', 'D4', 'G4'].forEach((address) => {
    sheet.getCell(address).font = { name: 'Arial', bold: true, color: { argb: 'FF475569' }, size: 10 };
  });

  const totalRows = snapshot.sections.reduce((total, section) => total + section.rows.length, 0);
  const metrics = [
    ['Metric', 'Value'],
    ['Business', business.name],
    ['Reporting period', snapshot.periodLabel],
    ['Report sections', snapshot.sections.length],
    ['Rows exported', totalRows],
  ];
  metrics.forEach((values, index) => {
    const row = sheet.getRow(index + 5);
    row.getCell(1).value = values[0];
    row.getCell(2).value = values[1];
    row.font = { name: 'Arial', size: 10, color: { argb: 'FF0F172A' } };
    row.alignment = { vertical: 'middle' };
  });
  styleTableHeader(sheet.getRow(5));
  sheet.getCell('B8').numFmt = COUNT_FORMAT;
  sheet.getCell('B9').numFmt = COUNT_FORMAT;

  sheet.getCell('D5').value = 'Report section';
  sheet.getCell('E5').value = 'Rows';
  styleTableHeader(sheet.getRow(5));
  ['D5', 'E5'].forEach((address) => {
    const cell = sheet.getCell(address);
    cell.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HEADER_FILL}` } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  snapshot.sections.forEach((section, index) => {
    sheet.getCell(index + 6, 4).value = section.title;
    sheet.getCell(index + 6, 5).value = section.rows.length;
    sheet.getCell(index + 6, 5).numFmt = COUNT_FORMAT;
  });

  sheet.getCell('G5').value = 'Business details';
  sheet.getCell('H5').value = 'Value';
  ['G5', 'H5'].forEach((address) => {
    const cell = sheet.getCell(address);
    cell.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HEADER_FILL}` } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  [['Address', business.address], ['Phone', business.phone], ['Email', business.email]].forEach(([label, value], index) => {
    sheet.getCell(index + 6, 7).value = label;
    sheet.getCell(index + 6, 8).value = value;
  });

  sheet.getColumn(1).width = 24;
  sheet.getColumn(2).width = 32;
  sheet.getColumn(4).width = 34;
  sheet.getColumn(5).width = 12;
  sheet.getColumn(7).width = 18;
  sheet.getColumn(8).width = 36;
  sheet.mergeCells('A12:B12');
  sheet.getCell('A12').value = 'Open each detail sheet to filter the exported records by column.';
  sheet.getCell('A12').font = { name: 'Arial', italic: true, color: { argb: 'FF64748B' }, size: 10 };
  return sheet;
}

export async function buildReportWorkbook(snapshot: ReportExportSnapshot) {
  const workbook = new ExcelJS.Workbook();
  const generated = new Date();
  const businessName = snapshot.business?.name || 'Chocolate Factory';
  workbook.creator = businessName;
  workbook.company = businessName;
  workbook.subject = `${snapshot.title} report`;
  workbook.created = generated;
  workbook.modified = generated;
  addSummarySheet(workbook, snapshot, generated);

  const names = new Set(['Summary']);
  snapshot.sections.forEach((section, index) => {
    const base = section.title.replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31) || `Report ${index + 1}`;
    let name = base;
    let suffix = 2;
    while (names.has(name)) name = `${base.slice(0, 31 - String(suffix).length - 1)} ${suffix++}`;
    names.add(name);
    addDetailSheet(workbook, snapshot, section, name);
  });
  return workbook;
}

export async function downloadReportXlsx(snapshot: ReportExportSnapshot) {
  const workbook = await buildReportWorkbook(snapshot);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], { type: EXCEL_MIME });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeFilename(snapshot.title)}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
}

const generatedAt = () => new Date().toLocaleString('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function buildReportCsv(snapshot: ReportExportSnapshot) {
  const rows: ReportCell[][] = [
    [snapshot.title],
    ['Business', snapshot.business?.name || 'Chocolate Factory'],
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
  const business = snapshot.business ?? { name: 'Chocolate Factory', address: '', phone: '', email: '' };
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
    <footer>Generated from Chocolate Factory production records</footer>
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
