# Chocolate Factory system documentation

This document explains the current implementation of the Chocolate Factory production-recording system. It is written from the source code in this repository and describes the behavior users get when running the app locally.

## 1. What the system does

Chocolate Factory records the movement of material through a chocolate-production line:

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
| Domain configuration | `src/lib/stations.ts` | Defines the seventeen stations, five line parts, station inputs/outputs, output rows with default destinations, and allowed next stations. |
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

The `migrate()` function in `src/lib/store.tsx` upgrades older stored users that do not yet have email or password fields. It merges stored data over a fresh seed shape and fills missing user credentials from the matching seed user or a generated default. When stored data predates the current line layout (`workflowVersion`), it replaces the built-in output rows and seeded route station lists with the current ones, keeps output rows the user added, and fills variance limits for new stations.

## 4. Production line model

The line is presented as five parts:

| Part | Stations | Purpose |
| --- | --- | --- |
| Bean processing | Receiving → Sorting → Roasting → Winnowing | Receive the beans, sort them by hand and reweigh, roast (whole beans can be taken off for sale), then winnow into nibs and husks. |
| Butter & powder | Pressing → Butter sieving → Filter pan; Powder roasting → Powder crushing | Press nibs into brown butter and cake (powder). Butter is sieved (particles go to liquor grinding) and filtered into clear butter. Cake can be roasted again, then is crushed to fine powder for sale. |
| Liquor | Liquor grinding | Grind nibs twice (coarse, then fine), weigh after fine grinding, and label the liquor with the batch name. |
| Chocolate making | Mixing → Refining → Conching → Tempering | Combine recipe ingredients and develop the chocolate's texture and flavor. |
| Finishing | Moulding → Packaging → Completion | Make finished chocolate, count accepted/rejected units, and close the batch. |

The station definitions in `src/lib/stations.ts` are the source of truth for station names, groups, form type, help text, output rows, each row's default destination, and allowed continuation stations. Station IDs `receiving`, `roasting`, `winnowing`, `grinding` and `pressing` are unchanged from the earlier layout, so older records keep working.

### Stations and continuation options

| Station | Input | Outputs defined by default (default destination) | Form | Allowed continuation |
| --- | --- | --- | --- | --- |
| Receiving | Cocoa beans delivered | Accepted beans (→ Sorting); Rejected beans (waste) | Weights | Sorting |
| Sorting | Accepted beans | Sorted beans (→ Roasting); Sorted-out beans (waste) | Weights | Roasting |
| Roasting | Sorted beans | Roasted beans (→ Winnowing); Whole roasted beans (for sale); Unusable beans (waste) | Weights | Winnowing |
| Winnowing | Roasted beans | Nibs for liquor (→ Liquor grinding); Nibs for butter (→ Pressing); Nibs for sale (for sale); Husks (waste) | Weights | Pressing or Liquor grinding |
| Pressing | Nibs for butter | Brown butter (→ Butter sieving); Cocoa cake (powder) (→ Powder roasting); Waste | Weights | Butter sieving, Powder roasting or Powder crushing |
| Butter sieving | Brown butter | Sieved butter (→ Filter pan); Sieved particles (→ Liquor grinding); Waste | Weights | Filter pan or Liquor grinding |
| Filter pan | Sieved butter | Silk butter (stored); Butter for sale (for sale); Cocoa butter for production (stored); Filter residue (waste) | Weights | Mixing |
| Powder roasting | Cocoa cake (powder) | Roasted powder (→ Powder crushing); Waste | Weights | Powder crushing |
| Powder crushing | Roasted powder | Fine cocoa powder (for sale); Waste | Weights | None |
| Liquor grinding | Nibs for liquor + sieved particles | Liquor (stored, labelled); Waste | Weights | Mixing |
| Mixing | Liquor + butter + sugar | Chocolate mix; Machine residue; Waste | Weights | Refining |
| Refining | Chocolate mix | Refined chocolate; Machine residue; Waste | Weights | Conching |
| Conching | Refined chocolate | Conched chocolate; Machine residue; Waste | Weights | Tempering |
| Tempering | Conched chocolate | Tempered chocolate; Machine residue; Waste | Weights | Moulding |
| Moulding | Tempered chocolate | Finished chocolate; Recoverable chocolate; Waste | Weights | Packaging |
| Packaging | Finished chocolate | Accepted units; Rejected units | Packaging | Completion |
| Completion | Recorded stations | Completed batch record | Completion | None |

There are three seeded route definitions in `src/lib/seed.ts`:

- `beans` (Beans to liquor, butter and powder): Receiving → Sorting → Roasting → Winnowing → Pressing → Butter sieving → Filter pan → Powder roasting → Powder crushing → Liquor grinding → Completion
- `pressing` (Nibs to butter and powder, for stored nibs): Pressing → Butter sieving → Filter pan → Powder roasting → Powder crushing → Completion
- `chocolate`: Mixing → Refining → Conching → Tempering → Moulding → Packaging → Completion

Routes list the processes a batch may use. A station's destination choices provide the actual path for that batch; for example Powder roasting is skipped by sending the cake straight to Powder crushing.

### Splits and parallel branches

At Winnowing the crushed nibs are weighed as separate portions, so one batch can send nibs to Pressing and to Liquor grinding at the same time. `pendingStations()` in `src/lib/derive.ts` lists every station that has continued material waiting and no record yet. The batch appears in the queue of each of those stations, its next step is the first of them in line order, and the batch page lists the others as "Material waiting". `nextInput()` adds up everything continued to a station, which is how sieved butter particles join the nibs at Liquor grinding (record Liquor grinding after sieving when particles are added). A batch reaches Completion when no station has material waiting.

### Labels

Liquor is weighed once, after fine grinding. The Liquor grinding result screen shows a label with the batch name, batch ID, supplier(s), net weight, date and lot, with a **Print label** button. Every lot made by a batch has the same label on its lot page. Suppliers come from the batch's own supplier (chosen when a bean batch is started) and, through `batchSuppliers()`, from the suppliers behind the lots the batch started from.

## 5. Batch lifecycle

### Starting a batch

`/production/new` creates a batch using a selected product. Products map to a route and, for chocolate products, to a recipe.

For bean and stored-nib products, the worker enters a positive starting weight. Bean batches also record the supplier of the delivery, which is printed on labels. For chocolate products, the worker selects a recipe version, enters a planned size, reviews the expected ingredient quantities, and records actual ingredient weights and optional source lots. The sum of actual ingredient weights becomes the mixing input. The worker also enters the calendar date on which the batch started; this defaults to today in the new-batch form and allows historical batches to be entered.

The worker may also enter an optional operator-facing batch name. It is trimmed and stored separately from the generated batch ID. The name is used in queues, alerts, records, and reports; the immutable ID remains the canonical key for URLs, lot uses, and traceability. Older batches without a name continue to display their ID.

`createBatch()` then:

- Generates the next batch ID from the product prefix, such as `CH-019`.
- Stores the optional manual batch name, when provided.
- Stores the entered batch calendar date as `startedAt` (at noon local time); older callers without a date continue to use the current timestamp.
- Sets status to `active`.
- Sets `nextStation` to the first station in the route.
- Stores the supplier for bean batches.
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

The batch page also exposes a process-by-process weight view. Every process record is keyed by the batch and station, so multiple batches can carry independent weights at the same station. A process may be entered out of order from this view when a scale log is available; the entry stores its explicit input weight and does not change `nextStation` or the normal production sequence.

## 6. Recording a station

The route `/production/batches/[id]/record/[station]` implements a four-step station flow:

### Step 1: Confirm input

`nextInput()` finds the recorded output(s) whose destination is `continue:<current station>`. Their names are joined and their weights are summed. If the batch is at its first route station, or no station has been recorded, the batch's `startInput` is used.

For an independent entry, the operator enters the input weight for that process directly. `nextInput()` resolves the normal workflow input by the output that explicitly targets `nextStation`, so out-of-order records do not replace the material waiting at the active step.

The worker can accept the carried-forward weight or enable a reweigh adjustment. If no material was carried forward, the worker must enter a positive starting weight manually.

### Step 2: Enter outputs or packaging counts

For a weights station, the form loads the station's configured output rows. Empty rows are ignored; positive rows are saved. Operators can add a custom output row and classify it as useful, by-product, or waste.

For Packaging, the operator selects a pack size and enters total units and rejected units. Accepted units are calculated, not typed.

The form warns when measured output is greater than the confirmed input, but it does not block saving. It requires a positive input and at least one positive measured output, or a positive total unit count for Packaging.

### Step 3: Choose destinations

Every saved output gets an individual destination:

- `continue:<station>`: carry it to another permitted station in the batch;
- `stock`: create an inventory lot;
- `sale`: create a Finished goods lot for sale;
- `rework`: create a rework lot; or
- `waste`: send it to the waste record without creating a lot.

Default destinations are assigned when a record is first saved from each output row's own default (see the station table). Custom rows fall back to: waste goes to the waste bin, by-products go to stock, and the first useful output continues to the station's default next station. The operator can change every destination before saving.

When destinations are saved, `batch.nextStation` becomes the first station (in line order) with continued material waiting; if none is waiting, the next station becomes Completion. Only the output(s) explicitly continued to a station are used by `nextInput()` for that station.

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

Saving station destinations creates lots only for outputs sent to `stock`, `sale` or `rework`. Outputs sent to `sale` become Finished goods lots. Continued outputs stay attached to the batch path, and waste outputs do not create lots. Packaging's accepted output creates a Finished goods lot measured in units and named with the product and pack size. Other stored/rework outputs create kilogram lots.

Each lot records its source, received quantity, available quantity, and uses. When a source lot is selected for a new chocolate batch, the actual amount used is appended to the lot's use history and subtracted from availability. The lot page links upstream source lots, the creating batch/station, downstream batch uses, and lots made by those downstream batches.

Lot IDs are generated in `nextLotId()` using material-specific prefixes such as `BEAN`, `WRB`, `NIB`, `SILK`, `BUT`, `PWD`, `LIQ`, `REW`, and `FIN`, followed by a four-digit sequence.

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
| `/production` | Active batches, current/next stations (and any other station with material waiting), holds, and the five production parts. |
| `/production/new` | Starts a bean (with supplier), stored-nib, or chocolate batch. |
| `/production/parts/[part]` | Shows batches waiting in one line part and lists its stations. |
| `/production/stations/[station]` | Shows a station's ready, held, and recently recorded queues. |
| `/production/batches/[id]` | Shows process-by-process weights and statuses, the batch timeline, actions, recipe comparison, holds, corrections, and alerts. |
| `/production/batches/[id]/record/[station]` | Records input, outputs/counts, destinations, and completion. |
| `/materials` | Filters and lists all material lots. |
| `/materials/receive` | Records a supplier delivery and creates a lot. |
| `/materials/[lot]` | Shows lot quantities, a printable label for production lots, and upstream/downstream traceability; edits/deletes unused supplier lots only. |
| `/recipes` | Lists recipes, current versions, and batch usage. |
| `/recipes/[id]` | Edits recipe labels, adds immutable versions, deletes recipes unused by batches, and compares expected versus actual ingredients by batch. |
| `/reports/losses` | Shows weight loss by batch/stage, follows one batch, and aggregates loss by process. |
| `/reports/variance` | Filters station records and compares waste, by-products, variance, and limits. |
| `/reports/batches` | Lists all batches and their routes/statuses/summary quantities. |
| `/reports/corrections` | Audits all output corrections. |
| `/reports/holds` | Audits all holds and releases. |
| `/setup/business` | Edits the business name and contact details rendered on reports. |
| `/setup/products` | Lists, adds, edits, and guarded-deletes products and route/recipe associations. |
| `/setup/pack-sizes` | Lists, adds, edits, and guarded-deletes packaging sizes. |
| `/setup/outputs` | Lists, adds, edits, and deletes station output rows for future station forms. |
| `/setup/routes` | Edits route names, starting material and notes; station order stays structural and route deletion is guarded. |
| `/setup/suppliers` | Lists, adds, edits, and guarded-deletes suppliers. |
| `/setup/users` | Lists, adds, edits, and guarded-deletes staff accounts; also changes the user used for recording. |
| `/setup/alerts` | Edits thresholds. |

`/reports` redirects to `/reports/losses`; `/setup` redirects to `/setup/products`. The former `/setup/paper-catalog` URL redirects to `/setup/products`.

All report sections support a duration filter for preset periods or a custom date range. Their export dialog defaults to a StockMaster-style Excel workbook (`.xlsx`) with a Summary sheet and separate filterable detail sheets; a flat CSV and print/PDF output are also available. Exported reports include the configured business details from `/setup/business`.

## 12. Setup data and configuration

The Setup screens mutate the same browser state used by production:

- Products receive generated IDs based on their names.
- Pack sizes receive generated IDs based on grams and list position.
- Suppliers receive generated IDs based on a slugged name.
- Users receive generated IDs and initials.
- Recipe versions must total exactly 100% (within 0.01 percentage points) before saving.
- Output categories are the rows shown on station recording forms and can be extended with custom rows.
- Setup edits preserve entity IDs so existing references remain valid. Delete actions enforce dependency checks in the store as well as disabling unsafe UI actions.
- Routes keep their station sequence fixed because station IDs are part of production and report logic; only route descriptive fields are editable.
- Recipe version history, station measurements, holds, corrections, and production-created lots are audit data, not disposable setup rows.

The seed configuration includes the bean and liquor products, three verified chocolate products/recipes, the paper pack sizes (7 g, 45 g, 80 g, 200 g sachet, and 1 kg), three suppliers, five demo users, three routes, threshold values, sample lots, and sample batches. The app remains browser-local; sample data is initialized for the current browser profile and there is no in-app reset action.

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
- The seeded data is intentionally representative sample data. A production deployment should replace it with server-backed tenant data.

For a production rollout, the store actions would need to move behind an authenticated server/API, with database transactions for batch/lots, server-side validation, role-based permissions, and conflict-safe ID generation.
