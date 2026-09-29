-- The factory's own recipes, from its recipe sheet ("Dark Chocolate types
-- Changeover Recipes.xlsx", Regular recipes), replace the sample figures. A
-- recipe no batch has used is rewritten as version 1; a recipe a batch has used
-- gets the factory figures as a new current version, so past batches keep the
-- version they were made with. The sheet also has a 54% Dark chocolate.

INSERT INTO products(id, name, prefix, route_id, recipe_id, sort_order)
  SELECT 'P-54', '54% Dark chocolate', 'CH', 'chocolate', 'R-54', 0
  WHERE EXISTS (SELECT 1 FROM routes WHERE id = 'chocolate')
    AND NOT EXISTS (SELECT 1 FROM products WHERE LOWER(name) = LOWER('54% Dark chocolate'))
ON CONFLICT (id) DO NOTHING;
INSERT INTO recipes(id, name, product_id, current_version, versions, sort_order)
  SELECT 'R-54', '54% Dark chocolate', 'P-54', 1, '[]'::jsonb, 0
  WHERE EXISTS (SELECT 1 FROM products WHERE id = 'P-54' AND recipe_id = 'R-54')
ON CONFLICT (id) DO NOTHING;

WITH factory(id, ingredients) AS (VALUES
  ('R-WHITE', '[{"name": "Cocoa butter", "percent": 35}, {"name": "Sugar", "percent": 35}, {"name": "Milk powder", "percent": 30}]'),
  ('R-MILK', '[{"name": "Liquor", "percent": 11}, {"name": "Cocoa butter", "percent": 30}, {"name": "Sugar", "percent": 34}, {"name": "Milk powder", "percent": 25}]'),
  ('R-50', '[{"name": "Liquor", "percent": 25}, {"name": "Cocoa butter", "percent": 25}, {"name": "Sugar", "percent": 25}, {"name": "Milk powder", "percent": 25}]'),
  ('R-54', '[{"name": "Liquor", "percent": 44}, {"name": "Cocoa butter", "percent": 10}, {"name": "Sugar", "percent": 46}]'),
  ('R-56', '[{"name": "Liquor", "percent": 50}, {"name": "Cocoa butter", "percent": 10}, {"name": "Sugar", "percent": 40}]'),
  ('R-70', '[{"name": "Liquor", "percent": 60}, {"name": "Cocoa butter", "percent": 10}, {"name": "Sugar", "percent": 30}]'),
  ('R-85', '[{"name": "Liquor", "percent": 75}, {"name": "Cocoa butter", "percent": 10}, {"name": "Sugar", "percent": 15}]'),
  ('R-100', '[{"name": "Liquor", "percent": 90}, {"name": "Cocoa butter", "percent": 10}]')
), target AS (
  SELECT r.id, f.ingredients::jsonb AS ingredients, jsonb_array_length(r.versions) AS versions,
    EXISTS (SELECT 1 FROM batches b WHERE b.recipe_id = r.id) AS used
  FROM recipes r JOIN factory f ON f.id = r.id
)
UPDATE recipes r SET
  versions = CASE WHEN t.used
    THEN r.versions || jsonb_build_array(jsonb_build_object('version', t.versions + 1, 'createdAt', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'), 'ingredients', t.ingredients, 'note', 'Factory recipe sheet'))
    ELSE jsonb_build_array(jsonb_build_object('version', 1, 'createdAt', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'), 'ingredients', t.ingredients, 'note', 'Factory recipe sheet'))
  END,
  current_version = CASE WHEN t.used THEN t.versions + 1 ELSE 1 END
FROM target t WHERE r.id = t.id;

-- Products and recipes by cocoa percentage, as on the production summary.
UPDATE products SET sort_order = CASE id
  WHEN 'P-BEANS' THEN 1 WHEN 'P-PRESS' THEN 2 WHEN 'P-LIQUOR' THEN 2
  WHEN 'P-WHITE' THEN 3 WHEN 'P-MILK' THEN 4 WHEN 'P-50' THEN 5 WHEN 'P-54' THEN 6 WHEN 'P-56' THEN 7
  WHEN 'P-70' THEN 8 WHEN 'P-85' THEN 9 WHEN 'P-100' THEN 10 ELSE sort_order END;
UPDATE recipes SET sort_order = CASE id
  WHEN 'R-WHITE' THEN 1 WHEN 'R-MILK' THEN 2 WHEN 'R-50' THEN 3 WHEN 'R-54' THEN 4 WHEN 'R-56' THEN 5
  WHEN 'R-70' THEN 6 WHEN 'R-85' THEN 7 WHEN 'R-100' THEN 8 ELSE sort_order END;
