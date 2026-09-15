# Cocoa Production System

A simple recording system for a chocolate factory production line. Workers open a station, choose a batch, confirm the input, enter the weights they measured, and the system calculates the balance (measured output, useful output, waste, by-products, unaccounted variance, yield and percentages). Split outputs are assigned destinations separately; only what is carried forward becomes the input of the next station.

Stack: Next.js (App Router), React, TypeScript, Tailwind CSS v4, Lucide icons. Data is sample data kept in the browser (`localStorage`); reset it from **Setup → Alert thresholds → Reset sample data**. The paper-form row labels are transcribed under **Setup → Paper catalog**.

The UI follows the StockMaster (Lefori) design system: Montserrat, navy primary with orange accent, a white 260px sidebar with an orange-edged active item, a fixed top bar with the page title, white sectioned cards, pill sub-navigation, uppercase slate table headers, pill status badges, and a bottom navigation bar on phones. The shared classes live in `src/app/globals.css` and are used through `src/components/ui.tsx` and `src/components/Shell.tsx`.

## Sign in

The app is gated behind a standard email + password login (sample accounts only, checked in the browser). Every demo user signs in with the password `cocoa123`, for example `alex.morgan@cocoafactory.example`. Manage accounts under **Setup → Users**; the signed-in user is recorded on every measurement.

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3100`.

## Checks

```bash
npm run typecheck
node browser-check.cjs   # needs the dev server running; uses Playwright with Microsoft Edge
```

## Layout

- `src/lib/stations.ts` – the 12 stations, their groups, predefined output rows and default next stations
- `src/lib/balance.ts` – mass-balance and packaging calculations
- `src/lib/store.tsx` – in-browser state and all recording actions (batches, lots, holds, corrections, recipes, setup)
- `src/lib/derive.ts` – queues, next input, alerts, traceability helpers
- `src/components/Shell.tsx` – sidebar (desktop) and bottom navigation (mobile)
- `src/app/production/**` – production line, station queues, batch timeline, station recording flow
- `src/app/materials`, `recipes`, `reports`, `setup` – supporting screens

For day-to-day instructions, see the [Cocoa Factory user guide](USER_GUIDE.md). For the data model, implementation details, calculations, routes, alerts, traceability, and current limitations, see [SYSTEM_DOCUMENTATION.md](SYSTEM_DOCUMENTATION.md).
