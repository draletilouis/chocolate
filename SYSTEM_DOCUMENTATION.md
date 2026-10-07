# Chocolate Factory system documentation

This document explains the current implementation of the Chocolate Factory production-recording system. It is written from the source code in this repository and describes the behavior of the web app: one server with a PostgreSQL database that every phone, tablet and computer in the factory uses.

## 1. What the system does

Chocolate Factory records the movement of material through a chocolate-production line:

1. A worker signs in with their name and PIN and opens a batch from **My work**, a station queue or search.
2. On one screen, the worker checks the input and enters only the weights or counts observed at that station. Each output already shows where it goes: another station, stock, sale, rework or waste.
3. The app checks the mass balance while the weights are typed and saves everything in one step.
4. Continued material becomes the next station's input; stored, for-sale and rejected outputs become separate lots or waste records.
5. Liquor and cocoa butter go on to Mixing, where the chocolate types are made one after another. Each run is made on top of the chocolate the mixer kept from the run before, so the app works out what to add, and each type becomes a lot.
6. At Pieces, the good pieces of each size are counted from each chocolate lot. The number of pieces of each size for each chocolate type is the end result (**Reports → Pieces made**).
7. A batch is reviewed and closed at Completion.
8. The **production plan** says how many pieces of each type and size to make. The app counts the pieces made against it and works out the chocolate still to mix and the ingredients that takes.

The app also provides material-lot traceability, chocolate types with versioned recipes, alerts, holds, corrections, reports, and factory setup screens.

## 2. Runtime architecture

The application is a Next.js App Router project (React, TypeScript, Tailwind CSS v4, Lucide icons) that runs as one web server. Phones, tablets and computers open it in a browser and talk to the server's JSON API. The server keeps everything in a PostgreSQL database, so every device sees the same batches, lots, people and settings.

```
browser (any device)                    server (Next.js API routes)                 PostgreSQL
StoreProvider ── POST /api/commands ──▶ check origin, session, access          ──▶ app_items, app_meta,
  useStore()  ◀─ result + changes ───── validate, apply rules in a transaction      app_commands,
              ── GET /api/sync?since ─▶ what changed since that version            app_credentials,
              ◀─ changed items ──────── (every 5 s while the app is open)          app_sessions, app_devices
```

The main runtime layers are:

| Layer | Location | Responsibility |
| --- | --- | --- |
| App shell | `src/app/layout.tsx`, `src/components/Shell.tsx` | Loads global styles, mounts the store, gates the app behind sign-in, shows connection and save problems, and renders navigation. |
| Sign-in | `src/components/LoginScreen.tsx` | First-start setup, quick sign-in with a PIN on set-up devices, and email and password. |
| Shared UI | `src/components/ui.tsx` | Reusable headers, panels, buttons, fields, tables, badges, notices, stats, and navigation tabs. |
| Weighing UI | `src/components/weighing.tsx` | Weight field with container tare, destination tags, the live balance bar and the one-line saved verdict. |
| Labels | `src/components/BatchLabel.tsx` | Printable batch cards and material labels with the batch name and supplier. |
| Domain configuration | `src/lib/stations.ts` | Defines the seventeen stations, five line parts, station inputs/outputs, output rows with default destinations, and allowed next stations. |
| Domain types and state | `src/lib/types.ts`, `src/lib/seed.ts`, `src/server/demo.ts` | Defines the data model, the line configuration with the demo's staff and suppliers (`seedState()`), the configuration a real factory starts with (`configState()`), and the demo factory's weeks of production (`demoState()`). |
| Business calculations | `src/lib/balance.ts` | Calculates station balances, percentages, rounding, and packaging quantities. |
| Derived workflow logic | `src/lib/derive.ts` | Builds queues, finds next inputs, creates alerts, resolves names, follows traceability, and generates IDs. |
| Commands | `src/lib/commands.ts` | Every change anyone can make, as a named command with its validation schema, and which commands operators may run. |
| Business rules | `src/server/reduce.ts` | `applyCommand()`: applies one command to the state and refuses it with a readable message when a rule is broken. |
| Storage and sync | `src/server/db.ts`, `src/server/state.ts`, `src/lib/sync.ts` | Database connection and schema, versioned items, the in-memory copy, what changed since a version, the audit log. |
| Authentication | `src/server/auth.ts`, `src/server/crypto.ts`, `src/server/http.ts` | Sessions, PIN and password checks with lockouts, set-up devices, cookies, same-origin checks, error answers. |
| API | `src/app/api/**` | The HTTP endpoints listed in section 11. |
| Client store | `src/lib/store.tsx` | Loads the state from the server, sends commands, polls for changes and exposes everything through `useStore()`. |
| Screens | `src/app/**` | Renders production, materials, recipes, reports, and setup workflows. |

All feature screens read state and make changes through `useStore()`; feature pages do not keep a second data source. Every action returns a promise that resolves once the server has accepted the change (or with `false`/`undefined` when it was refused).

### Where the data lives

- **`DATABASE_URL` set:** PostgreSQL. This is the production setup; on Railway it is the project's PostgreSQL service.
- **No `DATABASE_URL`:** an embedded PostgreSQL (PGlite) in the folder `DATA_DIR` (default `.data/`), for running on one computer. On Railway without a database, the server refuses to start recording and says to add PostgreSQL, because a container's disk is wiped on every deploy (a mounted volume is accepted instead).

The schema is created on first start (`createSchema()` in `src/server/db.ts`):

| Table | Holds |
| --- | --- |
| `app_meta` | The data version. Every saved change increases it by one. |
| `app_items` | One row per batch, lot, recipe, product, pack size, supplier, person, route, output row and container, and one per setting (limits, business details, idle minutes, workflow version, ID counters, the mixer and what it usually keeps), with the version at which it last changed. Deleted items stay as tombstones so other devices learn about the deletion. |
| `app_commands` | The audit log: every change with its version, time, the command, who was signed in (`user_id`) and, when a manager recorded on someone's behalf, whose name the records carry (`recorded_as`). Passwords and PINs are never logged. |
| `app_credentials` | Password and PIN hashes (scrypt with a random salt) and failed-attempt counters. |
| `app_sessions` | Signed-in sessions: a SHA-256 hash of the cookie token, the person, last activity, device and recording-as. |
| `app_devices` | Devices a manager set up for quick sign-in (a hash of the device cookie token), who set them up and when they were last used. |

A new database is seeded once (`seedInto()`, under an advisory lock): in demo mode with the sample factory, otherwise with the line configuration only (products, recipes, routes, piece sizes, containers, output rows and limits) and no batches, lots, suppliers or people.

### Saving a change

Every change is a named command, for example `saveRecord`, `receiveDelivery`, `placeHold`, `addUser` or `setThresholds`. The browser sends it to `POST /api/commands`, and the server:

1. refuses requests from other websites (the `Origin` must be the app's own) and requests without a valid session;
2. validates the command with its zod schema: known IDs and stations, finite weights within range, text length limits, 4-digit PINs, passwords of at least 6 characters;
3. checks access: operators may run only production commands (start a batch, receive a delivery, save a station, record or undo a mixing run, take chocolate out of the mixer, finish mixing, record or undo pieces, complete a batch, edit a batch name or note, delete a blank batch, place a hold, correct a weight); everything else needs manager access;
4. in one database transaction, locks the data version, applies the command to the latest data with `applyCommand()`, writes only the items that changed with the new version, stores new password and PIN hashes, and logs the command; and
5. answers with the command's result (such as a new batch ID) and everything that changed since the browser's version.

Nothing changes in the browser until the server has accepted a change. A refusal or a lost connection is shown in a banner at the top of the screen, and the form keeps what was typed so it can be saved again.

Batch and lot numbers are generated inside the transaction, so two devices saving at the same moment cannot get the same number, and a number is never issued again once its batch or lot is removed (see section 8). Times on records use the factory's time zone (`FACTORY_TIMEZONE`, default `Africa/Kampala`).

**Two people saving the same station.** A station form remembers the saved state it was opened on: `recordStamp()` in `src/lib/derive.ts` combines the record's ID, a revision that is new on every save (`rev`) and the number of corrections to it, or is `null` for a station not yet recorded. The form sends it as `expectRecord`, and the server refuses the save when the station's current stamp differs, whether someone else recorded it first, saved it again or corrected one of its weights. Because other devices' saves reach the form within about five seconds, it also shows the warning straight away, turns **Save** off and offers **See the saved weights**. Weights are never silently overwritten.

### Staying in step with other devices

After sign-in the browser loads the whole state (`GET /api/sync?since=0`). While the app is visible it then asks every 5 seconds, and whenever it comes back to the foreground, for what changed since its version; only the changed items travel. Other people's saves therefore appear within about five seconds without reloading. When the connection drops, a banner says so and the app catches up once the server answers again.

The server keeps an in-memory copy of the state and compares it with the database version on every request, so several server instances stay correct.

### Configuration

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. Required for production. On Railway, reference the PostgreSQL service's `DATABASE_URL`. Add `?sslmode=require` if your provider needs SSL. |
| `DEMO_MODE` | `true` seeds the sample factory and allows **Reset demo data**; `false` starts a real factory. Default: on without `DATABASE_URL`, off with it. |
| `DATA_DIR` | Folder for the embedded database when there is no `DATABASE_URL` (default `.data`). |
| `FACTORY_TIMEZONE` | IANA time zone used for record times (default `Africa/Kampala`). |
| `DATABASE_POOL_SIZE` | PostgreSQL connections per server instance (default 5). |

## 3. Startup and sign-in

The root layout mounts `StoreProvider` and then `Shell`. On start the store asks `GET /api/session` who is signed in on this device. When nobody is, `LoginScreen` shows one of three things:

- **Set up your factory** – only while the database has no people, on the first start of a real factory. The first person enters their name, email, password and PIN, becomes the first manager, is signed in, and the device is set up for quick sign-in.
- **Who is recording?** – on a device set up for quick sign-in (every device in demo mode): tap your name and enter your 4-digit PIN (digits can also be typed).
- **Email and password** – on any other device, such as a personal phone. The names are not shown there. A manager signing in can tick **Set up this device for quick sign-in** and name the device.

`src/app/page.tsx` then sends operators, and managers who have their own stations, to `/work`; other managers go to `/production`.

**Sessions:**

- Signing in sets an HTTP-only cookie, `cf_session`, valid for at most 7 days. The server keeps only a hash of its token. Cookies are marked `Secure` when the site is reached over HTTPS.
- A session ends after `idleMinutes` without use (Setup → Users; 10 by default, 0 = never). Only real use counts: the browser tells the server when someone touched the screen or typed since its last check, so a tablet left open still signs out. The server ends idle sessions itself, and the next check returns the device to the sign-in screen.
- Signing out ends the session on the server and returns to `/`, so the next person lands on their own home page.
- When a session ends while the app is open, the device returns to the sign-in screen with a short note saying so; if it ended as someone pressed Save, the note says that nothing was saved.

**Devices set up for quick sign-in:**

- A manager sets up a device by ticking the box when signing in with email and password, or under **Setup → Users → Devices set up for quick sign-in**. The device receives a long-lived HTTP-only cookie, `cf_device` (one year).
- PINs are accepted only on these devices (on every device in demo mode), so a 4-digit PIN cannot be tried from anywhere on the internet.
- Removing a device (a lost or replaced tablet) stops PINs on it and signs out anyone using it.

**Wrong attempts:** five wrong PINs lock that person's PIN sign-in for 15 minutes; email and password still work. Ten wrong passwords lock password sign-in for 15 minutes. Giving the person a new PIN or password in Setup → Users clears the lock.

**Access and "recording as":**

- Each user has `access` (`operator` or `manager`) and `stations`.
- The server enforces access: operators get "Only managers can make this change" for manager commands, and cannot manage devices or record on someone's behalf. Only managers release holds.
- Menus follow the signed-in person, and operators who open `/overview`, `/recipes`, `/reports` or `/setup` are sent to `/work`.
- A manager may choose **Use <name>** under Setup → Users to record on someone's behalf. New records carry that person's name, the audit log keeps the manager's, and the menus stay the manager's.
- The last manager cannot be deleted or demoted, nobody can delete themselves, and deleting a person signs them out everywhere.

**Demo mode.** With `DEMO_MODE=true` (the default when there is no `DATABASE_URL`), the sample factory is loaded with eight staff who all use the PIN `1234` and the password `cocoa123`, every device can use PINs, and **Setup → Business details → Reset demo data** makes the sample factory again, ending that day, and signs everyone out.

**Records kept in a browser by earlier versions.** Before the move to a server, each browser kept its own copy of the records in `localStorage` (`cocoa-production-v1`). When a manager opens **Setup → Business details** in such a browser, a panel offers to upload it. `migrateLegacy()` in `src/server/reduce.ts` upgrades the old data (line layout, output rows, chocolate types, limits, containers; see section 12). The upload replaces the server's batches, lots and settings, keeps the people already on the server, and adds the browser's other people with their passwords and PINs, except the sample `cocoa123` and `1234`, which are public: those people need a new password or PIN from a manager before they can sign in.

## 4. Production line model

The line is presented as five parts:

| Part | Stations | Purpose |
| --- | --- | --- |
| Bean processing | Receiving → Sorting → Roasting → Winnowing | Receive the beans, sort them by hand and reweigh, roast (whole beans can be taken off for sale), then winnow into nibs and husks. |
| Butter & powder | Pressing → Butter sieving → Filter pan; Powder roasting → Powder crushing | Press nibs into brown butter and cake (powder). Butter is sieved (particles go to liquor grinding) and filtered into clear butter. Cake can be roasted again, then is crushed to fine powder for sale. |
| Liquor | Liquor grinding | Grind nibs twice (coarse, then fine), weigh after fine grinding, and label the liquor with the batch name. |
| Chocolate making | Mixing | Make the chocolate types one after another from liquor, cocoa butter, sugar and milk powder (section 6, Mixing). |
| Finishing | Pieces; Completion | Count the good pieces of each size made from each chocolate lot, whenever it is moulded (section 6, Pieces), and close the batch. |

The station definitions in `src/lib/stations.ts` are the source of truth for station names, groups, form type, help text, output rows, each row's default destination, and allowed continuation stations. Station IDs `receiving`, `roasting`, `winnowing`, `grinding` and `pressing` are unchanged from the earlier layout, so older records keep working.

**Retired stations.** Refining, Conching, Tempering and Moulding were separate steps before chocolate was made in mixing runs. They stay defined with `retired: true` so older batches still show their records (read-only), but they are not part of any route, part page, queue, Setup list or My work (`lineStations`). The former Packaging station (ID `packaging`) is now **Pieces**; older packaging records (accepted and rejected units per batch) still show there, read-only.

### Stations and continuation options

| Station | Input | Outputs defined by default (default destination) | Form | Allowed continuation |
| --- | --- | --- | --- | --- |
| Receiving | Cocoa beans delivered | Accepted beans (→ Sorting); Rejected beans (waste) | Weights | Sorting |
| Sorting | Accepted beans | Sorted beans (→ Roasting); Sorted-out beans (waste) | Weights | Roasting |
| Roasting | Sorted beans | Roasted beans (→ Winnowing); Whole roasted beans (for sale); Unusable beans (waste) | Weights | Winnowing |
| Winnowing | Roasted beans | Nibs for liquor (→ Liquor grinding); Nibs for butter (→ Pressing); Nibs for sale (for sale); Husks (waste) | Weights | Pressing or Liquor grinding |
| Pressing | Nibs for butter | Brown butter (→ Butter sieving); Cocoa cake (powder) (→ Powder roasting); Waste | Weights | Butter sieving, Powder roasting or Powder crushing |
| Butter sieving | Brown butter | Sieved butter (→ Filter pan); Sieved particles (→ Liquor grinding); Waste | Weights | Filter pan or Liquor grinding |
| Filter pan | Sieved butter | Silk butter (stored); Butter for sale (for sale); Cocoa butter (→ Mixing); Filter residue (waste) | Weights | Mixing |
| Powder roasting | Cocoa cake (powder) | Roasted powder (→ Powder crushing); Waste | Weights | Powder crushing |
| Powder crushing | Roasted powder | Fine cocoa powder (for sale); Waste | Weights | None |
| Liquor grinding | Nibs for liquor + sieved particles | Liquor (→ Mixing, labelled); Waste | Weights | Mixing |
| Mixing | Liquor + cocoa butter + sugar + milk powder | One lot of chocolate per run, by type | Mixing runs | None |
| Pieces | Chocolate lots | One lot of pieces per size | Pieces (per chocolate lot) | None |
| Completion | Recorded stations | Completed batch record | Completion | None |

Liquor and cocoa butter go on to Mixing by default; either can be kept in store instead, and mixing can also take them from lots.

There are three seeded route definitions in `src/lib/seed.ts`:

- `beans` (Beans to chocolate): Receiving → Sorting → Roasting → Winnowing → Pressing → Butter sieving → Filter pan → Powder roasting → Powder crushing → Liquor grinding → Mixing → Completion
- `pressing` (Nibs to butter and powder, for stored nibs): Pressing → Butter sieving → Filter pan → Powder roasting → Powder crushing → Mixing → Completion
- `chocolate` (Chocolate from stored liquor and butter): Mixing → Completion. The product "Chocolate from store" (prefix `CH`) starts here, with no start weight: every ingredient is taken from a lot at mixing.

Routes list the processes a batch may use. A station's destination choices provide the actual path for that batch; for example Powder roasting is skipped by sending the cake straight to Powder crushing.

### Splits and parallel branches

At Winnowing the crushed nibs are weighed as separate portions, so one batch can send nibs to Pressing and to Liquor grinding at the same time. `pendingStations()` in `src/lib/derive.ts` lists every station that has continued material waiting and no record yet, or a record that is not finished (mixing while its runs are being made). The batch appears in the queue of each of those stations, its next step is the first of them in line order, and the batch page lists the others as "Material waiting". `nextInput()` adds up everything continued to a station, which is how sieved butter particles join the nibs at Liquor grinding (record Liquor grinding after sieving when particles are added). A batch reaches Completion when no station has material waiting.

### Labels

Liquor is weighed once, after fine grinding. The Liquor grinding result screen shows a label with the batch name, batch ID, supplier(s), net weight, date and lot, with a **Print label** button. Every lot made by a batch has the same label on its lot page. Suppliers come from the batch's own supplier (chosen when a bean batch is started) and, through `batchSuppliers()`, from the suppliers behind the lots the batch started from.

## 5. Batch lifecycle

### Starting a batch

`/production/new` creates a batch using a selected product. Products map to a route.

**Bean products use one "Receive a delivery" form.** It asks for the supplier (or, under **Beans from**, a lot of cocoa beans already in store, which the delivered weight is then taken from), delivery date, batch name, delivered weight (with an optional container), and the receiving output rows (accepted and rejected beans, with their destinations). The live balance bar checks them while typing.

- The batch name is suggested from the supplier and date by `suggestBatchName()`, e.g. `Kuapa 28 Sep`. It is made unique with a number when needed, and can be edited.
- **Save delivery** calls `createBatch()` and then `saveRecord()` for Receiving, then opens the saved receiving screen with the printable batch card.

For stored-nib products the worker chooses the lot of the route's start material the nibs are taken from (the oldest in store by default, or the lot in `?lot=`) and enters a starting weight; `createBatch()` takes it off the lot and records the use. The nibs can come from several lots: the form holds one line per lot with its weight, sends one `lotUses` entry for each, and the starting weight is their total. When a weight is more than its lot holds, the form offers to take the rest from the next lot, oldest first. **Chocolate from store** needs no starting weight: the batch opens at Mixing, where each run takes its ingredients from lots.

**Chocolate types.** A chocolate type is a recipe (`Recipe` in `src/lib/types.ts`, seeded in `src/lib/seed.ts`), chosen for each run at mixing rather than as a product. The eight types and their recipes come from the factory's "Regular recipes" table, as percentages of the batch weight; ingredients at 0% are left out, and none uses lecithin:

| Type | Liquor | Cocoa butter | Sugar | Milk powder |
| --- | --- | --- | --- | --- |
| 34% White | — | 35 | 35 | 30 |
| 40% Milk | 11 | 30 | 34 | 25 |
| 50% Milk | 25 | 25 | 25 | 25 |
| 54% Dark | 44 | 10 | 46 | — |
| 56% Dark | 50 | 10 | 40 | — |
| 70% Dark | 60 | 10 | 30 | — |
| 85% Dark | 75 | 10 | 15 | — |
| 100% Dark | 90 | 10 | — | — |

Ingredient names are the material names of the lots weighed in (`chocolateIngredients`): liquor from Liquor grinding, cocoa butter from the Filter pan or a supplier, sugar and milk powder from suppliers. **New chocolate type** (`addChocolateType`, managers only) creates version 1 of a new type's recipe. Names are unique; runs and lots keep the name they were made under when a type is renamed, and a type that was ever mixed cannot be deleted.

`/production/new?lot=<id>` and `?chocolate=1` pick the Chocolate from store product; lot pages of liquor, cocoa butter, sugar or milk powder link here with **Mix chocolate from store**, and the Mixing queue with **Mix from store**. The worker also enters the calendar date on which the batch started. It defaults to today, so historical batches can be entered.

The optional batch name is trimmed and stored separately from the generated batch ID. The name is used in queues, alerts, records, labels and reports; the ID remains the key for URLs, lot uses and traceability.

`createBatch()` then:

- Generates the next batch ID from the product prefix, such as `CH-019`, from the latest state (so it can be returned straight away).
- Stores the optional batch name and, for bean batches, the supplier.
- Stores the entered batch calendar date as `startedAt` (at noon local time).
- Sets status to `active` and `nextStation` to the first station in the route.
- Stores the starting material, weight (zero for a batch that starts at mixing), source lot IDs and note. (Chocolate batches from before mixing runs also kept a recipe snapshot; their records still show it.)
- Draws down each selected lot by the actual quantity used, never below zero, while retaining the scale weight as entered.

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
- the runs, for mixing; packaging details, for older packaging records;
- timestamp and recording user;
- optional note; and
- whether destinations have been saved.

A station's weights and destinations are saved together, so new records are always complete (`destinationsSaved: true`). Re-entering a station (**Edit weights**) updates its existing record rather than adding a duplicate, and keeps the lot IDs it created before, so printed labels stay valid. Records from older versions that were saved without destinations show **Not finished** and open in the form to be completed.

The batch page shows one **Steps** list in line order: each station is done (with **Details** for its weights, destinations, lots, notes and corrections), waiting (with **Record**), or later (with **Enter early**). Every process record is keyed by the batch and station, so multiple batches can carry independent weights at the same station. An early entry stores its explicit input weight and does not change `nextStation` or the normal production sequence.

## 6. Recording a station

The route `/production/batches/[id]/record/[station]` is one screen with one Save button (`StationForm`), followed by a saved view (`SavedView`). A station can be opened when the batch is waiting there (`isReadyAt()`: its `nextStation` or a station with continued material waiting), with `?mode=independent` for an early entry, or when it already has a record.

### Input

`nextInput(batch, station)` adds up the saved outputs whose destination is `continue:<station>`; their names are joined. If nothing was continued and the batch has no records, or this is the route's first station, the batch's `startInput` is used. The input is shown pre-filled. **Reweighed? Change** opens a weight field for the new scale reading. An early entry, or a station with nothing carried forward, starts with the field open.

### Weights, containers and destinations

The form loads the station's configured output rows (`outputCategories`), plus any custom outputs on an existing record. Operators can add custom rows and classify them as good output, by-product or waste.

**Containers.** Each weight has an optional container from **Setup → Containers**.

- The typed value is then the scale reading. `netWeight()` subtracts the container's empty weight (tare).
- The record keeps the gross reading, tare and container name (`container` on the output, `inputContainer` on the record), so history does not change if the container list changes.
- The container last used for that output at that station (`lastContainerId()`) is pre-selected.

**Destinations.** Each output shows its destination as a tag that can be changed:

- `continue:<station>`: carry it to another permitted station in the batch (the options come from the station's `next` list);
- `stock`: create an inventory lot ("Keep in store");
- `sale`: create a Finished goods lot ("For sale");
- `rework`: create a rework lot; or
- `waste`: waste bin, no lot.

Defaults come from each output row's `to` in `src/lib/stations.ts`. Custom rows fall back to: waste to the waste bin, by-products to stock, and the first useful output to the station's default next station.

**Live check.** The bar pinned to the bottom of the screen (`LiveBalance`) recalculates the balance as weights are typed:

- It shows how much is entered, how much is left to assign or missing, and turns orange above the station's variance limit or when more was entered than went in.
- It also notes when waste is above the waste limit.
- It does not block saving. Saving requires a positive input and at least one positive weight.

### Saving

**Save** sends a `saveRecord` command to the server (section 2). There, `saveRecord()` in `src/server/reduce.ts` first checks that:

- nobody saved this station of this batch since the form was opened;
- the batch is not completed, and is not on hold unless an existing record is being edited;
- the batch is waiting at this station, unless it is an early entry;
- the input and at least one weight are positive, output names are unique, and each continued output goes to a station allowed after this one.

It then builds the record, signed with the person recording and the factory time, and hands it to `commitRecord()`, which:

1. creates or updates a lot for every output sent to `stock`, `sale` or `rework`, reusing the lot IDs this station created before, and removes the lots of outputs it no longer stores (their numbers are not reused);
2. replaces the station's record on the batch; and
3. unless it is an early entry, sets `nextStation` to the first station in line order with continued material waiting (`pendingStations()`), or Completion when none is waiting.

The button reads **Saving…** until the server answers. When the save is refused, the reason appears in the banner at the top and the form keeps the typed weights.

### Saved view

The saved view puts the next step first:

- **Top:** a banner lists what was sent on, with buttons to record the next station and any other station now waiting.
- **Verdict:** the balance in one line (`BalanceVerdict`), with **Show details** for the full figures.
- **What was weighed:** each output with its destination, lot link and container reading.
- **Labels:** Liquor grinding shows the liquor label; Receiving shows the batch card.
- **Edit weights** reopens the form until the batch is completed.

### Mixing

Mixing has its own screen (`MixingScreen` in `src/components/MixingScreen.tsx`) instead of the weights form. The chocolate types are made one after another; each **run** is entered and saved on its own (`saveMixingRun`), so the record builds up during the day.

**The mixer.** The mixer is never emptied between types: some chocolate stays in it and the next run is made on top of it, whichever batch that run belongs to. The state keeps what it holds (`mixer.holds`: kg, type, recipe version, and the batch, run and lot that left it) and the last run made on it (`mixer.lastRunId`). How much is usually kept (`mixerKeepsKg`, 10 kg to start) is set in **Setup → Containers** and suggested on every run.

**A run.** The operator chooses the chocolate type and the kg of fresh ingredients to run (the sheet's "To run"). `changeover()` in `src/lib/mixing.ts` then does the changeover sheet's calculation: the run makes *to run + held* kg of the new type; each ingredient needed for that total, less what the held chocolate already brings, is what to add. For example, 30 kg of 70% Dark on 10 kg of 85% Dark makes 40 kg: liquor 24 − 7.5 = **16.5**, cocoa butter 4 − 1 = **3**, sugar 12 − 1.5 = **10.5**. The screen shows, per ingredient, what the mixer already holds, what to add, the weight actually weighed in (prefilled with what to add) and where it comes from: **this batch** (the liquor and cocoa butter it sent to mixing, up to what is left) or a lot, oldest first. The operator enters the chocolate taken out and what is kept in the mixer; the live bar checks *fresh + held = taken out + kept*.

- An ingredient the held chocolate has more of than the new type cannot be taken out again, so a changeover has a **smallest run** (`minRun`): below it the recipe cannot be reached and the run is refused (for example at least 25 kg of 85% Dark on 15 kg of 56% Dark: its 6 kg of sugar is 15% of 40 kg).
- When the new type has none of an ingredient the held chocolate has (sugar into 100% Dark, milk powder into a dark chocolate), the run is refused until the chocolate is **taken out of the mixer** (`emptyMixer`). What is taken out becomes a lot of that chocolate, traced to the batch whose run left it; that run then shows the lot instead of "left in the mixer".
- The chocolate taken out becomes a lot of the type, numbered by type code: `D70-0001` for 70% Dark, `M40-…` for 40% Milk, `W34-…` for 34% White (`nextLotId()`). Ingredient lots are drawn down by the weight weighed in, and each use records the run.
- An ingredient can come from more than one place in one run: the batch's own material and one or more lots. The form sends one entry per place (`saveMixingRun` accepts the same ingredient once per lot), and the run stores them as `sources` on the `RunIngredient` (`{ lotId?, kg }`, with `lotId` on the ingredient left empty). A single source is stored as before, on `lotId`. Read either shape with `sourcesOf()` in `src/lib/mixing.ts`. When the weight entered is more than the chosen lot holds, the form offers to take the rest from the next lot, oldest first; if it is saved as it is, the lot goes to zero.
- The run is refused when the mixer changed since the screen was opened (`mixerStamp()`), so two devices cannot build on the same leftover.
- The last run made on the mixer can be undone (`undoMixingRun`) while its chocolate is untouched and mixing is not finished: its lot is removed (its number stays taken) and the ingredients go back to their lots.

**Finishing.** **Finish mixing** (`finishMixing`) closes the record. Liquor or cocoa butter the batch sent to mixing that no run used is kept in store as a lot, and the batch moves on (usually to Completion). A batch cannot be completed while its mixing is in progress.

**The record.** The mixing record is an ordinary `StationRecord` with its `runs`; its input and outputs follow from them (`mixingTotals()`), so the balance, alerts and reports work as for other stations. Input is every ingredient weighed in, the chocolate the mixer held from another batch, and unused liquor or butter; outputs are each run's chocolate, what this batch leaves in the mixer for another (destination "Stays in the mixer") or what was taken out, and the liquor or butter kept in store. Mixing runs are not corrected from the batch page; undo the last run instead. Each run keeps its expected and actual ingredient weights, which the chocolate type's page compares.

### Pieces

The end result is the number of pieces of each size for each chocolate type. Pieces are counted from **chocolate lots**, not on a batch: chocolate can be moulded the same day or later, also after its batch is completed. The Pieces queue (`/production/stations/packaging`, `chocolateWaiting()`) lists every chocolate lot with chocolate left, oldest first; My work shows it to people with the Pieces station.

On `/production/pieces/[lot]` the operator enters the good pieces made of each size (there are no rejects), and the screen shows the chocolate that takes (pieces × grams) and what stays in the lot. **Save pieces** (`recordPieces`):

- makes one lot per size, counted in pieces and numbered `FIN-…`, named e.g. `70% Dark · 45 g bar`, with `pieces` naming the type, size, grams, the chocolate lot and who counted them; its source is the batch that mixed the chocolate, so its label traces to the supplier;
- draws the chocolate lot down by the weight of the pieces, to the gram (`piecesKg()`), and records each use with the lot of pieces it made; more than the lot holds is refused.

On the Pieces screen each size also shows how many pieces the production plan still needs of that type and size.

Pieces entered by mistake can be undone while none of them is used (`removePieces`): the chocolate goes back to its lot and the `FIN` number stays taken. Sizes come from **Setup → Piece sizes**; a size already made cannot be deleted, and pieces keep the size name and grams they were made with. `piecesByTypeAndSize()` in `src/lib/pieces.ts` adds pieces up by type and size for the batch page, the completion screen and **Reports → Pieces made**.

### Production plan

The plan (`state.plan`, one shared setting) lists the pieces to make of each chocolate type and size, a start date and an optional note. Managers set it on `/plan` (`setPlan`); the server refuses a type or size that does not exist and the same type and size twice, drops lines of 0 pieces, and records who set it and when. Operators can read the plan but not change it. A new factory starts without one.

`planProgress()` in `src/lib/plan.ts` works out, from the state alone:

- **Pieces**: for each line, the pieces recorded at Pieces since the start date (lots of pieces with that chocolate type and size, by the day they were counted), what is left and the chocolate that takes (pieces × grams). Pieces made beyond a line do not count towards another.
- **Chocolate still to mix**: per type, the chocolate for the pieces left less the chocolate already mixed and waiting in lots (the Pieces queue).
- **Ingredients to mix it**: the chocolate still to mix times each type's current recipe, against what is in store (lots of that material, in kg) and the liquor and cocoa butter at mixing on batches not yet completed. What that does not cover is shown as short.

It is a guide for the day's work: it does not take into account what a changeover adds or what the mixer keeps. **Overview** shows the plan's progress; My work links to it for people with Mixing or Pieces (or no stations of their own).

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

Packaging records from before mixing runs used nominal pack weight:

```text
accepted units = max(0, total units - rejected units)
accepted weight (kg) = accepted units × pack grams / 1000
rejected weight (kg) = rejected units × pack grams / 1000
```

The UI prevents rejected units from being greater than total units.

## 8. Inventory lots and traceability

`Lot` represents a quantity that can be traced. Lots may be:

- supplier-delivered raw material;
- an intermediate made by a batch, including each type of chocolate made at mixing (`chocolate` on the lot names the type, recipe version and run);
- a by-product;
- rework; or
- finished goods.

Receiving material at `/materials/receive` always creates a kilogram supplier lot, with the supplier's own batch number (`supplierBatch` on the lot's source) when there is one; search finds a lot by it. Liquor is classified as an Intermediate; other received materials are classified as Raw material. The supplier list offers first the suppliers whose **Supplies** names the material (`suppliersFor()` in `src/lib/derive.ts`, a comma-separated list matched without case) and picks the first of them when the material changes; the bean delivery form does the same for cocoa beans.

Saving station destinations creates lots only for outputs sent to `stock`, `sale` or `rework`. Outputs sent to `sale` become Finished goods lots. Continued outputs stay attached to the batch path, and waste outputs do not create lots. Packaging's accepted output creates a Finished goods lot measured in units and named with the product and pack size. Other stored/rework outputs create kilogram lots.

Lots made by a batch show a printable label on their lot page, and a bean batch prints a batch card from its receiving screen or batch page. Labels carry the batch name, batch ID, supplier(s), weight, date and lot ID.

Each lot records its source, received quantity, available quantity, and uses. When a source lot is selected for a new chocolate batch, the actual amount used is appended to the lot's use history and subtracted from availability. The lot page links upstream source lots, the creating batch/station, downstream batch uses, and lots made by those downstream batches.

**Tracing from beginning to end.** `src/lib/trace.ts` follows those links all the way, from the state alone (nothing extra is stored):

- `madeFrom()` goes backwards from a lot. Pieces come from their chocolate lot (`pieces.fromLotId`). Chocolate comes from its mixing run: each lot an ingredient was weighed from with its kg (one line per lot when an ingredient was split), an ingredient taken from the batch itself (no lot) as that batch's start, and the chocolate the mixer held (`run.held`). Any other lot comes from what its batch started with (`startLotIds()`). A supplier lot ends the trail. `batchMadeFrom()` does the same for a whole batch.
- `wentInto()` goes forwards through `lot.uses`: a use with `madeLot` leads to the pieces, a use with `runId` to that run's chocolate, any other use to the batch it started and the lots that batch made; chocolate a run kept in the mixer leads to the next run's lot. `batchWentInto()` starts from the lots a batch made.
- `deliveriesBehind()` lists the purchases a trace reaches: every supplier lot, and every bean batch received straight from a supplier (a batch with a supplier and no starting lot is itself the delivery).

Chocolate left in the mixer chains every run to the one before, so it is followed `HELD_RUNS` (3) runs and then marked as cut; a lot already on the path is not followed again. `/trace/[id]` shows the result for a lot or a batch, and `/store` lists every lot in four parts: ingredients (cocoa beans, the recipe ingredients in `chocolateIngredients` and any other supplier-delivered material, with the bean batches received straight onto the line), chocolate, finished pieces, and every other stored product.

**Stock is drawn down by the commands themselves.** `createBatch()` takes the starting weight off the lot a batch starts from, `saveMixingRun()` each ingredient off its lot, `recordPieces()` the chocolate off its lot, and `dispatchGoods()` each line of a dispatch off its lot; each appends a `LotUse`, which is what the trace follows. Undoing a run or a lot of pieces, or cancelling a dispatch, puts the weight back.

Lot IDs are generated in `nextLotId()` using material-specific prefixes such as `BEAN`, `WRB`, `NIB`, `SILK`, `BUT`, `PWD`, `LIQ`, `REW`, and `FIN`, followed by a four-digit sequence. Chocolate made at mixing is numbered by type code: `D70` for 70% Dark, `M40` for 40% Milk, `W34` for 34% White. Batch IDs are generated in `nextBatchId()` from the product prefix and a three-digit sequence.

**Numbers are never reused.** A lot or batch can be removed: an unused supplier lot or a blank batch can be deleted, and saving a station again removes the lots it made for outputs it no longer stores (the output now continues or goes to waste, or was renamed). Its number stays taken, so a printed label for it finds nothing instead of opening a different lot or batch, and traceability back to the supplier holds. The state keeps `idCounters`: the highest number issued for each batch prefix and each lot prefix, stored as a setting. After every command, `applyCommand()` raises the counters to cover every batch and lot ID from before and after the command, inside the same transaction. The next number is one above the counter or the highest ID in use, whichever is higher. A new lot made in the same save that drops another cannot take the dropped lot's number either. A database saved before the counters existed needs no migration step: its numbers continue from its highest IDs, and its counters fill in as commands run. Uploading records from an older browser keeps the server's counters, so numbers the server already issued stay taken.

### Dispatch

Goods leave the factory on a dispatch note (`Dispatch` in `src/lib/types.ts`): a customer (`Customer`: name, address, contact), the time, an optional order or invoice number and note, and lines of `{ lotId, material, quantity, unit }`, one per lot. `dispatchGoods` (managers only, like receiving) checks that every lot has the quantity on record, that pieces go out whole and that no lot is listed twice, then numbers the note `DSP-0001` and up and takes each line off its lot as a `LotUse` carrying `dispatchId` instead of `batchId` and `station`. The dispatch form (`src/lib/dispatch.ts`) takes each product from its oldest lots first unless a lot is chosen, and sends one line per lot. Bought raw materials are not offered; everything the factory made is.

`cancelDispatch` puts the goods back on their lots, removes the uses, and keeps the note with `cancelled: { at, by, reason }`. Dispatches are never deleted, so a number is never given twice; a customer with dispatches cannot be deleted. `wentInto()` turns a dispatch use into a step whose origin is the dispatch, and `shipmentsAhead()` lists every dispatch a forward trace reaches, which the trace page shows as **Customers it reached**: from a delivery, every customer who received something made from it.

## 9. Holds and corrections

From a batch page, anyone signed in can:

- place an active batch on hold with a reason and the current next station; and
- add a correction to a previously recorded output.

Only a manager can release the holds, with a release note; operators see "A manager releases the hold." The server refuses the release from anyone else.

Corrections are made from the batch page: open a step's **Details** and select **Correct** next to the weight. They update the output weight and append an audit entry containing the old value, new value, reason, timestamp, and correcting user. If the corrected output created a lot, the associated lot quantity is adjusted by the correction delta.

The batch timeline shows station records, input/output balances, destinations, recording users, holds, corrections, the next station, upcoming default stations, and completion information.

Completion is a review screen. It summarizes every station, the starting weight, the chocolate made of each type, the pieces made so far by type and size, total variance, and lots created by the batch. The Complete button is disabled while any record still lacks saved destinations or while the batch is on hold.

## 10. Alerts and thresholds

`allAlerts()` combines three alert sources:

1. Variance: absolute station variance percentage is greater than that station's configured limit.
2. Waste: recorded waste percentage is greater than the global waste limit. By-products do not count as waste for this check.
3. Stock: a raw material's kilograms in store, all its lots added up as the Store shows them, are below the low-stock kilogram threshold. One alert per material, linking to the Store; a lot used up while others of the same material are in store raises none.

Active holds are also emitted as batch alerts. Completed batches do not contribute batch-level alerts, but low-stock alerts still cover every raw material.

Thresholds are editable under `/setup/alerts`:

- per-station variance limits;
- global waste limit; and
- raw-material low-stock limit.

Alerts appear in the Overview, in the production navigation counts, on batch pages, and in relevant material/batch lists.

## 11. Screens and routes

| Route | Purpose |
| --- | --- |
| `/` | Home: My work for operators and for managers with their own stations, the production line for other managers. Shows the sign-in screen when nobody is signed in. |
| `/overview` | Active-batch count, alert count, completed-today count, aggregate variance, the production plan's progress, alerts, and recent records. |
| `/plan` | **Production plan**: pieces planned, made and left per chocolate type and size, the chocolate still to mix, the ingredients it takes against store; managers set and change the plan. |
| `/work` | My work: batches waiting at the signed-in person's stations (all stations for people without their own), with one button to record each, search, and **Receive a delivery**. |
| `/search?q=` | Finds batches (name, ID, product, supplier) and lots (ID, material, supplier). |
| `/production` | Active batches, where each is waiting, holds, and the five production parts. |
| `/production/new` | Receive a delivery (bean batches: batch and receiving in one form), or start a stored-nib or Chocolate from store batch; `?lot=` or `?chocolate=1` picks Chocolate from store. |
| `/production/parts/[part]` | Shows batches waiting in one line part and lists its stations. |
| `/production/stations/[station]` | Shows a station's ready, held, and recently recorded queues; the Mixing queue also shows what the mixer holds, and the Pieces queue lists the chocolate lots not yet made into pieces. |
| `/production/batches/[id]` | One Steps list (done with details and inline corrections, waiting, later with early entry), batch card printing, actions, recipe comparison, holds, and alerts. |
| `/production/pieces/[lot]` | Pieces: counts the good pieces of each size made from one chocolate lot, and lists (and undoes) the pieces made from it. |
| `/production/batches/[id]/record/[station]` | One-screen station entry (input, weights with containers, destinations, live check), the saved view, mixing runs, and completion. |
| `/store` | **Store**: everything in store by batch number (lot), in four parts: ingredients, chocolate, finished pieces and other stored products, with who delivered or made each lot and what used it. |
| `/dispatch` | **Dispatch** (managers): every dispatch note, newest first, with this month's dispatches, pieces, kg and customers, filtered by customer. |
| `/dispatch/new` | Dispatches goods to a customer: products and quantities, taken from the oldest lots first or from a chosen lot (`?lot=` fills one in). |
| `/dispatch/[id]` | One dispatch note: each line with its lot, made date and batch; prints the delivery note; cancels it with a reason. |
| `/trace` | **Batch tracing**: opens a batch or lot by its number, or lists finished pieces, chocolate, deliveries and production batches to pick from. |
| `/trace/[id]` | A lot or batch from beginning to end: the deliveries behind it, how it was made, where it went, and the customers it reached. |
| `/materials` | Redirects to `/store`, which replaced the lot list. |
| `/materials/receive` | Records a supplier delivery and creates a lot. |
| `/materials/[lot]` | Shows lot quantities, a printable label for production lots, and upstream/downstream traceability; edits/deletes unused supplier lots only. |
| `/recipes` | **Chocolate types**: lists each type's current recipe, versions, and how many runs made it. |
| `/recipes/new` | Adds a chocolate type and the first version of its recipe. |
| `/recipes/[id]` | Renames a type, adds immutable versions, deletes types never made, and compares expected versus actual ingredients by mixing run. |
| `/reports/pieces` | **Pieces made**: pieces by chocolate type and size in the period, and every lot of pieces with the chocolate lot and batch it came from. |
| `/reports/dispatched` | **Dispatched**: what left the factory in the period by product and by customer, and every dispatch note; cancelled ones are left out. |
| `/reports/losses` | Shows weight loss by batch/stage, follows one batch, and aggregates loss by process. |
| `/reports/variance` | Filters station records and compares waste, by-products, variance, and limits. |
| `/reports/batches` | Lists all batches and their routes/statuses/summary quantities. |
| `/reports/corrections` | Audits all output corrections. |
| `/reports/holds` | Audits all holds and releases. |
| `/setup/business` | Edits the business name and contact details rendered on reports; uploads records an older version kept in this browser; in demo mode, resets the demo data. |
| `/setup/products` | Lists, adds, edits, and guarded-deletes products and their routes. |
| `/setup/pack-sizes` | **Piece sizes**: lists, adds, edits, and guarded-deletes the sizes pieces are made in. |
| `/setup/containers` | Lists, adds, edits and deletes containers and their empty weights; sets how much chocolate the mixer usually keeps, and shows what it holds. |
| `/setup/outputs` | Lists, adds, edits, and deletes station output rows for future station forms. |
| `/setup/routes` | Edits route names, starting material and notes; station order stays structural and route deletion is guarded. |
| `/setup/suppliers` | Lists, adds, edits, and guarded-deletes suppliers. |
| `/setup/customers` | Lists, adds, edits, and guarded-deletes customers (one with dispatches cannot be deleted). |
| `/setup/users` | Lists, adds, edits and guarded-deletes staff accounts with PIN, password, access and stations; sets the idle sign-out time; changes the user used for recording; lists, sets up and removes devices for quick sign-in. The last manager cannot be removed or demoted. |
| `/setup/alerts` | Edits thresholds. |

`/reports` redirects to `/reports/pieces`; `/setup` redirects to `/setup/products`. The former `/setup/paper-catalog` URL redirects to `/setup/products`.

The server's JSON API, used by the pages (all answers are JSON; errors come as `{ "error": "…" }` with a readable message):

| Endpoint | Purpose |
| --- | --- |
| `GET /api/session` | Who is signed in on this device, or, when nobody is: whether this is the first start, whether the device is set up for quick sign-in, whether this is the demo, and the names to show (set-up devices only). |
| `POST /api/session` | Sign in with `{ method: "pin", userId, pin }` (set-up devices only) or `{ method: "password", email, password, trustDevice?, deviceName? }`. |
| `PATCH /api/session` | Managers: `{ recordingAs }` records on someone's behalf (`null` or their own ID to stop). |
| `DELETE /api/session` | Sign out. |
| `POST /api/setup` | First start of a real factory: creates the first manager and sets up this device. Refused once anyone exists. |
| `GET /api/sync?since=<version>` | The whole state (`since=0`) or the items changed since that version; `active=1` tells the server the person used the app since the last check. |
| `POST /api/commands` | `{ command, since }`: applies one change and answers with its result and the changes since `since`. |
| `GET/POST/DELETE /api/devices` | Managers: list the devices set up for quick sign-in, set up this one, remove one (`?id=`). |
| `POST /api/demo/reset` | Demo mode only, managers: puts the sample factory back. |

Requests that change something must come from the app's own pages (same `Origin`). Status codes: 400 for a refused change or invalid input, 401 when the session has ended, 403 for missing access or another site, 429 while a sign-in lock is active, 503 when no database is configured.

All report sections support a duration filter for preset periods or a custom date range. Their export dialog defaults to a StockMaster-style Excel workbook (`.xlsx`) with a Summary sheet and separate filterable detail sheets; a flat CSV and print/PDF output are also available. Exported reports include the configured business details from `/setup/business`.

## 12. Setup data and configuration

The Setup screens send commands to the server like the production screens, so a change reaches every device within a few seconds:

- Products receive generated IDs based on their names.
- Piece sizes receive generated IDs based on grams.
- Suppliers receive generated IDs based on a slugged name.
- Users receive generated IDs and initials.
- Recipe versions must total exactly 100% (within 0.01 percentage points) and name each ingredient once before saving.
- Output categories are the rows shown on station recording forms and can be extended with custom rows.
- Setup edits preserve entity IDs so existing references remain valid. Delete actions are checked on the server (a supplier with lots, a product with batches, a person in the audit history and so on cannot be deleted) as well as disabled in the screens.
- Passwords and PINs are sent once and stored only as hashes; the forms never show them. Leaving **New PIN** or **New password** blank keeps the current one.
- Routes keep their station sequence fixed because station IDs are part of production and report logic; only route descriptive fields are editable.
- Recipe version history, station measurements, holds, corrections, and production-created lots are audit data, not disposable setup rows.

A real factory starts with the line configuration from `configState()`: the bean, stored-nib and Chocolate from store products, the eight chocolate types from the factory's regular recipes table (section 5), an empty mixer, the piece sizes (7 g, 45 g and 80 g bars, 200 g sachet, and 1 kg pack; more can be added), three routes, the containers, output rows and threshold values. It has no batches, lots, suppliers or people until they are entered, and its contact details in Setup → Business details start blank. The demo adds eight staff (a manager, quality, and two people for each part of the line), six customers, nine suppliers (two or three for each material bought: cocoa beans, sugar, cocoa butter, milk powder, lecithin and liquor) and business contact details (`seedState()`), then about six weeks of production ending the day it is set up (`demoState()` in `src/server/demo.ts`). The weeks are made by running the same commands people run, in order, through `applyCommand()`, so every lot, use, balance and trace adds up exactly as if the factory had recorded them; only the clock is set for each one. They contain deliveries of every material with the supplier's batch number and delivery note, some beans received straight onto the line; bean batches through every station, some making their own chocolate at mixing and some storing their liquor, butter or nibs; stored nibs pressed later; chocolate of all eight types made from store, one run on top of the other, with the mixer emptied before a type that cannot be made on top of what it holds; pieces in every size; orders dispatched to six customers (a supermarket chain, a hotel, a distributor, a bakery, a duty-free shop and the factory shop), taken from the oldest lots, one of them entered for the wrong customer and cancelled; a released hold and two corrections; and a production plan set two and a half weeks earlier. It ends with a batch waiting at every station, one on hold at roasting, chocolate waiting to be made into pieces, the mixer holding 10 kg of 85% Dark, and milk powder low. Working days are Monday to Saturday; the weights vary from batch to batch, the same way each time the demo is made.

**A database started by an older version.** The configuration is stored once, when the database is empty. When a newer version of the app starts on an existing database whose workflow version is lower than the app's (`WORKFLOW_VERSION` in `src/lib/seed.ts`), `upgradeConfiguration()` in `src/server/reduce.ts` brings it up to date and logs an `upgradeConfiguration` entry in `app_commands`. Batches, lots and what the factory added itself are kept:

- From before version 3: the routes and output rows become the current ones (custom rows stay), **Chocolate from store** is added, and a product that stood for one chocolate type stays only where a batch was made of it.
- The chocolate types become those of the recipes table. A type that was already made keeps its versions and gets the table's recipe as a new version; a type never made is replaced by the table's; a type earlier versions started with that the table does not have (55% Dark) is removed unless it was made or is on the production plan. Types the factory added itself stay.

Raise `WORKFLOW_VERSION` when the seeded configuration changes, so existing databases get it too.

## 13. Navigation and visual system

`Shell.tsx` provides:

- a menu that depends on access: operators get **My work** and **Production line**; managers get Overview, Production line, Production plan, Store, Batch tracing, Chocolate types, Reports and Setup, plus **My work** when they have their own stations (the plan and Batch tracing stay off the phone bar so it fits; Overview links to the plan and the Store to Batch tracing; lot records and receiving under `/materials` show the Store as the current page);
- production part links with waiting counts;
- a desktop top bar with the current page and a search box;
- a mobile header with the person's name, search and sign-out; and
- a fixed mobile bottom navigation bar.

Controls on the floor screens are at least 44–48 px tall for gloved or wet hands, and weight fields open the number keypad on phones. On phones the losses report shows one card per batch instead of the wide grid.

`ui.tsx` centralizes the visual primitives used across screens. `globals.css` defines the design tokens, responsive layout, forms, tables, notices, status badges, and StockMaster-inspired navy/orange visual language.

## 14. Local development and checks

Install and run the app with:

```bash
npm install
npm run dev
```

The dev server is configured for `http://127.0.0.1:3100`. Without `DATABASE_URL` it keeps the data in an embedded PostgreSQL under `.data/` and runs as the demo. To run against PostgreSQL:

```bash
DATABASE_URL=postgres://user:password@localhost:5432/cocoa npm run dev                  # a real factory
DATABASE_URL=postgres://user:password@localhost:5432/cocoa DEMO_MODE=true npm run dev   # the demo on PostgreSQL
```

For production, `npm run build` and then `npm start` (Next.js listens on `PORT`).

Available checks are:

```bash
npm run typecheck
node browser-check.cjs
node interaction-audit.cjs
```

Both browser scripts expect a demo instance to be running on port 3100 (set `BASE_URL` for another address): they sign in as the sample manager and reset the demo data first, then look up the batches they work with in it (the bean batch waiting at winnowing, the Chocolate from store batch waiting at mixing) and read the lot numbers they make from the screen, since the demo's numbers depend on its weeks of production. They use Playwright with Microsoft Edge. The browser check covers PIN and email sign-in, the queues of all 13 stations of the line, one-screen recording with the live check, the nib split, labels, mixing runs with the changeover sheet's example, a blocked changeover and taking the leftover out, Chocolate from store, counting pieces from a chocolate lot and the Pieces made report, the production plan (progress, a duplicate line refused, changing it, reading it as an operator), receiving a delivery in one form, the batch steps with inline corrections, holds, completion, the chocolate types and adding a new one, reports, setup, the phone layout and operator menus. `interaction-audit.cjs` clicks through the same flows, saving before/after screenshots and a report under its configured output directory.

## 15. Current scope and limitations

- One installation serves one factory. The whole state is loaded into each signed-in browser, which suits one factory's records but not many factories on one server.
- Changes from other devices arrive by polling every 5 seconds, not instantly.
- Recording needs a connection to the server. Without one, saving fails with a message and the typed weights stay on the screen; nothing is queued offline.
- There is no emailed password reset: a manager sets a new password or PIN in Setup → Users.
- The audit log (`app_commands`) is kept in the database but not yet shown in the app; holds and corrections have their own reports.
- On a new real factory, the first person to open the app creates the first manager. Open it and set it up right after deploying.
- Back up the PostgreSQL database with your provider's backup feature or regular exports (`pg_dump`). The embedded database is a folder on one computer and is meant for local use.
- Weights are recorded in kilograms and rounded to two decimals; pieces are counted, and the chocolate they use is worked out to the gram.
