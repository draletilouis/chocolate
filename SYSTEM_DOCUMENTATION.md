# Cocoa Factory system documentation

This document explains the current implementation of the Cocoa Factory production-recording system. It is written from the source code in this repository and describes the behavior users get when running the app locally.

## 1. What the system does

Cocoa Factory records the movement of material through a chocolate-production line:

1. A worker starts or selects a batch.
2. The worker confirms the input at a station.
3. The worker enters only the weights or counts observed at that station.
4. The app calculates the mass balance.
5. Each output is assigned a destination: another station, stock, rework, or waste.
6. Continued material becomes the next station's input; stored and rejected outputs remain separate lots or waste records.
7. A batch is reviewed and closed at Completion.

The app also provides material-lot traceability, recipe versioning, alerts, holds, corrections, reports, and factory setup screens.

## 2. Runtime architecture

The application is a Next.js App Router project using React, TypeScript, Tailwind CSS v4, and Lucide icons. There is no API route, database, server action, or external authentication service in the current implementation.

The main runtime layers are:

| Layer | Location | Responsibility |
| --- | --- | --- |
| App shell | `src/app/layout.tsx`, `src/components/Shell.tsx` | Loads global styles, mounts the store, gates the app behind sign-in, and renders navigation. |
| Shared UI | `src/components/ui.tsx` | Reusable headers, panels, buttons, fields, tables, badges, notices, stats, and navigation tabs. |
| Domain configuration | `src/lib/stations.ts` | Defines the twelve stations, four line parts, station inputs/outputs, output rows, and allowed next stations. |
| Domain types and state | `src/lib/types.ts`, `src/lib/seed.ts` | Defines the data model and supplies the initial sample data. |
| Business calculations | `src/lib/balance.ts` | Calculates station balances, percentages, rounding, and packaging quantities. |
| Derived workflow logic | `src/lib/derive.ts` | Builds queues, finds next inputs, creates alerts, resolves names, follows traceability, and generates IDs. |
| State mutations | `src/lib/store.tsx` | Owns browser state and implements every create/update action. |
| Screens | `src/app/**` | Renders production, materials, recipes, reports, and setup workflows. |

All feature screens read and mutate state through `useStore()` from `src/lib/store.tsx`; feature pages do not maintain a second data source.

## 3. Startup and sign-in

`src/app/page.tsx` redirects `/` to `/production`. The root layout mounts `StoreProvider` and then `Shell`.

On the first client render, the provider starts with `seedState()` and then hydrates from browser storage:

- Data key: `cocoa-production-v1`
- Session key: `cocoa-session`

The shell waits for hydration so the seed data does not briefly flash, then shows `LoginScreen` when there is no session user. Login compares the submitted email and password with the in-browser `users` array. A successful login stores the user ID in `cocoa-session` and also sets `currentUserId`, which is written onto new measurements, holds, and corrections.

Sample users are defined in `src/lib/seed.ts`; all seeded accounts use the password `cocoa123`. The login screen includes Alex Morgan's demo credentials.

The `migrate()` function in `src/lib/store.tsx` upgrades older stored users that do not yet have email or password fields. It merges stored data over a fresh seed shape and fills missing user credentials from the matching seed user or a generated default.

## 4. Production line model

The line is presented as four parts:

| Part | Stations | Purpose |
| --- | --- | --- |
| Bean processing | Receiving → Roasting → Winnowing → Grinding | Turn delivered cocoa beans into liquor, with husks and other outputs separated. |
| Pressing | Pressing | Optionally branch cocoa liquor into cocoa butter and cocoa cake. |
| Chocolate making | Mixing → Refining → Conching → Tempering | Combine recipe ingredients and develop the chocolate's texture and flavor. |
| Finishing | Moulding → Packaging → Completion | Make finished chocolate, count accepted/rejected units, and close the batch. |

The station definitions in `src/lib/stations.ts` are the source of truth for station names, groups, form type, help text, output rows, and allowed continuation stations.

### Stations and continuation options

| Station | Input | Outputs defined by default | Form | Allowed continuation |
| --- | --- | --- | --- | --- |
| Receiving | Cocoa beans delivered | Accepted beans; Rejected beans | Weights | Roasting |
| Roasting | Accepted beans | Roasted beans; Unusable beans; Other measured loss | Weights | Winnowing |
| Winnowing | Roasted beans | Nibs; Whole peeled beans; Husks; Unusable beans | Weights | Grinding |
| Grinding | Nibs | Liquor; Butter; Powder; Waste | Weights | Pressing or Mixing |
| Pressing | Cocoa liquor | Cocoa butter; Cocoa cake; Waste | Weights | Mixing |
| Mixing | Liquor + butter + sugar | Chocolate mix; Machine residue; Waste | Weights | Refining |
| Refining | Chocolate mix | Refined chocolate; Machine residue; Waste | Weights | Conching |
| Conching | Refined chocolate | Conched chocolate; Machine residue; Waste | Weights | Tempering |
| Tempering | Conched chocolate | Tempered chocolate; Machine residue; Waste | Weights | Moulding |
| Moulding | Tempered chocolate | Finished chocolate; Recoverable chocolate; Waste | Weights | Packaging |
| Packaging | Finished chocolate | Accepted units; Rejected units | Packaging | Completion |
| Completion | Recorded stations | Completed batch record | Completion | None |

There are three seeded route definitions in `src/lib/seed.ts`:

- `beans`: Receiving → Roasting → Winnowing → Grinding → Completion
- `pressing`: Pressing → Completion
- `chocolate`: Mixing → Refining → Conching → Tempering → Moulding → Packaging → Completion

Routes provide the default path for a new batch. A station's destination choices provide the actual path for that batch. This is why Grinding can send liquor to Pressing, Mixing, or stock even though the bean route itself ends at Completion.

## 5. Batch lifecycle

### Starting a batch

`/production/new` creates a batch using a selected product. Products map to a route and, for chocolate products, to a recipe.

For bean and pressing products, the worker enters a positive starting weight. For chocolate products, the worker selects a recipe version, enters a planned size, reviews the expected ingredient quantities, and records actual ingredient weights and optional source lots. The sum of actual ingredient weights becomes the mixing input. The worker also enters the calendar date on which the batch started; this defaults to today in the new-batch form and allows historical batches to be entered.

The worker may also enter an optional operator-facing batch name. It is trimmed and stored separately from the generated batch ID. The name is used in queues, alerts, records, and reports; the immutable ID remains the canonical key for URLs, lot uses, and traceability. Older batches without a name continue to display their ID.

`createBatch()` then:

- Generates the next batch ID from the product prefix, such as `CH-019`.
- Stores the optional manual batch name, when provided.
- Stores the entered batch calendar date as `startedAt` (at noon local time); older callers without a date continue to use the current timestamp.
- Sets status to `active`.
- Sets `nextStation` to the first station in the route.
- Stores the starting material, weight, source lot IDs, optional recipe snapshot, and note.
- Draws down each selected lot by the actual quantity used, never below zero, while retaining the scale weight as entered.

The first station's recording screen opens immediately after creation.

### Statuses

`BatchStatus` has three values:

- `active`: the batch can advance to its next station.
- `hold`: the batch is stopped and the active hold is shown in queues and alerts.
- `completed`: the batch has been closed, `nextStation` is `null`, and `completedAt` is recorded.

### Batch records

Each `StationRecord` stores:

- station and input material;
- input weight and input lot IDs;
- measured outputs with kind, weight, destination, and optional created lot ID;
- optional packaging details;
- timestamp and recording user;
- optional note; and
- whether destinations have been saved.

Re-entering a station updates its existing record rather than adding a duplicate station record. Existing destinations for outputs with the same name are retained while new weights are entered. The record is marked `destinationsSaved: false` until its destinations are saved again.

## 6. Recording a station

The route `/production/batches/[id]/record/[station]` implements a four-step station flow:

### Step 1: Confirm input

`nextInput()` looks for the most recent settled record and selects outputs whose destination is `continue:<current station>`. Their names are joined and their weights are summed. If no station has been recorded, the batch's `startInput` is used.

The worker can accept the carried-forward weight or enable a reweigh adjustment. If no material was carried forward, the worker must enter a positive starting weight manually.

### Step 2: Enter outputs or packaging counts

For a weights station, the form loads the station's configured output rows. Empty rows are ignored; positive rows are saved. Operators can add a custom output row and classify it as useful, by-product, or waste.

For Packaging, the operator selects a pack size and enters total units and rejected units. Accepted units are calculated, not typed.

The form warns when measured output is greater than the confirmed input, but it does not block saving. It requires a positive input and at least one positive measured output, or a positive total unit count for Packaging.

### Step 3: Choose destinations

Every saved output gets an individual destination:

- `continue:<station>`: carry it to another permitted station in the batch;
- `stock`: create an inventory lot;
- `rework`: create a rework lot; or
- `waste`: send it to the waste record without creating a lot.

Default destinations are assigned when a record is first saved: waste goes to the waste bin, by-products go to stock, and the first useful output continues to the station's default next station. The operator can change every destination before saving.

When destinations are saved, the first continued output determines `batch.nextStation`; if no output continues, the next station becomes Completion. Only the output(s) explicitly continued to that station are used by `nextInput()`.

### Step 4: Finish

The completed recording screen shows the balance, destinations, created lot links, and next action. The operator can open the batch, return to the station queue, re-enter weights, or record the next station.

## 7. Mass balance and packaging calculations

`calculateBalance(input, outputs)` in `src/lib/balance.ts` rounds values to two decimal places and computes:

```text
measured = useful + by-product + waste
variance = input - measured
recordedWaste = by-product + waste
accounted % = measured / input × 100
yield % = useful / input × 100
waste % = waste / input × 100
variance % = variance / input × 100
```

Unaccounted variance is kept separate from recorded waste. A negative variance is possible when measured output exceeds input. Percentages are zero when the input is not positive.

Packaging uses nominal pack weight:

```text
accepted units = max(0, total units - rejected units)
accepted weight (kg) = accepted units × pack grams / 1000
rejected weight (kg) = rejected units × pack grams / 1000
```

The UI prevents rejected units from being greater than total units.

## 8. Inventory lots and traceability

`Lot` represents a quantity that can be traced. Lots may be:

- supplier-delivered raw material;
- an intermediate made by a batch;
- a by-product;
- rework; or
- finished goods.

Receiving material at `/materials/receive` always creates a kilogram supplier lot. Liquor is classified as an Intermediate; other received materials are classified as Raw material.

Saving station destinations creates lots only for outputs sent to `stock` or `rework`. Continued outputs stay attached to the batch path, and waste outputs do not create lots. Packaging's accepted output creates a Finished goods lot measured in units and named with the product and pack size. Other stored/rework outputs create kilogram lots.

Each lot records its source, received quantity, available quantity, and uses. When a source lot is selected for a new chocolate batch, the actual amount used is appended to the lot's use history and subtracted from availability. The lot page links upstream source lots, the creating batch/station, downstream batch uses, and lots made by those downstream batches.

Lot IDs are generated in `nextLotId()` using material-specific prefixes such as `BEAN`, `LIQ`, `HUSK`, `REW`, and `FIN`, followed by a four-digit sequence.

## 9. Holds and corrections

From a batch page, an operator can:

- place an active batch on hold with a reason and the current next station;
- release all unreleased holds with a release note; and
- add a correction to a previously recorded output.

Corrections update the output weight and append an audit entry containing the old value, new value, reason, timestamp, and correcting user. If the corrected output created a lot, the associated lot quantity is adjusted by the correction delta.

The batch timeline shows station records, input/output balances, destinations, recording users, holds, corrections, the next station, upcoming default stations, and completion information.

Completion is a review screen. It summarizes every station, starting and final useful quantities, total variance, packaging counts, and lots created by the batch. The Complete button is disabled while any record still lacks saved destinations or while the batch is on hold.

## 10. Alerts and thresholds

`allAlerts()` combines three alert sources:

1. Variance: absolute station variance percentage is greater than that station's configured limit.
2. Waste: recorded waste percentage is greater than the global waste limit. By-products do not count as waste for this check.
3. Stock: a raw-material kilogram lot is below the low-stock kilogram threshold.

Active holds are also emitted as batch alerts. Completed batches do not contribute batch-level alerts, but low-stock alerts still come from all raw-material lots.

Thresholds are editable under `/setup/alerts`:

- per-station variance limits;
- global waste limit; and
- raw-material low-stock limit.

Alerts appear in the Overview, in the production navigation counts, on batch pages, and in relevant material/batch lists.

## 11. Screens and routes

| Route | Purpose |
| --- | --- |
| `/` | Redirects to Production. |
| `/overview` | Active-batch count, alert count, completed-today count, aggregate variance, alerts, and recent records. |
| `/production` | Active batches, current/next stations, holds, and the four production parts. |
| `/production/new` | Starts a bean, pressing, or chocolate batch. |
| `/production/parts/[part]` | Shows batches waiting in one line part and lists its stations. |
| `/production/stations/[station]` | Shows a station's ready, held, and recently recorded queues. |
| `/production/batches/[id]` | Shows the batch timeline, actions, recipe comparison, holds, corrections, and alerts. |
| `/production/batches/[id]/record/[station]` | Records input, outputs/counts, destinations, and completion. |
| `/materials` | Filters and lists all material lots. |
| `/materials/receive` | Records a supplier delivery and creates a lot. |
| `/materials/[lot]` | Shows lot quantities and upstream/downstream traceability. |
| `/recipes` | Lists recipes, current versions, and batch usage. |
| `/recipes/[id]` | Shows versions, adds a new version, and compares expected versus actual ingredients by batch. |
| `/reports/losses` | Shows weight loss by batch/stage, follows one batch, and aggregates loss by process. |
| `/reports/variance` | Filters station records and compares waste, by-products, variance, and limits. |
| `/reports/batches` | Lists all batches and their routes/statuses/summary quantities. |
| `/reports/corrections` | Audits all output corrections. |
| `/reports/holds` | Audits all holds and releases. |
| `/setup/business` | Edits the business name and contact details rendered on reports. |
| `/setup/products` | Lists and adds products and route/recipe associations. |
| `/setup/pack-sizes` | Lists and adds packaging sizes. |
| `/setup/paper-catalog` | Shows the printed row labels transcribed from the supplied Tempering, Production, Bean, ready-product, packaging-item, and weekly-usage forms. |
| `/setup/outputs` | Lists and adds station output rows. |
| `/setup/routes` | Displays the configured route sequences. |
| `/setup/suppliers` | Lists and adds suppliers. |
| `/setup/users` | Lists staff accounts and changes the user used for recording. |
| `/setup/alerts` | Edits thresholds and resets sample data. |

`/reports` redirects to `/reports/losses`; `/setup` redirects to `/setup/products`.

All report sections support a duration filter for preset periods or a custom date range. Their export dialog defaults to an Excel-compatible CSV and also supports print/PDF output. Exported reports include the configured business details from `/setup/business`.

## 12. Setup data and configuration

The Setup screens mutate the same browser state used by production:

- Products receive generated IDs based on their names.
- Pack sizes receive generated IDs based on grams and list position.
- Suppliers receive generated IDs based on a slugged name.
- Users receive generated IDs and initials.
- Recipe versions must total exactly 100% (within 0.01 percentage points) before saving.
- Output categories are the rows shown on station recording forms and can be extended with custom rows.

The seed configuration includes the bean and liquor products, seven paper-listed chocolate strengths (four marked catalog-only because no verified recipe quantities were visible), three recipes, the paper pack sizes (7 g, 45 g, 80 g, 200 g sachet, and 1 kg), three suppliers, five demo users, three routes, threshold values, sample lots, sample batches, and a `paperCatalog` containing the transcribed form rows. `resetData()` replaces the in-memory state with a fresh cloned seed state. Because the app is browser-local, the reset affects only the browser profile being used. Blank cells and unclear handwritten annotations from the photographs are intentionally not seeded as measurements.

## 13. Navigation and visual system

`Shell.tsx` provides:

- a desktop sidebar with Overview, Production line, Materials, Recipes, Reports, and Setup;
- expandable-looking production part links with waiting counts;
- a desktop top bar showing the current page and signed-in user;
- a mobile header; and
- a fixed mobile bottom navigation bar.

`ui.tsx` centralizes the visual primitives used across screens. `globals.css` defines the design tokens, responsive layout, forms, tables, notices, status badges, and StockMaster-inspired navy/orange visual language.

## 14. Local development and checks

Install and run the app with:

```bash
npm install
npm run dev
```

The dev server is configured for `http://127.0.0.1:3100`.

Available checks are:

```bash
npm run typecheck
node browser-check.cjs
```

The browser check expects the dev server to already be running and uses Microsoft Edge/Playwright. `interaction-audit.cjs` is an additional interaction-audit script that records browser checks under its configured output directory.

## 15. Current scope and limitations

The current app is a browser-local prototype/demo rather than a production deployment:

- Data is stored as JSON in `localStorage`; there is no shared server database or synchronization between users/devices.
- Authentication is a client-side credential comparison. Passwords are stored in the browser state, so this is not a security boundary for real factory access.
- IDs are generated from the current browser state and are not safe for concurrent multi-user creation.
- Weights are recorded in kilograms and rounded to two decimals; Packaging also stores accepted units.
- Setup changes apply immediately to the current browser's forms and reports.
- The seeded data is intentionally representative sample data and can be reset from Setup → Alert thresholds.

For a production rollout, the store actions would need to move behind an authenticated server/API, with database transactions for batch/lots, server-side validation, role-based permissions, and conflict-safe ID generation.
