-- Add action_id to points_ledger for webhook idempotency (one grant per
-- Shopify order). Run once in Supabase Dashboard → SQL Editor.
alter table public.points_ledger
  add column if not exists action_id text;

create unique index if not exists idx_points_ledger_action_id
  on public.points_ledger(action_id)
  where action_id is not null;
