-- This migration is inert until Auth is configured to use the hook.
begin;

create role processmap_mcp_reader nologin noinherit;
-- Intentionally do not grant this role to PostgREST's authenticator.
create schema processmap_connector;
revoke all on schema processmap_connector from public;

create function processmap_connector.access_token(event jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  claims jsonb := event -> 'claims';
  client text := coalesce(nullif(event ->> 'client_id', ''), nullif(claims ->> 'client_id', ''));
begin
  if client is null then
    return event;
  end if;

  return jsonb_set(event, '{claims}', claims || jsonb_build_object(
    'client_id', client,
    'role', 'processmap_mcp_reader',
    'aud', 'https://xgeviftkyrxhqbpgpfea.supabase.co/functions/v1/processmap-progress'
  ));
end;
$$;

revoke all on function processmap_connector.access_token(jsonb) from public;
grant usage on schema processmap_connector to supabase_auth_admin;
grant execute on function processmap_connector.access_token(jsonb) to supabase_auth_admin;

commit;
