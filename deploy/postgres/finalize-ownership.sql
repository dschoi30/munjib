\set ON_ERROR_STOP on

-- Run after migrations with the root-held bootstrap connection. Journal
-- owners remain placeholders until the journal migration is independently
-- approved; this file intentionally creates no journal objects.
SET search_path = pg_catalog, public, munjib_extensions;

ALTER SCHEMA public OWNER TO munjib_schema_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM munjib_migrator, munjib_web, munjib_rag;
GRANT USAGE ON SCHEMA public TO munjib_web, munjib_rag;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO munjib_web;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO munjib_rag;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO munjib_web;

REVOKE CREATE, USAGE ON SCHEMA munjib_extensions FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM munjib_web;
REVOKE CREATE ON SCHEMA public FROM munjib_rag;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM munjib_web;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM munjib_rag;
REVOKE munjib_schema_owner FROM munjib_web;
REVOKE munjib_schema_owner FROM munjib_rag;
REVOKE munjib_journal_owner FROM munjib_web, munjib_rag;
REVOKE munjib_journal_exporter FROM munjib_web, munjib_rag;

ALTER DEFAULT PRIVILEGES FOR ROLE munjib_schema_owner IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE munjib_schema_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO munjib_web;
ALTER DEFAULT PRIVILEGES FOR ROLE munjib_schema_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO munjib_rag;
ALTER DEFAULT PRIVILEGES FOR ROLE munjib_schema_owner IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE munjib_schema_owner IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO munjib_web;
