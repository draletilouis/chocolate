-- Preserve the deliberate worker-facing order from the domain seed. Names are
-- not a safe substitute for order because they change default selections.
ALTER TABLE routes ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pack_sizes ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

UPDATE routes SET sort_order = CASE id WHEN 'beans' THEN 1 WHEN 'pressing' THEN 2 WHEN 'chocolate' THEN 3 ELSE 1000 END;
UPDATE products SET sort_order = CASE id WHEN 'P-BEANS' THEN 1 WHEN 'P-LIQUOR' THEN 2 WHEN 'P-70' THEN 3 WHEN 'P-85' THEN 4 WHEN 'P-MILK' THEN 5 ELSE 1000 END;
UPDATE pack_sizes SET sort_order = CASE id WHEN 'PK-45' THEN 1 WHEN 'PK-100' THEN 2 WHEN 'PK-250' THEN 3 WHEN 'PK-1000' THEN 4 ELSE 1000 END;
UPDATE suppliers SET sort_order = CASE id WHEN 'S-KUAPA' THEN 1 WHEN 'S-MZANSI' THEN 2 WHEN 'S-GOLDEN' THEN 3 ELSE 1000 END;
UPDATE recipes SET sort_order = CASE id WHEN 'R-70' THEN 1 WHEN 'R-85' THEN 2 WHEN 'R-MILK' THEN 3 ELSE 1000 END;
