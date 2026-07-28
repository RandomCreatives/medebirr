-- ============================================================
-- MIGRATION 2.2: Full-Text Search + GIN Indexes
-- ============================================================

-- Add tsvector column for full-text search on products
ALTER TABLE products ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_products_search_vector ON products USING GIN (search_vector);

-- Trigger function to keep search_vector updated
CREATE OR REPLACE FUNCTION update_product_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.category, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.sub_category, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.tags::text, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on INSERT/UPDATE
DROP TRIGGER IF EXISTS products_search_vector_trigger ON products;
CREATE TRIGGER products_search_vector_trigger
BEFORE INSERT OR UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION update_product_search_vector();

-- Backfill existing products
UPDATE products SET search_vector =
  setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(category, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(sub_category, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(tags::text, '')), 'C');

-- Add GIN index on stores for search
ALTER TABLE stores ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE INDEX IF NOT EXISTS idx_stores_search_vector ON stores USING GIN (search_vector);

CREATE OR REPLACE FUNCTION update_store_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.store_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.location_sub_city, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stores_search_vector_trigger ON stores;
CREATE TRIGGER stores_search_vector_trigger
BEFORE INSERT OR UPDATE ON stores
FOR EACH ROW EXECUTE FUNCTION update_store_search_vector();

UPDATE stores SET search_vector =
  setweight(to_tsvector('english', COALESCE(store_name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(location_sub_city, '')), 'C');