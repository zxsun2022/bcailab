-- The public view snapshot a published map ships so its page can render a live, collapsible
-- map instead of a static image (docs/mapdown/decisions.md D-32).
--
-- Nullable on purpose: a publication frozen before this column existed will never gain one, and
-- its page keeps rendering the frozen SVG. Apply before deploying the code that reads it
-- (ADR 0008).

ALTER TABLE mapdown_publications ADD COLUMN view_key TEXT;
