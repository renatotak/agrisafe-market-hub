-- Add geo_precision column to retailer_locations
-- Values: 'address' (street-level), 'cep' (postal code area), 'municipality' (city centroid), 'original' (from import)
ALTER TABLE retailer_locations ADD COLUMN IF NOT EXISTS geo_precision text;

-- Mark existing coordinates as 'original' (from the CSV import)
UPDATE retailer_locations SET geo_precision = 'original' WHERE latitude IS NOT NULL AND geo_precision IS NULL;
