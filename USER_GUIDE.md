# Cocoa Factory user guide

This guide explains how factory staff use Cocoa Factory to start batches, record production, manage materials, and review results.

## 1. Sign in

Open the app at `http://127.0.0.1:3100` and sign in with your staff email and password.

For the demo, use:

- Email: `alex.morgan@cocoafactory.example`
- Password: `cocoa123`

Your name is attached to measurements, holds, and corrections that you make. Select **Sign out** from the top bar when you are finished.

## 2. Find your way around

The main navigation is:

- **Overview** — production summary and alerts.
- **Production line** — active batches, waiting work, and the four parts of the line.
- **Materials** — raw materials, intermediate products, by-products, rework, and finished-goods lots.
- **Recipes** — recipe versions and ingredient comparisons.
- **Reports** — losses, variance, batch history, corrections, and holds.
- **Setup** — products, pack sizes, paper catalog, output rows, routes, suppliers, users, and thresholds.

Use **Setup → Paper catalog** to review the printed row labels transcribed from the factory's paper forms. It is a reference catalog; blank cells and unclear handwritten annotations are not treated as production measurements.

On a phone, use the bottom navigation bar. On a desktop, use the sidebar. Numbers beside Production and Overview show active batches and alerts that need attention.

## 3. Start a new batch

1. Open **Production line**.
2. Select **New batch**.
3. Choose the product.
4. Check the route shown by the system.
5. Enter an optional **Batch name**, such as `Monday morning roast`. This is the name staff will see in queues, records, alerts, and reports.
6. Enter the starting material or ingredient weights.
7. Add an optional note.
8. Select **Create batch and record…**.

For cocoa beans or pressing liquor, enter the positive starting weight shown by the scale.

For chocolate batches:

1. Select the recipe version.
2. Enter the planned batch size. This calculates expected ingredient quantities.
3. Enter the actual weight used for each ingredient.
4. Select the source lot for each ingredient when available.
5. Check the total weighed-in amount. This becomes the Mixing input.

The system keeps a unique batch ID such as `CH-019` for links and traceability, and opens the first station's recording screen. If no name is entered, the batch ID is used as the display name.

## 4. Record work at a station

Every station follows the same four-step process:

### Step 1: Confirm the input

The screen shows the material and weight carried from the previous station. Select **Confirm input** if the displayed weight is correct.

If you reweighed the material, select **Adjust weight**, enter the new scale reading, and confirm it. If nothing was carried forward, enter the weight you are starting with.

### Step 2: Enter what you measured

For a weighing station:

- Enter the measured kilograms beside each output.
- Leave a row empty when that output was not produced.
- Select **Add another output** for an output not listed.
- Classify a custom output as useful, by-product, or waste.
- Add a note if something unusual happened.

For Packaging:

- Choose the pack size.
- Enter total units made.
- Enter rejected units.
- Check the calculated accepted units and nominal accepted weight.

Enter what the scale or count shows. The system calculates totals, yield, waste, and variance.

### Step 3: Choose where outputs go

Choose a destination for every output:

- **Continue to…** — send the output to another station in this batch.
- **Store as a lot** — make it available as inventory.
- **Send to rework** — create a rework lot.
- **Waste bin** — record it as waste without creating a lot.

Only output assigned to **Continue to…** becomes the next station's input. Other useful outputs, such as husks, cocoa cake, or stored liquor, remain separate and do not get added to the next station automatically.

Select **Save destinations** when the choices are correct.

### Step 4: Continue or finish

After saving, you can:

- open the batch record;
- return to the station queue;
- re-enter the weights;
- record the next station; or
- review and complete the batch when all stations are finished.

## 5. Understand the calculated balance

The balance is based on the confirmed input and the measured outputs:

- **Measured output** — all useful, by-product, and waste weights entered.
- **Useful output** — material that can be used, stored, or reworked.
- **By-products** — secondary material recorded separately from waste.
- **Recorded waste** — material classified as waste.
- **Unaccounted variance** — input minus measured output. This is not automatically treated as waste.
- **Yield** — useful output as a percentage of input.
- **Waste** — recorded waste as a percentage of input.
- **Variance** — unaccounted variance as a percentage of input.

An orange warning means the variance is above the configured limit. If measured output is greater than input, check the scale reading and tare before saving.

## 6. Work with station queues

Open a production part, then open a station to see:

- **Ready to record** — batches whose next step is this station.
- **On hold at this station** — batches that must be reviewed before work continues.
- **Recorded at this station** — recently completed records.

The four production parts are:

1. **Bean processing:** Receiving, Roasting, Winnowing, Grinding.
2. **Pressing:** Pressing.
3. **Chocolate making:** Mixing, Refining, Conching, Tempering.
4. **Finishing:** Moulding, Packaging, Completion.

## 7. Put a batch on hold or release it

From a batch page:

1. Select **Put on hold**.
2. Enter the reason.
3. Select **Place hold**.

The batch appears as **On hold** and cannot be recorded at its next station until released.

To continue:

1. Open the batch.
2. Select **Release hold**.
3. Enter a release note.
4. Select **Release**.

The hold and its release remain in the batch history and in **Reports → Holds**.

## 8. Correct a recorded weight

Use a correction when a saved weight was entered incorrectly:

1. Open the batch.
2. Select **Add correction**.
3. Choose the station output to correct.
4. Enter the corrected weight.
5. Explain why it was changed.
6. Select **Save correction**.

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

- **Products** — products, batch prefixes, routes, and recipes.
- **Pack sizes** — grams per unit used in Packaging.
- **Paper catalog** — the product, summary, ready-product, packaging-item, and weekly-usage rows transcribed from the paper forms.
- **Output categories** — the standard rows workers see at each station.
- **Routes** — the default station order for each batch type.
- **Suppliers** — delivery sources and contact details.
- **Users** — staff accounts and the user used for recording.
- **Alert thresholds** — station variance limits, waste limit, and low-stock warning.

Changes apply immediately in the current browser.

## 15. Important operating notes

- Enter actual measured values, not estimates.
- A useful output stored as a lot is not automatically carried into the next station.
- By-products are tracked separately and are not counted as recorded waste.
- Variance is reported separately from waste.
- Save destinations after changing them; otherwise the batch cannot be completed.
- The current system stores data in this browser only. It is not shared between browsers or devices.
- **Setup → Alert thresholds → Reset to empty factory** clears recorded batches and material lots but keeps the setup and paper forms.
