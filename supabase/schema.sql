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
  created_at    timestamptz default now()
);

create table if not exists public.points_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  delta      integer not null,
  reason     text not null,
  created_at timestamptz default now()
);

create table if not exists public.rewards (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  cost        integer not null,
  description text not null,
  active      boolean not null default true,
  created_at  timestamptz default now()
);

create table if not exists public.redemptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  reward_id  uuid not null references public.rewards(id),
  code       text not null unique,
  created_at timestamptz default now()
);

-- 3. Indexes ----------------------------------------------------------------
create index if not exists idx_points_ledger_user_id   on public.points_ledger(user_id);
create index if not exists idx_redemptions_user_id    on public.redemptions(user_id);
create index if not exists idx_profiles_referral_code on public.profiles(referral_code);

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

create or replace function public.redeem_reward(p_user_id uuid, p_reward_id uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  reward_cost integer;
  balance     integer;
begin
  select cost into reward_cost
  from public.rewards
  where id = p_reward_id and active = true;

  if reward_cost is null then
    raise exception 'redeem_reward: reward not found or inactive';
  end if;

  select points into balance
  from public.profiles
  where id = p_user_id;

  if balance is null then
    raise exception 'redeem_reward: no profile for user';
  end if;

  if balance < reward_cost then
    raise exception 'redeem_reward: insufficient points (need %, have %)', reward_cost, balance;
  end if;

  perform public.award_points(p_user_id, -reward_cost, 'Redeemed reward ' || p_reward_id::text);

  insert into public.redemptions (user_id, reward_id, code)
  values (p_user_id, p_reward_id, p_code);

  return p_code;
end;
$$;

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
