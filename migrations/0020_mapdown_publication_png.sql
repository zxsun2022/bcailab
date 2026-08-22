-- Raster link previews are stored separately from the full-resolution SVG viewer asset.
-- Nullable keeps existing publication rows readable until their owner updates them.
ALTER TABLE mapdown_publications ADD COLUMN png_key TEXT;
