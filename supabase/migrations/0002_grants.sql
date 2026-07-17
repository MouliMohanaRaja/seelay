-- Fix: "permission denied for table captures" from the Data API.
-- Ensures the server's service role (used by app/api/* via the sb_secret key)
-- has table access; anon stays locked out by RLS with no policies.

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public
  grant all privileges on tables to service_role;
alter default privileges in schema public
  grant all privileges on sequences to service_role;
