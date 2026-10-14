import { brand } from '@/lib/brand';

/** Equator's compass-star mark in one of the app's round logo tiles */
export function BrandMark({ className }: { className: string }) {
  return (
    <span className={`${className} is-mark`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- a small static mark, also used offline */}
      <img src={brand.mark} alt="" className="brand-mark-img" />
    </span>
  );
}
