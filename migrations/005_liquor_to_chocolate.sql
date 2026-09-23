-- The liquor is what becomes chocolate: there is no mixing step. The liquor and
-- the recipe additions go straight into the refiner. Grinding and pressing end
-- with stored lots (liquor, butter) that chocolate batches start from. Every
-- batch also records the supplier its cocoa came from.

ALTER TABLE batches ADD COLUMN IF NOT EXISTS supplier_id TEXT REFERENCES suppliers(id);
CREATE INDEX IF NOT EXISTS idx_batches_supplier ON batches(supplier_id);

UPDATE routes SET
  name = 'Liquor to chocolate',
  stations = '["refining", "conching", "tempering", "moulding", "packaging", "completion"]'::jsonb,
  start_material = 'Liquor + recipe additions',
  note = 'The liquor becomes chocolate: it goes into the refiner with the butter, sugar and milk powder from the recipe.'
  WHERE id = 'chocolate';
UPDATE routes SET note = 'Each batch is assigned to the supplier of its beans. Nibs split at winnowing: liquor nibs are ground and the liquor is stored for chocolate; butter nibs are stored for pressing; sale nibs leave production.'
  WHERE id = 'beans';
UPDATE routes SET note = 'Butter and powder together must equal the nibs pressed. Butter is stored for chocolate; powder is sold or discarded.'
  WHERE id = 'pressing';

-- Chocolate batches still waiting for mixing go straight into the refiner with
-- what was weighed in at the start.
UPDATE batches SET next_station = 'refining' WHERE next_station = 'mixing' AND route_id = 'chocolate';
UPDATE batches SET start_input = jsonb_set(start_input, '{material}', '"Liquor + recipe additions"')
  WHERE route_id = 'chocolate' AND start_input->>'material' = 'Recipe ingredients';

-- Liquor or butter that was sent on to mixing never became a lot. Reopen the
-- destinations at that station so the output can be stored instead.
UPDATE batches b SET
  records = (
    SELECT jsonb_agg(CASE WHEN x.r->'outputs' @> '[{"destination": "continue:mixing"}]'::jsonb
      THEN jsonb_set(x.r, '{destinationsSaved}', 'false'::jsonb) ELSE x.r END ORDER BY x.ord)
    FROM jsonb_array_elements(b.records) WITH ORDINALITY AS x(r, ord)),
  next_station = COALESCE((
    SELECT y.r->>'station' FROM jsonb_array_elements(b.records) AS y(r)
    WHERE y.r->'outputs' @> '[{"destination": "continue:mixing"}]'::jsonb LIMIT 1), 'completion')
  WHERE b.next_station = 'mixing' AND b.route_id <> 'chocolate' AND jsonb_array_length(b.records) > 0;

-- Mixing no longer exists. Recorded mixing steps stay in each batch's history.
DELETE FROM output_categories WHERE station = 'mixing';
UPDATE thresholds SET variance_pct = variance_pct - 'mixing' WHERE id = 'default';

-- Bean batches: the supplier of the delivery they started from.
UPDATE batches b SET supplier_id = l.source->>'supplierId'
  FROM lots l
  WHERE b.supplier_id IS NULL AND b.route_id = 'beans'
    AND l.id = b.start_input->'lotIds'->>0
    AND l.source->>'type' = 'supplier'
    AND EXISTS (SELECT 1 FROM suppliers s WHERE s.id = l.source->>'supplierId');

-- Other batches inherit it from the first starting lot made by a batch that has
-- one. Run twice so a chain (beans → pressing → chocolate) is filled end to end.
UPDATE batches b SET supplier_id = (
    SELECT src.supplier_id
    FROM jsonb_array_elements_text(b.start_input->'lotIds') WITH ORDINALITY AS u(lot_id, ord)
    JOIN lots l ON l.id = u.lot_id AND l.source->>'type' = 'batch'
    JOIN batches src ON src.id = l.source->>'batchId'
    WHERE src.supplier_id IS NOT NULL
    ORDER BY u.ord LIMIT 1)
  WHERE b.supplier_id IS NULL AND b.route_id <> 'beans';
UPDATE batches b SET supplier_id = (
    SELECT src.supplier_id
    FROM jsonb_array_elements_text(b.start_input->'lotIds') WITH ORDINALITY AS u(lot_id, ord)
    JOIN lots l ON l.id = u.lot_id AND l.source->>'type' = 'batch'
    JOIN batches src ON src.id = l.source->>'batchId'
    WHERE src.supplier_id IS NOT NULL
    ORDER BY u.ord LIMIT 1)
  WHERE b.supplier_id IS NULL AND b.route_id <> 'beans';
