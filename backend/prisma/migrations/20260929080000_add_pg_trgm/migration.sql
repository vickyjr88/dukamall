-- Enables trigram similarity matching (similarity(), % operator), used by
-- the storefront's fuzzy-search fallback (StorefrontService.fuzzyProductIds)
-- when a literal word-match search returns nothing, so a mistyped query
-- ("nkie" for "nike") still finds something close.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
