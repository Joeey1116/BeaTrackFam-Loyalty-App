-- BeaTrackFam Rewards — launch rewards seed
-- Run AFTER schema.sql. Idempotent: re-running updates the same rows
-- (upsert on title). Build 19 adds the Shopify discount mapping for each
-- reward plus the birthday coupon (kind='birthday', cycle-guarded
-- server-side — see complete_redemption in schema.sql).

insert into public.rewards
  (title, cost, description, active, kind, discount_kind, discount_value, min_subtotal)
values
  ('10% Off Your Order', 100,  'Take 10% off any order at beatrackfam.info. One code per redemption.', true, 'points',   'percent',      10,   null),
  ('Free Shipping',      250,  'Free US shipping on your next order.', true, 'points',   'shipping',     100,  null),
  ('$10 Off',            500,  '$10 off any order over $25.', true, 'points',   'amount',       10,   25),
  ('Free Tee',           1000, 'A free BeaTrackFam tee of your choice. We''ll email you to confirm size.', true, 'points',   'free_product', null, null),
  ('Birthday 10% Off',   0,    'Your birthday treat: 10% off, one code per birthday cycle. Happy birthday, Fam.', true, 'birthday', 'percent',      10,   null)
on conflict (title) do update set
  cost           = excluded.cost,
  description    = excluded.description,
  active         = excluded.active,
  kind           = excluded.kind,
  discount_kind  = excluded.discount_kind,
  discount_value = excluded.discount_value,
  min_subtotal   = excluded.min_subtotal;
