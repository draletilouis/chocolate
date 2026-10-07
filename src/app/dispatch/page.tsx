'use client';

import { useState } from 'react';
import { Truck } from 'lucide-react';
import { Badge, Empty, Field, LinkButton, PageHeader, Panel, RowLink, Select, Stat } from '@/components/ui';
import { customerName } from '@/lib/derive';
import { dispatchesBetween, dispatchSummary } from '@/lib/dispatch';
import { dateTime, num } from '@/lib/format';
import { useStore } from '@/lib/store';

/** The first day of this month, YYYY-MM-DD, on this device's clock */
function monthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Every dispatch note, newest first: goods that left the factory and the customers they went to */
export default function DispatchPage() {
  const store = useStore();
  const [customerId, setCustomerId] = useState('');
  const shown = store.dispatches.filter((d) => !customerId || d.customerId === customerId).sort((a, b) => b.at.localeCompare(a.at));
  const month = dispatchesBetween(store.dispatches, monthStart());
  const lines = month.flatMap((d) => d.lines);
  const pieces = lines.filter((l) => l.unit === 'units').reduce((n, l) => n + l.quantity, 0);
  const kgOut = lines.filter((l) => l.unit === 'kg').reduce((n, l) => n + l.quantity, 0);

  return (
    <>
      <PageHeader eyebrow="Store" title="Dispatch" subtitle="Goods that left the factory: each dispatch note, the customer, and the lots the goods came from. Each line is taken off its lot in the store."
        action={<LinkButton href="/dispatch/new"><Truck size={16} /> Dispatch goods</LinkButton>} />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Dispatches this month" value={month.length} />
        <Stat label="Pieces sent out" value={pieces} hint="This month" />
        <Stat label="Sold by weight" value={`${num(kgOut)} kg`} hint="Butter, powder, nibs and more, this month" />
        <Stat label="Customers" value={new Set(month.map((d) => d.customerId)).size} hint="Supplied this month" />
      </div>

      <Panel title="Dispatch notes" subtitle={customerId ? `To ${customerName(store, customerId)}.` : 'Every dispatch, newest first. A cancelled one stays on record; its goods went back to store.'}
        action={<Field label="Customer" className="min-w-[200px]"><Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label="Customer filter"><option value="">All customers</option>{store.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>}>
        {shown.length === 0 && <Empty>{store.dispatches.length ? 'No dispatch to this customer yet.' : 'Nothing has been dispatched yet.'}</Empty>}
        {shown.map((d) => (
          <RowLink key={d.id} href={`/dispatch/${d.id}`}>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2"><strong>{d.id}</strong><span>{customerName(store, d.customerId)}</span>{d.reference && <span className="text-[12px] text-muted">{d.reference}</span>}{d.cancelled && <Badge tone="danger">Cancelled</Badge>}</span>
              <span className="block text-[12px] text-muted">{dateTime(d.at)} · {dispatchSummary(d)}</span>
            </span>
          </RowLink>
        ))}
      </Panel>
    </>
  );
}
