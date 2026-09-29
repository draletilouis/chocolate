# Cocoa Production System

A simple recording system for a chocolate factory production line. Workers open a station, choose a batch, confirm the input, enter the weights they measured, and the system calculates the balance (measured output, useful output, waste, by-products, unaccounted variance, yield and percentages). Split outputs are assigned destinations separately; only what is carried forward becomes the input of the next station.

It is a web app: one server and one PostgreSQL database hold the records, and every phone, tablet and computer in the factory opens it in a browser and sees the same batches within a few seconds.

Stack: Next.js (App Router) with API routes, React, TypeScript, Tailwind CSS v4, Lucide icons, PostgreSQL (`pg`), or an embedded PostgreSQL (PGlite) for running on one computer.

The UI follows the StockMaster (Lefori) design system: Montserrat, navy primary with orange accent, a white 260px sidebar with an orange-edged active item, a fixed top bar with the page title, white sectioned cards, pill sub-navigation, uppercase slate table headers, pill status badges, and a bottom navigation bar on phones. The shared classes live in `src/app/globals.css` and are used through `src/components/ui.tsx` and `src/components/Shell.tsx`.

## Sign in

- **First start of a real factory:** the app opens on **Set up your factory**. The first person creates the manager account (name, email, password, PIN), and that device is set up for quick sign-in.
- **Quick sign-in** on shared tablets and PCs a manager has set up: **Who is recording?** – tap your name and enter your 4-digit PIN.
- **Email and password** everywhere else, such as a personal phone. A manager signing in can tick **Set up this device for quick sign-in**.
- Operators land on **My work**, the batches waiting at their own stations. Managers also get reports, chocolate types and setup. The server checks access on every change.
- Sessions end after 10 idle minutes (adjustable in Setup → Users). Five wrong PINs lock PIN sign-in for 15 minutes.

Manage people, PINs, access, stations and set-up devices under **Setup → Users**. The signed-in person is recorded on every measurement.

**Demo:** without a database (or with `DEMO_MODE=true`) the app runs the sample factory. Every demo user's PIN is `1234` and password `cocoa123`, for example `alex.morgan@cocoafactory.example`. **Setup → Business details → Reset demo data** puts the samples back.

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3100`. Without `DATABASE_URL` the records are kept in an embedded database in `.data/` and the app runs as the demo. Set `DATABASE_URL` to use PostgreSQL instead.

## Deploy on Railway

1. Create a project from this repository.
2. Add a **PostgreSQL** database to the project.
3. In the app service's **Variables**, add `DATABASE_URL` referencing the database (`${{Postgres.DATABASE_URL}}`). Optionally set `FACTORY_TIMEZONE` (default `Africa/Kampala`).
4. Deploy. Railway runs `npm run build` and `npm start`. Under the app service's **Settings → Networking**, generate a domain.
5. Open the app's URL straight away and create the first manager on **Set up your factory**.
6. Fill in **Setup → Business details** (printed on reports), add suppliers and people, and set up each shared tablet: sign in on it as a manager with **Set up this device for quick sign-in** ticked.

Without a database the app refuses to record on Railway, because a deploy wipes the container's disk.

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string; required in production. |
| `DEMO_MODE` | `true` for the sample factory, `false` for a real one. Default: demo only without `DATABASE_URL`. |
| `DATA_DIR` | Folder for the embedded database when there is no `DATABASE_URL` (default `.data`). |
| `FACTORY_TIMEZONE` | Time zone for record times (default `Africa/Kampala`). |

## Checks

```bash
npm run typecheck
node browser-check.cjs       # needs a demo instance running on port 3100; uses Playwright with Microsoft Edge
node interaction-audit.cjs   # clicks through every flow and saves screenshots (also resets the demo)
```

## Layout

- `src/lib/stations.ts` – the 17 stations, the five parts of the line, predefined output rows with their default destinations, and allowed next stations
- `src/lib/balance.ts` – mass-balance and packaging calculations
- `src/lib/commands.ts` – every change as a named, validated command, and which ones operators may run
- `src/server/reduce.ts` – the business rules: applies a command to the factory's data or refuses it with a reason
- `src/server/state.ts`, `src/server/db.ts` – PostgreSQL or embedded database, versioned items, audit log, sync
- `src/server/auth.ts` – sessions, PIN and password checks, lockouts, devices set up for quick sign-in
- `src/app/api/**` – session, setup, sync, commands, devices and demo-reset endpoints
- `src/lib/store.tsx` – the browser side: loads the data from the server, sends changes, checks for other devices' changes every 5 seconds
- `src/lib/derive.ts` – queues, next input, stations with material waiting after a split, suggested batch names, search, scan targets, alerts, traceability helpers
- `src/components/weighing.tsx` – weight field with container tare, destination tags, live balance bar and saved verdict
- `src/components/Shell.tsx` – sidebar (desktop) and bottom navigation (mobile)
- `src/components/BatchLabel.tsx` – printable batch cards and labels with the batch name, supplier and a QR code that opens the record
- `src/app/work` – My work (each person's waiting batches); `src/app/search`, `src/app/scan/[code]` – search and QR-code landing
- `src/app/production/**` – production line, station queues, batch steps, one-screen station recording, receive a delivery
- `src/app/materials`, `recipes`, `reports`, `setup` – supporting screens

For day-to-day instructions, see the [Chocolate Factory user guide](USER_GUIDE.md). For the data model, implementation details, calculations, routes, alerts, traceability, and current limitations, see [SYSTEM_DOCUMENTATION.md](SYSTEM_DOCUMENTATION.md).
