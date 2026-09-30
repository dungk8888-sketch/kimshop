-- Keep extension functions out of the exposed public schema.
alter extension pg_trgm set schema extensions;
