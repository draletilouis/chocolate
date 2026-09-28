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
- **Managers** also see **Overview**, **Materials**, **Recipes**, **Reports** and **Setup**.
  - A manager who has their own stations also gets **My work**.

The sections are:

- **My work** — the batches waiting at your stations, each with one button to record it.
- **Overview** — production summary and alerts.
- **Production line** — every active batch, where it is waiting, and the five parts of the line.
- **Materials** — raw materials, intermediate products, by-products, rework and finished-goods lots.
- **Recipes** — recipe versions and ingredient comparisons.
- **Reports** — losses, missing weight, batch history, corrections and holds.
- **Setup** — products, pack sizes, containers, output rows, routes, suppliers, users and thresholds.

On a phone, use the bottom bar. On a desktop, use the sidebar.

**Finding a batch or lot:**

- **Search:** type a batch name, batch ID, lot ID, material or supplier into the search box (top bar on a desktop, magnifier on a phone, or the box on **My work**).
- **Scan:** point the phone camera at the QR code on a batch card or label and open the link. It goes straight to the station where that batch is waiting.

## 3. Start a batch

### Receive a delivery of beans

1. On **My work**, select **Receive a delivery** (or **New batch** on the production line).
2. Choose the **Supplier**. The **Batch name** fills itself in from the supplier and the date, for example `Kuapa 28 Sep`; change it if you like. The name and supplier are printed on labels.
3. Weigh the delivery and enter the **Delivered weight**.
4. Enter the **Accepted beans** and any **Rejected beans**. The bar at the bottom checks the balance while you type.
5. Select **Save delivery**.

The batch and its receiving record are saved together. The next screen shows the **Batch card**, which carries the batch name, the supplier and a QR code. Select **Print batch card** and keep it with the beans, then select **Record sorting** when they are sorted.

### Other batches

For stored nibs (butter & powder) or chocolate:

1. Choose the product.
2. Enter the batch date and an optional name.
3. Enter the starting weight, or for chocolate the recipe version and the ingredient weights and lots.
4. Select **Create batch and record…**.

To start a chocolate batch from a lot, open the lot (or scan its label) and select **Use in a chocolate batch**. That lot is already chosen for its ingredient.

The system keeps a unique batch ID such as `CH-019` for links and traceability.

## 4. Record work at a station

Open the batch from **My work**, a station queue, the batch page or a scanned code. Everything for the station is on one screen:

1. **Input.** The weight sent from the previous station is already filled in. If you reweighed it, select **Reweighed? Change** and enter the new reading.
2. **Weights.** Enter the kilograms beside each output. Leave a row empty if there was none. Select **Add another output** for anything not listed.
3. **Containers.** If you weigh in a container (husk bin, nib bucket, butter tub…), pick it next to the weight and type the scale reading. Its empty weight is taken off and the net weight is shown. The container you used last time is picked for you.
4. **Where it goes.** Each output shows where it goes as a coloured tag (→ next station, Keep in store, For sale, Rework, Waste bin). The usual choice is already set; tap the tag to change it.
5. **Check.** The bar at the bottom shows how much is still unassigned or missing, and turns orange when it is above the limit. Check the scale and the container before saving.
6. **Save.** Select **Save** (for example **Save winnowing**).

For Packaging, choose the pack size and enter the total and rejected units; accepted units are worked out.

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
4. **Chocolate making:** Mixing, Refining, Conching, Tempering.
5. **Finishing:** Moulding, Packaging, Completion.

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
- packaging counts are correct; and
- any holds have been released.

Enter an optional closing note and select **Complete batch**. A completed batch is closed for normal recording, but its history and corrections remain visible.

## 10. Receive and trace materials

### Receive a delivery

1. Open **Materials**.
2. Select **Receive material**.
3. Choose the material.
4. Choose the supplier.
5. Add an invoice or delivery reference if needed.
6. Enter the physically measured weight.
7. Select **Save receipt**.

The system creates a new lot. The lot's available quantity starts at the received quantity.

### Review a lot

Select a lot from **Materials** to see:

- received, used, and available quantity;
- supplier or producing batch;
- the station that produced it;
- batches that used it; and
- lots made by those downstream batches.

This is the traceability path from a supplier delivery through production.

Lots made by a batch also show a printable **label** with the batch name, supplier, weight and a QR code; scanning the code opens the lot. Lots used in chocolate recipes (for example liquor or cocoa butter) have a **Use in a chocolate batch** button that starts a batch with that lot already chosen.

## 11. Manage recipes

Open **Recipes** to see current versions and how many batches used each recipe.

To add a recipe version:

1. Open a recipe.
2. Select **New version**.
3. Update ingredient names and percentages.
4. Make sure the total is exactly 100%.
5. Enter what changed.
6. Select **Save version**.

Older versions stay available. A batch keeps the recipe version and expected-versus-actual ingredient weights that were used when it started.

## 12. Use reports

Open **Reports** and choose a section:

- **Weight loss by process** — compare input and useful output at each stage, follow one batch, or compare losses across processes.
- **Waste & variance** — filter station records and compare waste, by-products, unaccounted variance, and configured limits.
- **Batch history** — see all batches, statuses, stations, starting input, final useful output, and total variance.
- **Corrections** — see every changed weight, reason, time, and user.
- **Holds** — see when holds were placed, why, by whom, and whether they were released.

Use the duration filter on any report to select all time, today, this week, this month, this year, or a custom date range. Select **Export report** to download the selected report; the default **Excel workbook (.xlsx)** contains a Summary sheet and separate filterable detail sheets. CSV and print/PDF options are also available.

Use the Overview page for a quick view of active batches, alerts, completed batches, and recent station records.

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
- **Pack sizes** — grams per unit used in Packaging.
- **Containers** — bins, buckets and tubs with their empty weight, taken off the scale reading at every station.
- **Output categories** — the standard rows workers see at each station.
- **Routes** — the default station order for each batch type.
- **Suppliers** — delivery sources and contact details.
- **Users** — staff accounts with email, password, 4-digit PIN, **Operator** or **Manager** access, and the stations on each person's **My work** page. To reset a forgotten password or PIN, edit the person and type a new one. The idle sign-out time and the devices set up for quick sign-in are here too. At least one person must keep manager access.
- **Alert thresholds** — station variance limits, waste limit, and low-stock warning.

Changes are saved on the server and reach every device within a few seconds. Business details are included in future reports.

**Records from the old browser version.** If this browser was used with the earlier version that kept records in the browser itself, **Setup → Business details** shows **Records saved in this browser** with an **Upload to the server** button. Uploading replaces the batches, lots and settings on the server with that browser's records. People from it are added; anyone who had no password or PIN, or still had the sample one, needs a new one from you in **Setup → Users**.

Setup rows can be edited with the pencil action and deleted with the trash action. Deletion is deliberately guarded: products used by recipes or batches, pack sizes used by packaging records, suppliers referenced by lots, routes used by products or batches, and users referenced by audit history cannot be deleted. Output rows can be removed, but this only changes the rows shown on future station forms; old records remain unchanged.

Other editable areas follow the same traceability rule. Recipe names and batch names/notes can be changed; recipe versions, measured station records, holds, corrections, and production-created lots remain immutable history. Supplier lots can have their descriptive details corrected, and a lot can be deleted only when it is completely unused. A blank, unrecorded batch can be deleted; a batch with production history cannot.

## 15. Important operating notes

- Enter actual measured values, not estimates.
- A useful output stored as a lot is not automatically carried into the next station.
- By-products are tracked separately and are not counted as recorded waste.
- Missing weight is reported separately from waste.
- Pick the container when you weigh in one, so its empty weight is taken off.
- Sign out when you hand the device over, so the next records carry the right name.
- Saving needs a connection to the server. If the connection drops, a banner says so and the weights you typed stay on the screen: save again once it is back.
- If someone else saves the same station for the same batch while you are typing, the form tells you within a few seconds and **Save** turns off, so nobody's weights are overwritten. Select **See the saved weights**, then **Edit weights** if they need changing.
