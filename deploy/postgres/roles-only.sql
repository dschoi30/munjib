\set ON_ERROR_STOP on

-- PRE_JOURNAL bootstrap. This file is executed only by the root-held
-- bootstrap connection; no application credential is accepted here.
SET search_path = pg_catalog, public, munjib_extensions;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'munjib_schema_owner') THEN
    CREATE ROLE munjib_schema_owner NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'munjib_migrator') THEN
    CREATE ROLE munjib_migrator LOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'munjib_web') THEN
    CREATE ROLE munjib_web LOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'munjib_rag') THEN
    CREATE ROLE munjib_rag LOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'munjib_journal_owner') THEN
    CREATE ROLE munjib_journal_owner NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'munjib_journal_exporter') THEN
    CREATE ROLE munjib_journal_exporter NOLOGIN NOINHERIT;
  END IF;
END
$$;

ALTER ROLE munjib_schema_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE munjib_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE munjib_web LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE munjib_rag LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE munjib_journal_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE munjib_journal_exporter NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

REVOKE ALL ON DATABASE obsidian_clone FROM PUBLIC;
GRANT CONNECT ON DATABASE obsidian_clone TO munjib_migrator, munjib_web, munjib_rag;
CREATE SCHEMA IF NOT EXISTS munjib_extensions AUTHORIZATION munjib_schema_owner;
ALTER SCHEMA munjib_extensions OWNER TO munjib_schema_owner;
ALTER SCHEMA public OWNER TO munjib_schema_owner;
GRANT USAGE, CREATE ON SCHEMA public TO munjib_schema_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA munjib_extensions FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM munjib_migrator, munjib_web, munjib_rag;

GRANT munjib_schema_owner TO munjib_migrator;
REVOKE munjib_schema_owner FROM munjib_web, munjib_rag, munjib_journal_owner, munjib_journal_exporter;
-- The fixed migrator operation alone may execute: SET ROLE munjib_schema_owner.
-- Canonical path: pg_catalog,public,munjib_extensions.

ALTER ROLE munjib_migrator SET search_path = pg_catalog, public, munjib_extensions;
ALTER ROLE munjib_web SET search_path = pg_catalog, public, munjib_extensions;
ALTER ROLE munjib_rag SET search_path = pg_catalog, public, munjib_extensions;
