/** A weight to the gram, without a trailing zero in the third place: 58.735, 46.00 */
export const num = (n: number) => { const s = n.toFixed(3); return s.endsWith('0') ? s.slice(0, -1) : s; };
export const kg = (n: number) => `${num(n)} kg`;
export const pct = (n: number) => `${n.toFixed(2)}%`;
export const date = (iso: string) => iso.slice(0, 10);
export const dateTime = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const kindLabel = { useful: 'Useful output', byproduct: 'By-product', waste: 'Waste' } as const;
export const destinationLabel = (destination: string, stationName: (id: string) => string) =>
  destination.startsWith('continue:') ? `To ${stationName(destination.slice(9)).toLowerCase()}` :
  destination === 'stock' ? 'Kept in store' :
  destination === 'sale' ? 'For sale' :
  destination === 'rework' ? 'Rework' :
  destination === 'mixer' ? 'Stays in the mixer' : 'Waste bin';
