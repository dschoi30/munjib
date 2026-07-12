\set ON_ERROR_STOP on

-- PRE_JOURNAL verification is intentionally read-only and must run before
-- any journal extension, journal table, or genesis row exists.
SET search_path = pg_catalog, public, munjib_extensions;
RESET ROLE;
RESET SESSION AUTHORIZATION;

DO $$
DECLARE
  effective_role text := pg_catalog.current_user;
  requested_role text := pg_catalog.current_setting('role', true);
  effective_path text := pg_catalog.current_setting('search_path', true);
BEGIN
  IF effective_role NOT IN ('postgres', 'munjib_schema_owner', 'munjib_migrator') THEN
    RAISE EXCEPTION 'unexpected verification role';
  END IF;
  IF requested_role IS NOT NULL AND requested_role <> '' AND effective_role <> 'munjib_migrator' THEN
    RAISE EXCEPTION 'caller-provided libpq role is not permitted';
  END IF;
  IF effective_path NOT LIKE 'pg_catalog,%' THEN
    RAISE EXCEPTION 'pg_catalog must be first in search_path';
  END IF;
END
$$;

-- Resolve every security-sensitive helper through pg_catalog first. A
-- malicious public shadow must never be selected by an unqualified call.
SELECT pg_catalog.current_user,
       pg_catalog.current_setting('role', true),
       pg_catalog.current_setting('search_path', true),
       pg_catalog.to_regnamespace('public');
