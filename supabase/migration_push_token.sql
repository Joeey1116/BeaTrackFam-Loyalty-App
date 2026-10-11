-- BeaTrackFam Rewards — migration: push notification tokens
-- Run once in the Supabase SQL editor AFTER schema.sql.
-- Stores each device's Expo push token so the backend (or a future
-- edge function) can send targeted pushes: drops, reward alerts,
-- points milestones.

alter table public.profiles
  add column if not exists push_token text;

comment on column public.profiles.push_token is
  'Expo push token for this user''s device. Updated by the app on launch.';
