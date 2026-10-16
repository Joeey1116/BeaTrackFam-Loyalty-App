/**
 * Shopify order webhook → award loyalty points on successful payment.
 *
 * Receives Shopify `orders/paid` webhooks, verifies the HMAC signature,
 * matches the order's customer email to a loyalty profile, and credits
 * 25 pts per order (one per order ID — idempotent).
 *
 * SETUP (Joey, in Shopify admin + Supabase dashboard):
 * 1. Supabase Dashboard → Edge Functions → deploy this function.
 * 2. Set secrets: SHOPIFY_WEBHOOK_SECRET (from Shopify admin),
 *    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * 3. Shopify admin → Settings → Notifications → Webhooks → Create:
 *    Event: Order payment, Format: JSON,
 *    URL: https://<project>.supabase.co/functions/v1/shopify-order
 *
 * Points are ONLY granted when Shopify confirms payment — never from
 * the app's SHOP button (which only opens the store).
 */

const POINTS_PER_ORDER = 25;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function verifyHmac(rawBody: string, hmacHeader: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const digest = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return timingSafeEqual(digest, hmacHeader);
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const secret = Deno.env.get('SHOPIFY_WEBHOOK_SECRET');
  if (!secret) return new Response('Webhook secret not configured', { status: 500 });

  const rawBody = await req.text();
  const hmac = req.headers.get('x-shopify-hmac-sha256') ?? '';
  if (!(await verifyHmac(rawBody, hmac, secret))) {
    return new Response('Invalid signature', { status: 401 });
  }

  const order = JSON.parse(rawBody);
  // Only paid orders grant points. `orders/paid` topic already implies this,
  // but double-check the financial status defensively.
  if (order.financial_status !== 'paid') {
    return new Response('Order not paid — no points', { status: 200 });
  }

  const email: string | undefined = order.email ?? order.customer?.email;
  const orderId = String(order.id ?? order.order_number ?? '');
  if (!email || !orderId) return new Response('Missing email/order id', { status: 200 });

  const { createClient } = await import('npm:@supabase/supabase-js@2');
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Idempotency: one grant per Shopify order ID.
  const actionId = `shopify-order-${orderId}`;
  const { data: existing } = await supabase
    .from('points_ledger')
    .select('id')
    .eq('action_id', actionId)
    .limit(1);
  if (existing && existing.length > 0) {
    return new Response('Already credited', { status: 200 });
  }

  // Match the customer email to a loyalty profile.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, points')
    .eq('email', email)
    .limit(1)
    .single();
  if (!profile) {
    // Customer isn't a loyalty member — nothing to credit.
    return new Response('No loyalty profile for email', { status: 200 });
  }

  const { error } = await supabase.from('points_ledger').insert({
    user_id: profile.id,
    delta: POINTS_PER_ORDER,
    reason: `Order ${order.order_number ?? orderId} paid at beatrackfam.info`,
    action_id: actionId,
  });
  if (error) {
    console.error('Ledger insert failed:', error.message);
    return new Response('Ledger write failed', { status: 500 });
  }

  await supabase
    .from('profiles')
    .update({ points: (profile.points ?? 0) + POINTS_PER_ORDER })
    .eq('id', profile.id);

  return new Response('Points credited', { status: 200 });
});
