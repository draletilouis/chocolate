export const num = (n: number) => n.toFixed(2);
export const kg = (n: number) => `${num(n)} kg`;
export const pct = (n: number) => `${num(n)}%`;
export const date = (iso: string) => iso.slice(0, 10);
export const dateTime = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const kindLabel = { useful: 'Useful output', byproduct: 'By-product', waste: 'Waste' } as const;
export const destinationLabel = (destination: string, stationName: (id: string) => string) =>
  destination.startsWith('continue:') ? `Continue to ${stationName(destination.slice(9))}` :
  destination === 'stock' ? 'Store as lot' :
  destination === 'rework' ? 'Rework' : 'Waste bin';
