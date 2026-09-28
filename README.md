# Cocoa Production System

A simple recording system for a chocolate factory production line. Workers open a station, choose a batch, confirm the input, enter the weights they measured, and the system calculates the balance (measured output, useful output, waste, by-products, unaccounted variance, yield and percentages). Split outputs are assigned destinations separately; only what is carried forward becomes the input of the next station.

Stack: Next.js (App Router), React, TypeScript, Tailwind CSS v4, Lucide icons. Data is sample data kept in the browser (`localStorage`).

The UI follows the StockMaster (Lefori) design system: Montserrat, navy primary with orange accent, a white 260px sidebar with an orange-edged active item, a fixed top bar with the page title, white sectioned cards, pill sub-navigation, uppercase slate table headers, pill status badges, and a bottom navigation bar on phones. The shared classes live in `src/app/globals.css` and are used through `src/components/ui.tsx` and `src/components/Shell.tsx`.

## Sign in

The app opens on **Who is recording?**: tap your name and enter your 4-digit PIN. Every demo user's PIN is `1234`. Email and password also work: every demo user's password is `cocoa123`, for example `alex.morgan@cocoafactory.example`. These are sample accounts, checked in the browser.

- Operators land on **My work**, the batches waiting at their own stations.
- Managers also get reports, recipes and setup.
- Shared devices sign out after 10 idle minutes.

Manage people, PINs, access and stations under **Setup → Users**. The signed-in person is recorded on every measurement.

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3100`.

## Checks

```bash
npm run typecheck
node browser-check.cjs       # needs the app running; uses Playwright with Microsoft Edge
node interaction-audit.cjs   # clicks through every flow and saves screenshots
```

## Layout

- `src/lib/stations.ts` – the 17 stations, the five parts of the line, predefined output rows with their default destinations, and allowed next stations
- `src/lib/balance.ts` – mass-balance and packaging calculations
- `src/lib/store.tsx` – in-browser state and all recording actions (batches, lots, holds, corrections, recipes, setup)
- `src/lib/derive.ts` – queues, next input, stations with material waiting after a split, suggested batch names, search, scan targets, alerts, traceability helpers
- `src/components/weighing.tsx` – weight field with container tare, destination tags, live balance bar and saved verdict
- `src/components/Shell.tsx` – sidebar (desktop) and bottom navigation (mobile)
- `src/components/BatchLabel.tsx` – printable batch cards and labels with the batch name, supplier and a QR code that opens the record
- `src/app/work` – My work (each person's waiting batches); `src/app/search`, `src/app/scan/[code]` – search and QR-code landing
- `src/app/production/**` – production line, station queues, batch steps, one-screen station recording, receive a delivery
- `src/app/materials`, `recipes`, `reports`, `setup` – supporting screens

For day-to-day instructions, see the [Chocolate Factory user guide](USER_GUIDE.md). For the data model, implementation details, calculations, routes, alerts, traceability, and current limitations, see [SYSTEM_DOCUMENTATION.md](SYSTEM_DOCUMENTATION.md).
