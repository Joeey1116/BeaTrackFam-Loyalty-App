-- BeaTrackFam Rewards — launch rewards seed
-- Run AFTER schema.sql. Idempotent: re-running updates the same 4 rows (upsert on title).

insert into public.rewards (title, cost, description, active) values
  ('10% Off Your Order', 100,  'Take 10% off any order at beatrackfam.info. One code per redemption.', true),
  ('Free Shipping',      250,  'Free US shipping on your next order.', true),
  ('$10 Off',            500,  '$10 off any order over $25.', true),
  ('Free Tee',           1000, 'A free BeaTrackFam tee of your choice. We''ll email you to confirm size.', true)
on conflict (title) do update set
  cost        = excluded.cost,
  description = excluded.description,
  active      = excluded.active;
