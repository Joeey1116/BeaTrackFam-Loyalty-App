-- BeaTrackFam Rewards — build 19: redemption overhaul + profile fields.
-- Run ONCE in Supabase Dashboard → SQL Editor (after schema.sql,
-- seed.sql, and the earlier migrations). Idempotent where practical.
--
-- What this does:
--   * profiles gains display_name + avatar_url (Edit Profile feature).
--   * rewards gains kind + Shopify discount mapping columns.
--   * redemptions becomes the single source of truth for every reward
--     claim: server-minted code, idempotency key, birthday cycle key,
--     delivery route (shopify / pool / manual), email snapshot + send stamp.
--   * code_pool table: pre-created Shopify codes handed out atomically.
--   * complete_redemption(): the ONLY way a redemption is recorded now.
--     Service-role only (the redeem-reward Edge Function calls it).
--     The old redeem_reward() RPC is DROPPED — it trusted client-made
--     codes that were never valid in the store.
--   * avatars storage bucket (public read, owner-managed writes).

-- ---------------------------------------------------------------------------
-- 1. profiles: display name + avatar
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists display_name text,
  add column if not exists avatar_url   text;

-- ---------------------------------------------------------------------------
-- 2. rewards: kind + discount mapping
--    kind: 'points' (spend points, repeatable) | 'birthday' (cycle-guarded)
--    discount_kind: 'percent' | 'shipping' | 'amount' | 'free_product'
-- ---------------------------------------------------------------------------
alter table public.rewards
  add column if not exists kind          text not null default 'points',
  add column if not exists discount_kind text,
  add column if not exists discount_value numeric,
  add column if not exists min_subtotal  numeric;

-- Backfill the launch catalog's Shopify mapping (by title).
update public.rewards set discount_kind = 'percent',      discount_value = 10
  where title = '10% Off Your Order' and discount_kind is null;
update public.rewards set discount_kind = 'shipping',     discount_value = 100
  where title = 'Free Shipping' and discount_kind is null;
update public.rewards set discount_kind = 'amount',       discount_value = 10, min_subtotal = 25
  where title = '$10 Off' and discount_kind is null;
update public.rewards set discount_kind = 'free_product'
  where title = 'Free Tee' and discount_kind is null;

-- ---------------------------------------------------------------------------
-- 3. redemptions: one server row per claim, forever
-- ---------------------------------------------------------------------------
alter table public.redemptions
  add column if not exists idempotency_key text,
  add column if not exists cycle_key       text,
  add column if not exists status          text not null default 'active',
  add column if not exists delivery        text not null default 'manual',
  add column if not exists email           text,
  add column if not exists email_sent_at   timestamptz;

-- A redemption request is honored exactly once per idempotency key.
create unique index if not exists uq_redemptions_idempotency
  on public.redemptions(idempotency_key)
  where idempotency_key is not null;

-- Backstop for the birthday guard: one active claim per user per cycle.
create unique index if not exists uq_redemptions_user_cycle
  on public.redemptions(user_id, cycle_key)
  where cycle_key is not null;

create index if not exists idx_redemptions_user_created
  on public.redemptions(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. code_pool: pre-created Shopify discount codes, claimed atomically.
--    Populate with codes created by hand in Shopify admin (one row per
--    code, reward_id = the reward the code's price rule belongs to).
--    RLS is on with NO client policies: only the service role (the
--    redeem-reward Edge Function) can read or claim pool codes.
-- ---------------------------------------------------------------------------
create table if not exists public.code_pool (
  id            uuid primary key default gen_random_uuid(),
  reward_id     uuid not null references public.rewards(id),
  code          text not null unique,
  redemption_id uuid references public.redemptions(id),
  claimed_at    timestamptz,
  created_at    timestamptz default now()
);

alter table public.code_pool enable row level security;

create index if not exists idx_code_pool_available
  on public.code_pool(reward_id) where redemption_id is null;

-- ---------------------------------------------------------------------------
-- 5. complete_redemption — atomic: idempotency, birthday guard, points
--    deduction, pool draw, redemption row. One transaction, profile row
--    locked, so retries / double-taps / reinstalls can never double-mint
--    or double-deduct.
--
--    BIRTHDAY POLICY — BIRTHDAY_CYCLE = 'yearly' (Joey, Oct 22 2026, FINAL):
--    the birthday reward can be claimed once per birthday cycle (a rolling
--    12-month window anchored to the claim). cycle_key records the
--    birthday occurrence (YYYY-MM-DD) the claim belongs to, and the
--    (user_id, cycle_key) unique index backstops it. Eligibility is
--    governed by CLAIM HISTORY, never by the editable birthday field —
--    editing profiles.birthday cannot unlock another claim in a cycle.
--    To switch to once-ever instead: set the policy check below to reject
--    when ANY prior birthday claim exists and set v_cycle_key := 'ever'.
-- ---------------------------------------------------------------------------
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
  -- BIRTHDAY_CYCLE policy point (mirror: lib/loyalty.ts BIRTHDAY_CYCLE).
  v_birthday_cycle constant text := 'yearly';
begin
  -- Serialize all redemptions for this user.
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'complete_redemption: no profile for user %', p_user_id;
  end if;

  -- Idempotent replay: this request was already honored — return its row.
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

  -- Birthday guard (claim-history based; the date field alone never gates).
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
      -- The occurrence this claim belongs to: this year's birthday, or
      -- next year's once we're more than 30 days past this year's.
      v_occ := (v_profile.birthday
        + ((extract(year from current_date)::int
            - extract(year from v_profile.birthday)::int)
           * interval '1 year'))::date;
      if v_occ < current_date - 30 then
        v_occ := (v_occ + interval '1 year')::date;
      end if;
      v_cycle_key := to_char(v_occ, 'YYYY-MM-DD');
    else
      -- 'once-ever'
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

  -- Points-spend rewards are repeatable — but each one costs, every time.
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

-- Only the service role (redeem-reward Edge Function) may complete a
-- redemption. Authenticated clients can no longer mint codes directly.
revoke execute on function public.complete_redemption(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_redemption(uuid, uuid, text, text, text)
  to service_role;

-- The old client-code RPC is gone (see header). Build 18 and earlier will
-- get an honest "could not redeem" error instead of a store-invalid code.
drop function if exists public.redeem_reward(uuid, uuid, text);

-- ---------------------------------------------------------------------------
-- 6. avatars bucket — public read; each user manages only their own folder
--    (objects live at avatars/<user-id>/avatar.jpg).
-- ---------------------------------------------------------------------------
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
