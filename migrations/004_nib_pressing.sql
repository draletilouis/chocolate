-- Correct the process model to match the factory's paper forms:
-- nibs split at winnowing (liquor / butter / sale), pressing takes nibs (not
-- liquor) and yields butter + powder exactly, and roasted beans can be taken
-- off the line. Recorded batches keep their history unchanged.

UPDATE routes SET
  name = 'Nibs to butter and powder',
  start_material = 'Nibs',
  note = 'Butter and powder together must equal the nibs pressed. Powder is sold or discarded.'
  WHERE id = 'pressing';
UPDATE routes SET
  note = 'Nibs split at winnowing: liquor nibs continue to grinding; butter nibs become a lot for pressing; sale nibs leave production.'
  WHERE id = 'beans';

-- Keep the existing product id so batches that reference it stay valid.
UPDATE products SET name = 'Nib pressing', prefix = 'PB' WHERE id = 'P-LIQUOR' AND route_id = 'pressing';

-- Rebuild the predefined output rows for the reworked stations in their
-- worker-facing order. Custom rows added on site are kept.
DELETE FROM output_categories WHERE custom = FALSE AND station IN ('roasting', 'winnowing', 'grinding', 'pressing');
INSERT INTO output_categories(station, name, kind, custom) VALUES
  ('roasting', 'Roasted beans', 'useful', FALSE),
  ('roasting', 'Beans taken off', 'useful', FALSE),
  ('roasting', 'Unusable beans', 'waste', FALSE),
  ('roasting', 'Other measured loss', 'waste', FALSE),
  ('winnowing', 'Nibs', 'useful', FALSE),
  ('winnowing', 'Nibs for butter', 'useful', FALSE),
  ('winnowing', 'Nibs for sale', 'useful', FALSE),
  ('winnowing', 'Whole peeled beans', 'useful', FALSE),
  ('winnowing', 'Husks', 'byproduct', FALSE),
  ('winnowing', 'Unusable beans', 'waste', FALSE),
  ('grinding', 'Liquor', 'useful', FALSE),
  ('grinding', 'Waste', 'waste', FALSE),
  ('pressing', 'Cocoa butter', 'useful', FALSE),
  ('pressing', 'Powder', 'useful', FALSE)
ON CONFLICT (station, name, kind) DO NOTHING;

-- Pressing must balance exactly; nothing may be unaccounted.
UPDATE thresholds SET variance_pct = variance_pct || '{"pressing": 0}'::jsonb WHERE id = 'default';
