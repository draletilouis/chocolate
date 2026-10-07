# Chocolate Factory user guide

This guide explains how factory staff use Chocolate Factory to start batches, record production, manage materials, and review results.

## 1. Sign in

Open the factory's web address in the browser of any phone, tablet or computer. Everyone uses the same records: what one person saves appears on the other devices within a few seconds.

**On a shared tablet or PC set up by a manager:**

1. Tap your name under **Who is recording?**
2. Enter your 4-digit PIN on the keypad (a keyboard works too).

**On any other device, such as your own phone:** enter your email and password. Your manager gives you these; ask them for a new password or PIN if you forget one.

After five wrong PINs, PIN sign-in is locked for 15 minutes for that person. Email and password still work.

Your name is attached to every measurement, hold and correction you make. When you hand the device to someone else, select **Sign out** (the arrow icon). The next person taps their own name.

You are signed out on your own after a few minutes without use (10 by default; a manager can change this in **Setup → Users**). Anything not yet saved is lost then, so save as soon as you have weighed.

**First start.** On a new installation the app opens on **Set up your factory**. The person setting it up enters their name, email, a password and a PIN and becomes the first manager; that device is set up for quick sign-in.

**Setting up a shared tablet or PC (managers).** On the device, sign in with your email and password and tick **Set up this device for quick sign-in**, then name it after where it is used, for example *Roasting tablet*. You can also do it in **Setup → Users → Devices set up for quick sign-in**. If a tablet is lost, remove it there: PINs stop working on it and anyone signed in on it is signed out.

**Demo.** In the demo every account uses the PIN `1234`, or the email `alex.morgan@cocoafactory.example` with the password `cocoa123`, and every device shows the names.

## 2. Find your way around

What you see depends on your access:

- **Operators** see **My work** and **Production line**.
- **Managers** also see **Overview**, **Production plan**, **Store**, **Batch tracing**, **Chocolate types**, **Reports** and **Setup**.
  - A manager who has their own stations also gets **My work**.

The sections are:

- **My work** — the batches waiting at your stations, each with one button to record it.
- **Overview** — production summary, the production plan's progress and alerts.
- **Production line** — every active batch, where it is waiting, and the five parts of the line.
- **Production plan** — the pieces to make of each chocolate type and size, how many are made and what is left. On a phone, open it from **Overview**. People working at Mixing or Pieces find it on **My work**.
- **Store** — everything in store by batch number: the ingredients (cocoa beans, liquor, cocoa butter, sugar, milk powder), the chocolate, the finished pieces and every other product the line kept, such as butter, powder and nibs.
- **Batch tracing** — enter a batch or lot number to see everything that went into it and everything it went into. On a phone, open it from **Store** (**Trace a batch**).
- **Chocolate types** — each type's recipe, its versions and ingredient comparisons.
- **Reports** — losses, missing weight, batch history, corrections and holds.
- **Setup** — products, piece sizes, containers, output rows, routes, suppliers, users and thresholds.

On a phone, use the bottom bar. On a desktop, use the sidebar.

**Finding a batch or lot:** type a batch name, batch ID, lot ID, material or supplier into the search box (top bar on a desktop, magnifier on a phone, or the box on **My work**).

## 3. Start a batch

### Receive a delivery of beans

1. On **My work**, select **Receive a delivery** (or **New batch** on the production line).
2. Choose the **Supplier**. If the beans were already received into the store, choose their lot under **Beans from** instead: the weight you enter is taken off that lot. The **Batch name** fills itself in from the supplier and the date, for example `Kuapa 28 Sep`; change it if you like. The name and supplier are printed on labels.
3. Weigh the delivery and enter the **Delivered weight**.
4. Enter the **Accepted beans** and any **Rejected beans**. The bar at the bottom checks the balance while you type.
5. Select **Save delivery**.

The batch and its receiving record are saved together. The next screen shows the **Batch card**, which carries the batch name and the supplier. Select **Print batch card** and keep it with the beans, then select **Record sorting** when they are sorted.

### Other batches

For stored nibs (butter & powder), or to make chocolate from liquor and cocoa butter already in store:

1. Choose the product: **Stored nibs (butter & powder)** or **Chocolate from store**.
2. Enter the batch date and an optional name.
3. For stored nibs, choose the lot they are **Taken from** (the oldest in store is suggested) and enter the starting weight. The weight is taken off that lot. If the nibs come from more than one lot, select **+ From another lot too** and enter the weight from each; if you enter more than a lot holds, the screen offers to take the rest from the next lot. Each lot is drawn down by its own weight, and the starting weight is their total. Chocolate from store needs none: its ingredients are weighed in at mixing, and each one is taken off the lot it came from.
4. Select **Create batch and record…**.

You can also start Chocolate from store from the Mixing queue (**Mix from store**) or from a liquor, cocoa butter, sugar or milk powder lot (**Mix chocolate from store**).

The system keeps a unique batch ID such as `CH-019` for links and traceability.

## 4. Record work at a station

Open the batch from **My work**, a station queue, the batch page or search. Everything for the station is on one screen:

1. **Input.** The weight sent from the previous station is already filled in. If you reweighed it, select **Reweighed? Change** and enter the new reading.
2. **Weights.** Enter the kilograms beside each output. Leave a row empty if there was none. Select **Add another output** for anything not listed.
3. **Containers.** If you weigh in a container (husk bin, nib bucket, butter tub…), pick it next to the weight and type the scale reading. Its empty weight is taken off and the net weight is shown. The container you used last time is picked for you.
4. **Where it goes.** Each output shows where it goes as a coloured tag (→ next station, Keep in store, For sale, Rework, Waste bin). The usual choice is already set; tap the tag to change it.
5. **Check.** The bar at the bottom shows how much is still unassigned or missing, and turns orange when it is above the limit. Check the scale and the container before saving.
6. **Save.** Select **Save** (for example **Save winnowing**).

Pieces are counted from the chocolate lots instead: see "Make pieces".

After saving, the top of the screen shows what happens next: **Record pressing**, plus any other station now waiting (for example **Liquor grinding also waiting** after winnowing). Below that is the result in one line, what was weighed, and for liquor grinding the **Liquor label** to print. Select **Edit weights** if you need to change anything before the batch is completed.

Only output sent on to a station becomes that station's input. One batch can continue to more than one station: after winnowing, the batch waits at both pressing and liquor grinding.

**Entering a step early:** when a later process's scale log is ready before the batch reaches it, open the batch and select **Enter early** on that step. It is saved against the batch without changing where the batch is waiting.

## 5. Understand the balance

After saving, the result is one line:

- **Balance OK · 0.50 kg missing (0.55%)** — within the limit.
- **6.20 kg missing** or **more than went in** (orange) — above the limit or impossible; check the scale and the container.
- **Waste is … of the input** (amber) — waste is above the waste limit set in Setup.

Select **Show details** for the full figures:

- **Went in / Weighed out** — the input and everything weighed.
- **Good output** — material that can be used, stored or sold.
- **By-products** and **Waste** — recorded separately.
- **Missing weight** — input minus everything weighed. It is not counted as waste.
- **Yield** — good output as a share of the input.

## 6. Work with station queues

Your **My work** page lists the batches waiting at your own stations. To see any station, open a production part and then the station:

- **Ready to record** — batches with material waiting at this station.
- **On hold at this station** — batches that must be reviewed before work continues.
- **Recorded at this station** — recently completed records.

The five production parts are:

1. **Bean processing:** Receiving, Sorting, Roasting, Winnowing.
   - Sort the beans by hand, then reweigh them at **Sorting**.
   - Whole roasted beans taken off after roasting are weighed at **Roasting** and stored for sale.
   - At **Winnowing**, weigh the crushed nibs in portions: nibs for liquor, nibs for butter, nibs for sale. Husks are waste.
2. **Butter & powder:** Pressing, Butter sieving, Filter pan, Powder roasting, Powder crushing.
   - **Pressing** turns nibs into brown butter and cake (powder).
   - **Butter sieving**: the particles caught go to liquor grinding; the sieved butter goes to the filter pan.
   - **Filter pan**: weigh the clear butter as silk butter, butter for sale, and cocoa butter kept for production.
   - The cake can be roasted again at **Powder roasting** (or sent straight to crushing), then crushed, weighed and stored for sale at **Powder crushing**.
3. **Liquor:** Liquor grinding.
   - The nibs are ground twice, coarse then fine. Enter the liquor weight only **after fine grinding**. Sieved butter particles sent here are added to the input.
   - After saving, select **Print label**. The label carries the batch name, batch ID and supplier.
4. **Chocolate making:** Mixing — the chocolate types are made one after another (see "Make chocolate at mixing").
5. **Finishing:** Pieces, Completion.

### Make chocolate at mixing

Liquor from liquor grinding and cocoa butter from the filter pan go on to **Mixing**. There the chocolate types are made one after another, in **runs**. The mixer keeps some chocolate between types (10 kg to start; set in **Setup → Containers**), and each run is made on top of it. The screen works out what to add, as in the changeover sheet.

1. Open the batch at **Mixing**. The top shows what **the mixer holds**, for example *10.00 kg of 85% Dark*, and what this batch brought (for example *49.80 kg liquor left*).
2. Choose the **Chocolate type** and enter the **Fresh ingredients to run** in kg.
3. For each ingredient the screen shows what the mixer already holds and what to **add**. For 30 kg of 70% Dark on 10 kg of 85% Dark: add 16.50 kg liquor, 3.00 kg cocoa butter and 10.50 kg sugar.
4. Weigh each ingredient in and enter the weight. Choose where it comes from: **This batch** (its own liquor or cocoa butter) or a lot in store.
   - **When one lot is not enough:** if you enter more than the lot holds, the screen says so and offers **Take the other … kg from** the next lot. Select it and the ingredient is split: each lot gets its own line and weight. You can also select **+ From another lot too** and enter the weights yourself. Each lot is drawn down by its own weight, and the trace shows both.
5. Enter the **Chocolate taken out** and what is **Kept in the mixer for the next run** (0 if you run the mixer empty). The bar at the bottom checks the balance.
6. Select **Save** (for example **Save 70% Dark**). The chocolate becomes a lot, such as `D70-0002`.

Repeat for the next type. Some changeovers are not possible on top of what the mixer holds:

- **Too small a run:** for example 85% Dark on 15 kg of 56% Dark needs at least 25 kg, because the sugar already in the mixer cannot be taken out again. The screen tells you the smallest run.
- **An ingredient the new type has none of:** 100% Dark after a sweetened chocolate, or a dark chocolate after milk chocolate. Select **Take it out of the mixer** first; what you take out becomes a lot of that chocolate.

Made a mistake in the last run? Select **Undo** on it and enter it again. When the last type for the batch is made, select **Finish mixing**. Liquor or cocoa butter the batch did not use is kept in store as a lot, and the batch is ready to complete.

### Make pieces

The chocolate from each run waits at **Pieces** until it is made into pieces, the same day or later. The end result is the number of pieces of each size for each type of chocolate.

1. Open **Pieces** (Finishing, or **My work** if it is your station). It lists the chocolate lots with chocolate left, for example *D70-0002 · 70% Dark · 30.00 kg left*.
2. Select **Record pieces** on the lot you moulded.
3. Enter the number of good pieces of each size, for example 500 × 45 g bar and 90 × 80 g bar. Leave the other sizes empty.
4. The bar at the bottom shows how much chocolate that is and how much stays in the lot.
5. Select **Save pieces**. Each size becomes a lot of pieces, such as `FIN-0006 · 70% Dark · 45 g bar · 500`, with a label that traces back to the batch and the supplier.

Each size also shows how many pieces the production plan still needs of that type, for example *Plan: 300 still to make*.

Chocolate left in the lot stays there for the next time. Entered the wrong count? Select **Undo** next to it under **Pieces made from this lot** and enter it again. **Reports → Pieces made** adds up the pieces by type and size for any period.

### Follow the production plan

The plan says how many pieces of each chocolate type and size to make, for example 2000 × 70% Dark 45 g bars. Open **Production plan** (on a phone, from **Overview** or **My work**). It shows:

- **Pieces** — for each type and size: planned, made since the plan's start date, and left, with the chocolate the pieces left take.
- **Chocolate still to mix** — the chocolate for the pieces left, less what is already mixed and waiting at Pieces. Use it to choose the next runs at Mixing.
- **Ingredients to mix it** — the liquor, cocoa butter, sugar and milk powder that takes, against what is in store and at mixing. Anything short is marked in red.

Pieces count towards the plan as soon as they are saved at Pieces. The ingredient figures are a guide: they do not include what a changeover adds or what the mixer keeps.

**Managers: set or change the plan**

1. Open **Production plan** and select **Set the plan** (or **Change the plan**).
2. For each line, choose the chocolate type and size and enter the pieces to make. Select **Add a line** for more, or the bin to remove one. Each type and size goes on one line.
3. Set **Count pieces made from** to the day the plan starts; pieces saved before that day do not count. Add a note if you like, such as the week or order.
4. Select **Save plan**. Everyone sees the new plan straight away.

## 7. Put a batch on hold or release it

From a batch page:

1. Select **Put on hold**.
2. Enter the reason.
3. Select **Place hold**.

The batch appears as **On hold** and cannot be recorded at its next station until released.

To continue, a manager:

1. Opens the batch.
2. Selects **Release hold**.
3. Enters a release note.
4. Selects **Release**.

The hold and its release remain in the batch history and in **Reports → Holds**.

## 8. Correct a recorded weight

Use a correction when a saved weight was wrong, including on a completed batch:

1. Open the batch. Its **Steps** list shows every station in order: done, waiting or later.
2. Select **Details** on the step.
3. Select **Correct** next to the weight.
4. Enter the correct weight and say why.
5. Select **Save correction**.

While a batch is still in progress, you can also open the step's record and select **Edit weights**.

The original value is kept in the correction history. The corrected value is used in balances and reports. If the output created a lot, the lot quantity is adjusted as well.

## 9. Complete a batch

When the final production step is saved, select **Review & complete batch**.

Before completing, check:

- every required station has been recorded;
- every output has a saved destination;
- the station balances and warnings are understood;
- mixing is finished; and
- any holds have been released.

Enter an optional closing note and select **Complete batch**. A completed batch is closed for normal recording, but its history and corrections remain visible.

## 10. Receive and trace materials

### Receive a delivery

1. Open **Store**.
2. Select **Receive ingredient**.
3. Choose the material.
4. Choose the supplier. Those who supply the material (as listed under **Setup → Suppliers**) come first, and the first of them is chosen for you.
5. Enter the **Supplier's batch number** printed on the bag or the delivery note, and an invoice or delivery reference, if there are any.
6. Enter the physically measured weight.
7. Select **Save receipt**.

The system creates a new lot. The lot's available quantity starts at the received quantity. The lot ID, such as `SUG-0033`, is the delivery's **batch number**: it is never given to another delivery, and every later use is recorded against it. The supplier's own batch number is kept with it, shown on the trace, and found by search.

### Check the store

Open **Store** to see everything in store, in four parts:

- **Ingredients** — cocoa beans, liquor, cocoa butter, sugar and milk powder (and anything else a supplier delivered), with the kg in store, marked when it is below the low-stock limit;
- **Chocolate** — each type mixed and waiting to be made into pieces;
- **Finished pieces** — the counted pieces of each type and size; and
- **Other stored products** — everything else the line kept: silk butter, butter and nibs for sale, nibs for butter, cocoa powder, whole roasted beans, by-products and rework.

Under each one is every batch number with stock: who delivered it or which batch made it, the date, the amount received or made and what is left, and the batches that used it. Under **Cocoa beans** are also the beans received straight onto the production line, where the production batch is the batch number.

**Stock goes down by itself.** Whenever material is taken from the store, the weight comes off its lot: an ingredient weighed into a mixing run, beans or nibs a new batch starts from, chocolate made into pieces. Nobody adjusts the store by hand.

Select **Show used-up batches** to list the ones with nothing left. Select a batch number to trace it.

### Trace a batch from beginning to end

Open **Batch tracing** and enter the number of a finished product, a chocolate lot, an ingredient or a production batch (or pick one from the lists). The same page opens from **Trace** on any lot or batch.

- **Deliveries behind it** — one row for every purchased batch that went into it: ingredient, batch number, supplier, the supplier's batch number, delivery note and date.
- **How it was made** — each line is what went into the line above it, with the weight used. Pieces come from a chocolate lot; the chocolate from the ingredients of its mixing run and from what the mixer still held; liquor from the batch that ground it, back to the beans.
- **Where it went** — the other direction: the chocolate an ingredient was mixed into and the pieces counted from it. Use it to find every product that contains one delivery.

Chocolate left in the mixer links each run to the one before. It is followed three runs back (or forward); open the last lot shown to go further.

### Review a lot

Open a lot's record (**Open lot record** on its trace page, or a lot number on a batch) to see:

- received, used, and available quantity;
- supplier or producing batch;
- the station that produced it;
- batches that used it; and
- lots made by those downstream batches.

This is the traceability path from a supplier delivery through production.

Lots made by a batch also show a printable **label** with the batch name, supplier and weight. Lots of chocolate ingredients (liquor, cocoa butter, sugar or milk powder) have a **Mix chocolate from store** button that starts a Chocolate from store batch.

## 11. Manage chocolate types and recipes

Open **Chocolate types** to see every type with its current recipe and how many mixing runs made it. The factory starts with the types from its regular recipes table:

| Type | Liquor | Cocoa butter | Sugar | Milk powder |
| --- | --- | --- | --- | --- |
| 34% White | — | 35% | 35% | 30% |
| 40% Milk | 11% | 30% | 34% | 25% |
| 50% Milk | 25% | 25% | 25% | 25% |
| 54% Dark | 44% | 10% | 46% | — |
| 56% Dark | 50% | 10% | 40% | — |
| 70% Dark | 60% | 10% | 30% | — |
| 85% Dark | 75% | 10% | 15% | — |
| 100% Dark | 90% | 10% | — | — |

To add a chocolate type:

1. Select **New chocolate type**.
2. Enter its name, for example `60% Dark`.
3. Enter the percentage of each ingredient it uses and leave the others empty. Select **+ Add another ingredient** for anything else.
4. Make sure the total is exactly 100%.
5. Select **Save chocolate type**. It can now be chosen for a run at mixing.

Renaming a type (**Edit name**) changes it for new runs; runs and lots already made keep the name they were made under. A type can be deleted only while it has never been made.

To change a type's recipe, add a version:

1. Open the chocolate type.
2. Select **New version**.
3. Update ingredient names and percentages.
4. Make sure the total is exactly 100%.
5. Enter what changed.
6. Select **Save version**.

Older versions stay available. Each mixing run keeps the recipe version it used and its expected-versus-actual ingredient weights.

## 12. Use reports

Open **Reports** and choose a section:

- **Pieces made** (the first section) — the number of pieces of each size for each chocolate type, and every lot of pieces with the chocolate and batch it came from.
- **Yield by stage** — every batch as a share of its starting weight (the bag weight for a sack): the weight that went into each stage, and what became products, waste and loss. Follow one batch to see every output at every stage as a percentage of the stage input and of the starting weight, and **Where the batch went**, which adds up to 100%. Material sent on counts once, where it finally left the line; liquor and butter sent to mixing count as made into chocolate, because the chocolate also holds sugar and milk powder from store. **What a batch usually turns into** averages the completed batches of one kind; enter a weight, such as a 45 kg sack, to see what to expect from it. Loss at each process compares the processes.
- **Waste & variance** — filter station records and compare waste, by-products, unaccounted variance, and configured limits.
- **Batch history** — see all batches, statuses, stations, starting input, and the products, by-products, waste and unweighed loss of each, in kg and as a share of the starting weight.
- **Corrections** — see every changed weight, reason, time, and user.
- **Holds** — see when holds were placed, why, by whom, and whether they were released.

Use the duration filter on any report to select all time, today, this week, this month, this year, or a custom date range. Select **Export report** to download the selected report; the default **Excel workbook (.xlsx)** contains a Summary sheet and separate filterable detail sheets. CSV and print/PDF options are also available.

Use the Overview page for a quick view of active batches, alerts, completed batches, the production plan, and recent station records.

## 13. Respond to alerts

Alerts can mean:

- station variance is above its limit;
- recorded waste is above the global waste limit;
- a batch is on hold; or
- a raw-material lot is below the low-stock threshold.

Select an alert to open the related batch or material lot. Investigate the scale reading, tare, destination, or inventory quantity, then add a correction or note when appropriate.

## 14. Setup tasks

Users with access to Setup can configure:

- **Business details** — the business name and contact details shown on exported Excel and print/PDF reports.
- **Products** — products, batch prefixes, routes, and recipes.
- **Piece sizes** — the sizes chocolate is made into (7 g, 45 g and 80 g bars, 200 g sachet, 1 kg pack to start). Add a size whenever a new one is made; a size already made cannot be deleted.
- **Containers** — bins, buckets and tubs with their empty weight, taken off the scale reading at every station.
- **Output categories** — the standard rows workers see at each station.
- **Routes** — the default station order for each batch type.
- **Suppliers** — delivery sources and contact details.
- **Users** — staff accounts with email, password, 4-digit PIN, **Operator** or **Manager** access, and the stations on each person's **My work** page. To reset a forgotten password or PIN, edit the person and type a new one. The idle sign-out time and the devices set up for quick sign-in are here too. At least one person must keep manager access.
- **Alert thresholds** — station variance limits, waste limit, and low-stock warning.

Changes are saved on the server and reach every device within a few seconds. Business details are included in future reports.

**Records from the old browser version.** If this browser was used with the earlier version that kept records in the browser itself, **Setup → Business details** shows **Records saved in this browser** with an **Upload to the server** button. Uploading replaces the batches, lots and settings on the server with that browser's records. People from it are added; anyone who had no password or PIN, or still had the sample one, needs a new one from you in **Setup → Users**.

Setup rows can be edited with the pencil action and deleted with the trash action. Deletion is deliberately guarded: products used by recipes or batches, piece sizes already made, suppliers referenced by lots, routes used by products or batches, and users referenced by audit history cannot be deleted. Output rows can be removed, but this only changes the rows shown on future station forms; old records remain unchanged.

Other editable areas follow the same traceability rule. Mixing runs are changed by undoing the last run before mixing is finished. Recipe names and batch names/notes can be changed; recipe versions, measured station records, holds, corrections, and production-created lots remain immutable history. Supplier lots can have their descriptive details corrected, and a lot can be deleted only when it is completely unused. A blank, unrecorded batch can be deleted; a batch with production history cannot. The ID of a deleted or removed lot or batch is never given to a new one, so a printed label never opens a different record; the numbering simply skips it.

## 15. Important operating notes

- Enter actual measured values, not estimates.
- A useful output stored as a lot is not automatically carried into the next station.
- By-products are tracked separately and are not counted as recorded waste.
- Missing weight is reported separately from waste.
- Pick the container when you weigh in one, so its empty weight is taken off.
- Sign out when you hand the device over, so the next records carry the right name.
- Saving needs a connection to the server. If the connection drops, a banner says so and the weights you typed stay on the screen: save again once it is back.
- If someone else saves the same station for the same batch while you are typing, the form tells you within a few seconds and **Save** turns off, so nobody's weights are overwritten. Select **See the saved weights**, then **Edit weights** if they need changing.
