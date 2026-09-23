-- Follow the factory's paper forms more closely. The bean summary starts a
-- sack at its bag weight (there is no separate receiving weigh-in), sorts off
-- unusable beans once after roasting, and names the winnowing outputs in its
-- own words. The tempering summary packs 7 g, 45 g, 80 g and 1 kg bars, and the
-- production summary lists seven recipes. Recorded batches keep their history.

-- Bean batches start at roasting, from the sack's bag weight.
UPDATE routes SET
  stations = '["roasting", "winnowing", "grinding", "completion"]'::jsonb,
  start_material = 'Raw beans',
  note = 'Each batch is one sack: it starts at the bag weight and is assigned to the supplier of its beans. Nibs split at winnowing: nibs for liquor are ground and the liquor is stored for chocolate; nibs for butter are stored for pressing; nibs for inclusion and sale leave production.'
  WHERE id = 'beans';

-- A receiving step already recorded stays in its batch's history but can no
-- longer be opened, so its destinations are closed as they stand. Batches
-- waiting for receiving go straight to roasting with what receiving carried
-- forward, or with the bag weight when nothing was recorded.
UPDATE batches b SET records = (
    SELECT jsonb_agg(CASE WHEN x.r->>'station' = 'receiving' THEN jsonb_set(x.r, '{destinationsSaved}', 'true'::jsonb) ELSE x.r END ORDER BY x.ord)
    FROM jsonb_array_elements(b.records) WITH ORDINALITY AS x(r, ord))
  WHERE b.records @> '[{"station": "receiving", "destinationsSaved": false}]'::jsonb;
UPDATE batches SET next_station = 'roasting' WHERE next_station = 'receiving';
DELETE FROM output_categories WHERE station = 'receiving';
UPDATE thresholds SET variance_pct = variance_pct - 'receiving' WHERE id = 'default';

-- Rebuild the predefined rows of the two stations in their worker-facing
-- order. Custom rows added on site are kept.
DELETE FROM output_categories WHERE custom = FALSE AND station IN ('roasting', 'winnowing');
INSERT INTO output_categories(station, name, kind, custom) VALUES
  ('roasting', 'Roasted beans', 'useful', FALSE),
  ('roasting', 'Beans taken off', 'useful', FALSE),
  ('roasting', 'Unusable beans sorted off', 'waste', FALSE),
  ('roasting', 'Other measured loss', 'waste', FALSE),
  ('winnowing', 'Crushed nibs for liquor', 'useful', FALSE),
  ('winnowing', 'Crushed nibs for butter', 'useful', FALSE),
  ('winnowing', 'Crushed nibs for other', 'useful', FALSE),
  ('winnowing', 'Nibs for inclusion and sale', 'useful', FALSE),
  ('winnowing', 'Whole peeled beans', 'useful', FALSE),
  ('winnowing', 'Husks and rubbish', 'byproduct', FALSE)
ON CONFLICT (station, name, kind) DO NOTHING;

-- Pack sizes from the tempering summary. A size no form uses is removed unless
-- a batch was already packed in it. An empty database gets them from the seed.
INSERT INTO pack_sizes(id, name, grams, sort_order)
  SELECT v.id, v.name, v.grams, v.sort_order
  FROM (VALUES ('PK-7', '7 g bar', 7, 1), ('PK-80', '80 g bar', 80, 3)) AS v(id, name, grams, sort_order)
  WHERE EXISTS (SELECT 1 FROM pack_sizes)
ON CONFLICT (id) DO NOTHING;
UPDATE pack_sizes SET name = '1 kg bar' WHERE id = 'PK-1000' AND name = '1 kg block';
DELETE FROM pack_sizes p WHERE p.id IN ('PK-100', 'PK-250')
  AND NOT EXISTS (SELECT 1 FROM batches b, jsonb_array_elements(b.records) AS r WHERE r->'packaging'->>'packSizeId' = p.id);
UPDATE pack_sizes SET sort_order = CASE id WHEN 'PK-7' THEN 1 WHEN 'PK-45' THEN 2 WHEN 'PK-80' THEN 3 WHEN 'PK-1000' THEN 4 ELSE sort_order + 100 END;

-- The four recipes on the production summary that the app lacked. The figures
-- are samples (liquor + butter make up the cocoa percentage) until the
-- factory's own are saved as a new version. A product already set up under the
-- same name is left alone.
INSERT INTO products(id, name, prefix, route_id, recipe_id, sort_order)
  SELECT v.id, v.name, 'CH', 'chocolate', v.recipe_id, 0
  FROM (VALUES
    ('P-WHITE', '34% White chocolate', 'R-WHITE'),
    ('P-50', '50% Dark milk chocolate', 'R-50'),
    ('P-56', '56% Dark chocolate', 'R-56'),
    ('P-100', '100% Dark chocolate', 'R-100')) AS v(id, name, recipe_id)
  WHERE EXISTS (SELECT 1 FROM routes WHERE id = 'chocolate')
    AND NOT EXISTS (SELECT 1 FROM products p WHERE LOWER(p.name) = LOWER(v.name))
ON CONFLICT (id) DO NOTHING;
INSERT INTO recipes(id, name, product_id, current_version, versions, sort_order)
  SELECT v.id, v.name, v.product_id, 1,
    jsonb_build_array(jsonb_build_object(
      'version', 1,
      'createdAt', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'),
      'ingredients', v.ingredients::jsonb,
      'note', 'Sample recipe: replace it with the factory''s figures as a new version.')),
    0
  FROM (VALUES
    ('R-WHITE', '34% White chocolate', 'P-WHITE', '[{"name": "Cocoa butter", "percent": 34}, {"name": "Sugar", "percent": 45.6}, {"name": "Milk powder", "percent": 20}, {"name": "Lecithin", "percent": 0.4}]'),
    ('R-50', '50% Dark milk chocolate', 'P-50', '[{"name": "Liquor", "percent": 38}, {"name": "Cocoa butter", "percent": 12}, {"name": "Sugar", "percent": 30}, {"name": "Milk powder", "percent": 19.6}, {"name": "Lecithin", "percent": 0.4}]'),
    ('R-56', '56% Dark chocolate', 'P-56', '[{"name": "Liquor", "percent": 50}, {"name": "Cocoa butter", "percent": 6}, {"name": "Sugar", "percent": 43.6}, {"name": "Lecithin", "percent": 0.4}]'),
    ('R-100', '100% Dark chocolate', 'P-100', '[{"name": "Liquor", "percent": 100}]')) AS v(id, name, product_id, ingredients)
  WHERE EXISTS (SELECT 1 FROM products p WHERE p.id = v.product_id AND p.recipe_id = v.id)
ON CONFLICT (id) DO NOTHING;

-- Products and recipes in the production summary's order, by cocoa percentage.
UPDATE products SET sort_order = CASE id
  WHEN 'P-BEANS' THEN 1 WHEN 'P-PRESS' THEN 2 WHEN 'P-LIQUOR' THEN 2
  WHEN 'P-WHITE' THEN 3 WHEN 'P-MILK' THEN 4 WHEN 'P-50' THEN 5 WHEN 'P-56' THEN 6
  WHEN 'P-70' THEN 7 WHEN 'P-85' THEN 8 WHEN 'P-100' THEN 9 ELSE sort_order + 100 END;
UPDATE recipes SET sort_order = CASE id
  WHEN 'R-WHITE' THEN 1 WHEN 'R-MILK' THEN 2 WHEN 'R-50' THEN 3 WHEN 'R-56' THEN 4
  WHEN 'R-70' THEN 5 WHEN 'R-85' THEN 6 WHEN 'R-100' THEN 7 ELSE sort_order + 100 END;
