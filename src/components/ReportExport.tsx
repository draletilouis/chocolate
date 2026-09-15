'use client';

import { Download, FileSpreadsheet, FileText, Printer, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Field, Input, Select } from '@/components/ui';
import { downloadReportCsv, openPrintableReport, type ReportExportSnapshot } from '@/lib/report-export';
import type { BusinessDetails } from '@/lib/types';

export type ProductionReportType = 'losses' | 'variance' | 'batches' | 'corrections' | 'holds';
export type ReportPeriod = 'all' | 'today' | 'week' | 'month' | 'year' | 'custom';
export interface ReportRange { from?: string; to?: string; label: string }

const reportOptions: { id: ProductionReportType; label: string }[] = [
  { id: 'losses', label: 'Weight loss by process' },
  { id: 'variance', label: 'Waste & variance' },
  { id: 'batches', label: 'Batch history' },
  { id: 'corrections', label: 'Corrections' },
  { id: 'holds', label: 'Holds' },
];

const periodOptions: { id: ReportPeriod; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'year', label: 'This year' },
  { id: 'custom', label: 'Custom range' },
];

type ExportFormat = 'csv' | 'pdf' | 'print';

interface ReportExportProps {
  current: ProductionReportType;
  business: BusinessDetails;
  buildSnapshot: (type: ProductionReportType, range: ReportRange) => ReportExportSnapshot;
}

const localDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function getReportRange(period: ReportPeriod, customFrom = '', customTo = ''): ReportRange {
  if (period === 'custom') return { from: customFrom || undefined, to: customTo || undefined, label: customFrom && customTo ? `${customFrom} to ${customTo}` : 'Custom range' };
  if (period === 'all') return { label: 'All time' };

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let from = today;
  if (period === 'week') {
    const mondayOffset = (today.getDay() + 6) % 7;
    from = new Date(today);
    from.setDate(today.getDate() - mondayOffset);
  } else if (period === 'month') {
    from = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (period === 'year') {
    from = new Date(today.getFullYear(), 0, 1);
  }

  return {
    from: localDate(from),
    to: localDate(today),
    label: `${localDate(from)} to ${localDate(today)}`,
  };
}

export function ReportExport({ current, business, buildSnapshot }: ReportExportProps) {
  const [open, setOpen] = useState(false);
  const [reportType, setReportType] = useState<ProductionReportType>(current);
  const [period, setPeriod] = useState<ReportPeriod>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setReportType(current);
      setPeriod('all');
      setFrom('');
      setTo('');
      setFormat('csv');
      setError('');
    }
  }, [current, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const range = getReportRange(period, from, to);

    if (period === 'custom' && (!from || !to || from > to)) {
      setError('Choose a valid start and end date.');
      return;
    }

    const snapshot = { ...buildSnapshot(reportType, range), business };
    const opened = format === 'csv'
      ? (downloadReportCsv(snapshot), true)
      : openPrintableReport(snapshot, format === 'pdf');

    if (!opened) {
      setError('The report window was blocked. Allow pop-ups for this app and try again.');
      return;
    }
    setOpen(false);
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Download size={16} /> Export report
      </Button>

      {open && (
        <div className="export-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
          <div className="export-modal" role="dialog" aria-modal="true" aria-labelledby="export-report-title">
            <div className="export-modal-header">
              <div>
                <div className="tab-eyebrow">Reports</div>
                <h2 id="export-report-title">Generate report</h2>
                <p>Download a spreadsheet or create a print-ready document.</p>
              </div>
              <button type="button" className="export-modal-close" onClick={() => setOpen(false)} aria-label="Close export dialog"><X size={18} /></button>
            </div>

            <form onSubmit={submit}>
              <div className="export-form-grid">
                <Field label="Report type">
                  <Select value={reportType} onChange={(event) => setReportType(event.target.value as ProductionReportType)}>
                    {reportOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </Select>
                </Field>

                <Field label="Period">
                  <Select value={period} onChange={(event) => setPeriod(event.target.value as ReportPeriod)}>
                    {periodOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </Select>
                </Field>
              </div>

              {period === 'custom' && (
                <div className="export-form-grid export-date-grid">
                  <Field label="From"><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} required /></Field>
                  <Field label="To"><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} required /></Field>
                </div>
              )}

              <Field label="Format">
                <Select value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)}>
                  <option value="csv">Excel spreadsheet (CSV)</option>
                  <option value="pdf">PDF document (print dialog)</option>
                  <option value="print">Print view</option>
                </Select>
              </Field>

              <p className="export-format-hint">
                {format === 'csv' && <><FileSpreadsheet size={15} /> The Excel-compatible CSV includes each section of the selected report.</>}
                {format === 'pdf' && <><FileText size={15} /> A print dialog opens; choose “Save as PDF” to download the document.</>}
                {format === 'print' && <><Printer size={15} /> The report opens in a clean print view for paper or browser printing.</>}
              </p>
              {error && <p className="export-error" role="alert">{error}</p>}

              <div className="export-modal-actions">
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit"><Download size={16} /> Generate &amp; download</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
