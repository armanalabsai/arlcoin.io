-- ARLCOIN (arlcoin.io) whitelist. Applied to the Supabase project in eu-west-1 (Ireland).
-- Kept in its own schema, which is not exposed to the API; visitors can only call
-- public.arlcoin_register, which inserts and never returns stored data.

create schema if not exists arlcoin;
revoke all on schema arlcoin from public, anon, authenticated;

create table arlcoin.whitelist (
  id bigint generated always as identity primary key,
  wallet text not null unique check (wallet ~ '^0x[0-9a-f]{40}$'),
  email text not null unique
    check (char_length(email) between 6 and 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and email = lower(email)),
  privacy_notice_version text not null check (char_length(privacy_notice_version) between 1 and 32),
  privacy_accepted_at timestamptz not null default now(),
  transfer_consent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
comment on table arlcoin.whitelist is
  'arlcoin.io whitelist registrations: wallet, email and the time each consent was given. Written only through public.arlcoin_register.';

create index whitelist_created_at_idx on arlcoin.whitelist (created_at);
alter table arlcoin.whitelist enable row level security;
revoke all on arlcoin.whitelist from public, anon, authenticated;

create function public.arlcoin_register(
  p_wallet text,
  p_email text,
  p_notice_version text,
  p_privacy_accepted boolean,
  p_transfer_consent boolean
) returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_privacy_accepted is not true or p_transfer_consent is not true then
    raise exception 'consent required' using errcode = '22023';
  end if;
  -- Coarse global throttle against scripted flooding.
  if (select count(*) from arlcoin.whitelist where created_at > now() - interval '10 minutes') >= 200 then
    raise exception 'too many registrations, try again later' using errcode = '53400';
  end if;
  insert into arlcoin.whitelist (wallet, email, privacy_notice_version)
  values (lower(trim(p_wallet)), lower(trim(p_email)), trim(p_notice_version))
  on conflict do nothing;
  -- Same answer for new and existing entries, so the form does not reveal who is registered.
  return 'ok';
end;
$$;

revoke all on function public.arlcoin_register(text, text, text, boolean, boolean) from public;
grant execute on function public.arlcoin_register(text, text, text, boolean, boolean) to anon, authenticated;
comment on function public.arlcoin_register(text, text, text, boolean, boolean) is
  'arlcoin.io whitelist form. Inserts into arlcoin.whitelist; never returns stored data.';
