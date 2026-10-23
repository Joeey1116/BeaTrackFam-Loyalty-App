-- BeaTrackFam Rewards — backend schema
-- Run ONCE in the Supabase SQL Editor (schema.sql first, then seed.sql).
-- Idempotent: safe to re-run; all objects use IF NOT EXISTS / CREATE OR REPLACE.

-- 1. Extensions -------------------------------------------------------------
create extension if not exists pgcrypto;

-- 2. Tables (dependency order) ----------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  points        integer not null default 0,
  tier          text not null default 'fam',
  referral_code text unique not null,
  referred_by   uuid references public.profiles(id),
  birthday      date,
  display_name  text,
  avatar_url    text,
  created_at    timestamptz default now()
);

-- Existing installs: add the build-19 profile columns.
alter table public.profiles
  add column if not exists display_name text,
  add column if not exists avatar_url   text;

create table if not exists public.points_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  delta      integer not null,
  reason     text not null,
  created_at timestamptz default now()
);

create table if not exists public.rewards (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  cost           integer not null,
  description    text not null,
  active         boolean not null default true,
  -- kind: 'points' (spend points, repeatable) | 'birthday' (cycle-guarded)
  kind           text not null default 'points',
  -- Shopify mapping: 'percent' | 'shipping' | 'amount' | 'free_product'
  discount_kind  text,
  discount_value numeric,
  min_subtotal   numeric,
  created_at     timestamptz default now()
);

alter table public.rewards
  add column if not exists kind           text not null default 'points',
  add column if not exists discount_kind  text,
  add column if not exists discount_value numeric,
  add column if not exists min_subtotal   numeric;

create table if not exists public.redemptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  reward_id       uuid not null references public.rewards(id),
  code            text not null unique,
  idempotency_key text,
  cycle_key       text,
  status          text not null default 'active',
  delivery        text not null default 'manual',
  email           text,
  email_sent_at   timestamptz,
  created_at      timestamptz default now()
);

alter table public.redemptions
  add column if not exists idempotency_key text,
  add column if not exists cycle_key       text,
  add column if not exists status          text not null default 'active',
  add column if not exists delivery        text not null default 'manual',
  add column if not exists email           text,
  add column if not exists email_sent_at   timestamptz;

-- Pre-created Shopify discount codes, handed out atomically by the
-- redeem-reward Edge Function when live code creation isn't configured.
create table if not exists public.code_pool (
  id            uuid primary key default gen_random_uuid(),
  reward_id     uuid not null references public.rewards(id),
  code          text not null unique,
  redemption_id uuid references public.redemptions(id),
  claimed_at    timestamptz,
  created_at    timestamptz default now()
);

-- 3. Indexes ----------------------------------------------------------------
create index if not exists idx_points_ledger_user_id   on public.points_ledger(user_id);
create index if not exists idx_redemptions_user_id    on public.redemptions(user_id);
create index if not exists idx_profiles_referral_code on public.profiles(referral_code);
create index if not exists idx_redemptions_user_created
  on public.redemptions(user_id, created_at desc);
-- One honored request per idempotency key; one birthday claim per cycle.
create unique index if not exists uq_redemptions_idempotency
  on public.redemptions(idempotency_key) where idempotency_key is not null;
create unique index if not exists uq_redemptions_user_cycle
  on public.redemptions(user_id, cycle_key) where cycle_key is not null;
create index if not exists idx_code_pool_available
  on public.code_pool(reward_id) where redemption_id is null;

-- Unique titles so seed.sql can upsert on title idempotently
create unique index if not exists uq_rewards_title on public.rewards(title);

-- 4. Auto-create profile on signup ------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, referral_code)
  values (
    new.id,
    coalesce(new.email, ''),
    upper(substr(md5(new.id::text), 1, 8))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. Keep tier in sync with points ------------------------------------------
--    fam < 500 | loyal 500-1499 | ride-or-die >= 1500
create or replace function public.sync_tier()
returns trigger
language plpgsql
as $$
begin
  new.tier := case
    when new.points >= 1500 then 'ride-or-die'
    when new.points >= 500  then 'loyal'
    else 'fam'
  end;
  return new;
end;
$$;

drop trigger if exists sync_profile_tier on public.profiles;
create trigger sync_profile_tier
  before update of points on public.profiles
  for each row execute function public.sync_tier();

-- 6. Row Level Security ------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.points_ledger enable row level security;
alter table public.rewards       enable row level security;
alter table public.redemptions   enable row level security;
-- code_pool: RLS on with NO client policies — service role only.
alter table public.code_pool     enable row level security;

-- profiles: users read + update their own row; authenticated insert of own row
-- (service-role trigger bypasses RLS anyway; client-side ensureProfile fallback allowed)
drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
  on public.profiles for update to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

-- points_ledger: users read own rows; insert own rows (app logic guards balances)
drop policy if exists "ledger select own" on public.points_ledger;
create policy "ledger select own"
  on public.points_ledger for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "ledger insert own" on public.points_ledger;
create policy "ledger insert own"
  on public.points_ledger for insert to authenticated
  with check (auth.uid() = user_id);

-- rewards: authenticated users see active rewards only
drop policy if exists "rewards select active" on public.rewards;
create policy "rewards select active"
  on public.rewards for select to authenticated
  using (active = true);

-- redemptions: users read + insert their own rows
drop policy if exists "redemptions select own" on public.redemptions;
create policy "redemptions select own"
  on public.redemptions for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "redemptions insert own" on public.redemptions;
create policy "redemptions insert own"
  on public.redemptions for insert to authenticated
  with check (auth.uid() = user_id);

-- 7. Transaction functions ----------------------------------------------------
create or replace function public.award_points(p_user_id uuid, p_delta int, p_reason text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
begin
  insert into public.points_ledger (user_id, delta, reason)
  values (p_user_id, p_delta, p_reason);

  update public.profiles
  set points = points + p_delta
  where id = p_user_id
  returning points into new_balance;

  if new_balance is null then
    raise exception 'award_points: no profile for user %', p_user_id;
  end if;

  return new_balance;
end;
$$;

-- complete_redemption is the ONLY way a redemption is recorded (build 19).
-- The redeem-reward Edge Function mints (or draws) a real code first, then
-- calls this to atomically: honor idempotency, enforce the birthday guard,
-- deduct points, and write the redemption row. The profile row is locked,
-- so retries / double-taps / reinstalls can never double-mint or
-- double-deduct.
--
-- BIRTHDAY POLICY — BIRTHDAY_CYCLE = 'yearly' (Joey, Oct 22 2026, FINAL):
-- one claim per birthday cycle (rolling 12 months anchored to the claim).
-- Eligibility is governed by CLAIM HISTORY, never by the editable
-- birthday field. To switch to once-ever: make the guard below reject when
-- ANY prior birthday claim exists and set v_cycle_key := 'ever'.
-- (Mirror constant: lib/loyalty.ts BIRTHDAY_CYCLE.)
create or replace function public.complete_redemption(
  p_user_id         uuid,
  p_reward_id       uuid,
  p_idempotency_key text,
  p_code            text,
  p_delivery        text
)
returns public.redemptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile   public.profiles;
  v_reward    public.rewards;
  v_existing  public.redemptions;
  v_pool      public.code_pool;
  v_code      text;
  v_cycle_key text;
  v_occ       date;
  v_birthday_cycle constant text := 'yearly';
begin
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'complete_redemption: no profile for user %', p_user_id;
  end if;

  select * into v_existing from public.redemptions
  where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    return v_existing;
  end if;

  select * into v_reward from public.rewards
  where id = p_reward_id and active = true;
  if not found then
    raise exception 'reward not found or inactive';
  end if;

  if v_reward.kind = 'birthday' then
    if v_profile.birthday is null then
      raise exception 'birthday not set';
    end if;

    if v_birthday_cycle = 'yearly' then
      if exists (
        select 1 from public.redemptions r
        join public.rewards rw on rw.id = r.reward_id
        where r.user_id = p_user_id
          and rw.kind = 'birthday'
          and r.status = 'active'
          and r.created_at > now() - interval '12 months'
      ) then
        raise exception 'birthday already claimed this cycle';
      end if;
      v_occ := (v_profile.birthday
        + ((extract(year from current_date)::int
            - extract(year from v_profile.birthday)::int)
           * interval '1 year'))::date;
      if v_occ < current_date - 30 then
        v_occ := (v_occ + interval '1 year')::date;
      end if;
      v_cycle_key := to_char(v_occ, 'YYYY-MM-DD');
    else
      if exists (
        select 1 from public.redemptions r
        join public.rewards rw on rw.id = r.reward_id
        where r.user_id = p_user_id
          and rw.kind = 'birthday'
          and r.status = 'active'
      ) then
        raise exception 'birthday already claimed this cycle';
      end if;
      v_cycle_key := 'ever';
    end if;
  end if;

  if v_reward.cost > 0 and v_profile.points < v_reward.cost then
    raise exception 'insufficient points';
  end if;

  v_code := p_code;
  if p_delivery = 'pool' then
    select * into v_pool from public.code_pool
    where reward_id = p_reward_id and redemption_id is null
    order by created_at
    limit 1
    for update skip locked;
    if not found then
      raise exception 'no codes available';
    end if;
    v_code := v_pool.code;
  end if;
  if v_code is null then
    raise exception 'no code supplied';
  end if;

  if v_reward.cost > 0 then
    -- Ledger reason carries the reward TITLE (build 20): history used to
    -- render 'Redeemed reward <uuid>'. The client also resolves legacy
    -- rows written in the old format (see lib/loyalty.ts getLedger).
    perform public.award_points(
      p_user_id, -v_reward.cost, 'Redeemed: ' || v_reward.title
    );
  end if;

  insert into public.redemptions (
    user_id, reward_id, code, idempotency_key, cycle_key, status, delivery, email
  ) values (
    p_user_id, p_reward_id, v_code, p_idempotency_key, v_cycle_key,
    'active', p_delivery, v_profile.email
  )
  returning * into v_existing;

  if p_delivery = 'pool' then
    update public.code_pool
    set redemption_id = v_existing.id, claimed_at = now()
    where id = v_pool.id;
  end if;

  return v_existing;
end;
$$;

revoke execute on function public.complete_redemption(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_redemption(uuid, uuid, text, text, text)
  to service_role;

-- The old redeem_reward RPC trusted client-generated codes that were
-- never valid in the store. Removed in build 19.
drop function if exists public.redeem_reward(uuid, uuid, text);

-- Referral lookup: lets a signed-in user resolve someone else's referral code
-- to a profile id without exposing the profiles table cross-user (RLS-safe).
create or replace function public.find_referrer(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare r uuid;
begin
  select id into r from public.profiles
  where referral_code = upper(trim(p_code));
  return r;
end;
$$;
grant execute on function public.find_referrer(text) to authenticated;

-- 8. Avatars storage bucket ---------------------------------------------------
-- Public read (profile photos are shown in-app); each user manages only
-- objects under avatars/<their-user-id>/. Deleting an account removes the
-- folder first (see functions/delete-account).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read"
  on storage.objects for select to public
  using (bucket_id = 'avatars');

drop policy if exists "avatars insert own" on storage.objects;
create policy "avatars insert own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars update own" on storage.objects;
create policy "avatars update own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars delete own" on storage.objects;
create policy "avatars delete own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
