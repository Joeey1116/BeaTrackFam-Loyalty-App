/**
 * Redeem reward → mint ONE real, single-use coupon code for the caller.
 *
 * Build 19 redemption overhaul. Every redemption is a server-side,
 * account-keyed record (public.redemptions) created exactly once:
 *
 *   1. The caller is identified from their Supabase Auth JWT — never a
 *      user id from the request body.
 *   2. Idempotency: the app sends a client-generated idempotency key per
 *      redemption attempt. A replayed key returns the ORIGINAL redemption
 *      (same code, no second deduction) — double-taps, retries, and
 *      reinstalls can never re-mint or double-charge.
 *   3. A real code is produced by one of three routes, in order:
 *      a. LIVE (preferred): created in Shopify via the Admin API
 *         (unique price rule + discount code, usage limit 1) when
 *         SHOPIFY_SHOP_DOMAIN is set together with app credentials —
 *         either SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET (Dev
 *         Dashboard app: a short-lived Admin API token is fetched via
 *         the client-credentials grant at redemption time) or a legacy
 *         static SHOPIFY_ADMIN_ACCESS_TOKEN. If the token exchange
 *         fails, the redemption falls through to the pool route.
 *      b. POOL: a pre-created Shopify code drawn atomically from
 *         public.code_pool (see migration_redemptions_v2.sql).
 *      c. MANUAL: an internal claim code (used for the Free Tee when no
 *         product is configured — the store already emails the customer
 *         to confirm size, per the reward's description).
 *   4. complete_redemption() records it atomically (points deducted
 *      exactly once; birthday claims guarded per BIRTHDAY_CYCLE='yearly'
 *      by CLAIM HISTORY — editing the birthday field never resets it).
 *      If recording fails after a live Shopify code was created, the
 *      price rule is deleted again (best effort) so no orphan codes live.
 *   5. The code is emailed to the account's email via Resend when
 *      RESEND_API_KEY is set, and stamped on the redemption row. The
 *      in-app redemption history works with or without email.
 *
 * SETUP (Joey, in the Supabase dashboard):
 * 1. Run supabase/migration_redemptions_v2.sql in the SQL Editor, then
 *    re-run supabase/seed.sql (adds the birthday reward + mappings).
 * 2. Deploy this function: Edge Functions → deploy `redeem-reward`
 *    (or `supabase functions deploy redeem-reward`).
 * 3. Optional but recommended — live Shopify codes:
 *    Create an app in the Shopify Dev Dashboard (dev.shopify.com) —
 *    this store no longer offers the legacy in-admin custom-app
 *    creator — with Admin API scopes: write_discounts + read_discounts
 *    (+ read_products), install it on the store, and copy the app's
 *    Client ID + Client secret. Then set Edge Function secrets:
 *      SHOPIFY_SHOP_DOMAIN=your-store.myshopify.com
 *      SHOPIFY_CLIENT_ID=<the app's Client ID>
 *      SHOPIFY_CLIENT_SECRET=<the app's Client secret>
 *    The function exchanges those credentials for a short-lived Admin
 *    API token at redemption time (client-credentials grant). A legacy
 *    static token still works instead, if one is ever available:
 *      SHOPIFY_ADMIN_ACCESS_TOKEN=<the token>
 *    Until then redemptions draw from code_pool (stock it with codes you
 *    create by hand in Shopify) or fall back to manual claim codes.
 * 4. Optional — code emails: create a Resend account, verify the
 *    beatrackfam.info domain, and set secrets:
 *      RESEND_API_KEY=<key>
 *      RESEND_FROM_EMAIL=BeaTrackFam Rewards <rewards@beatrackfam.info>
 *    (RESEND_FROM_EMAIL optional; the default above is used otherwise.)
 * 5. Optional — Free Tee as a true 100%-off code: set
 *    SHOPIFY_FREE_PRODUCT_ID to the tee's Shopify product id.
 */

const SHOPIFY_API_VERSION = '2024-10';
// Mirror of lib/loyalty.ts BIRTHDAY_CYCLE — policy is ENFORCED in SQL
// (complete_redemption); this constant is documentation for this layer.
const BIRTHDAY_CYCLE = 'yearly';

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mintCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let suffix = '';
  for (const b of bytes) suffix += chars[b % chars.length];
  return `BTF-${suffix}`;
}

interface RewardRow {
  id: string;
  title: string;
  cost: number;
  kind: string;
  discount_kind: string | null;
  discount_value: number | null;
  min_subtotal: number | null;
  active: boolean;
}

/** Create a single-use discount code in Shopify. Returns the price rule id. */
async function shopifyCreateCode(
  shop: string,
  token: string,
  reward: RewardRow,
  code: string,
  freeProductId: string | null,
): Promise<number> {
  const rule: Record<string, unknown> = {
    title: `BeaTrackFam Rewards — ${code}`,
    customer_selection: 'all',
    usage_limit: 1,
    starts_at: new Date().toISOString(),
  };
  const value = Number(reward.discount_value ?? 0);
  switch (reward.discount_kind) {
    case 'percent':
      rule.target_type = 'line_item';
      rule.target_selection = 'all';
      rule.allocation_method = 'across';
      rule.value_type = 'percentage';
      rule.value = `-${Math.abs(value)}`;
      break;
    case 'shipping':
      rule.target_type = 'shipping_line';
      rule.target_selection = 'all';
      rule.allocation_method = 'across';
      rule.value_type = 'percentage';
      rule.value = '-100';
      break;
    case 'amount':
      rule.target_type = 'line_item';
      rule.target_selection = 'all';
      rule.allocation_method = 'across';
      rule.value_type = 'fixed_amount';
      rule.value = `-${Math.abs(value)}`;
      if (reward.min_subtotal != null) {
        rule.prerequisite_subtotal_range = {
          greater_than_or_equal_to: Number(reward.min_subtotal).toFixed(2),
        };
      }
      break;
    case 'free_product':
      rule.target_type = 'line_item';
      rule.target_selection = 'entitled';
      rule.entitled_product_ids = [Number(freeProductId)];
      rule.allocation_method = 'each';
      rule.value_type = 'percentage';
      rule.value = '-100';
      break;
    default:
      throw new Error(`No Shopify mapping for discount_kind=${reward.discount_kind}`);
  }

  const headers = {
    'X-Shopify-Access-Token': token,
    'Content-Type': 'application/json',
  };
  const ruleRes = await fetch(
    `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/price_rules.json`,
    { method: 'POST', headers, body: JSON.stringify({ price_rule: rule }) },
  );
  if (!ruleRes.ok) {
    throw new Error(`Shopify price rule failed (${ruleRes.status})`);
  }
  const ruleJson = await ruleRes.json();
  const ruleId = ruleJson?.price_rule?.id as number;

  const codeRes = await fetch(
    `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/price_rules/${ruleId}/discount_codes.json`,
    { method: 'POST', headers, body: JSON.stringify({ discount_code: { code } }) },
  );
  if (!codeRes.ok) {
    // Roll back the empty rule so failed attempts leave nothing behind.
    await fetch(
      `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/price_rules/${ruleId}.json`,
      { method: 'DELETE', headers },
    ).catch(() => {});
    throw new Error(`Shopify discount code failed (${codeRes.status})`);
  }
  return ruleId;
}

async function shopifyDeleteRule(shop: string, token: string, ruleId: number): Promise<void> {
  await fetch(
    `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/price_rules/${ruleId}.json`,
    { method: 'DELETE', headers: { 'X-Shopify-Access-Token': token } },
  ).catch(() => {});
}

/**
 * Resolve the Admin API access token for the live Shopify route.
 * Preference order:
 *   1. Client credentials — SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET.
 *      Dev Dashboard apps issue no permanent token, so exchange the
 *      credentials for a short-lived (~24h) token at redemption time
 *      via the client-credentials grant.
 *   2. Legacy static SHOPIFY_ADMIN_ACCESS_TOKEN, used as-is.
 * Returns null when nothing is configured or the exchange fails — the
 * caller then falls through to the pool/manual routes, and no Shopify
 * code has been created yet, so nothing can be orphaned.
 */
async function resolveShopifyToken(shop: string): Promise<string | null> {
  const clientId = Deno.env.get('SHOPIFY_CLIENT_ID');
  const clientSecret = Deno.env.get('SHOPIFY_CLIENT_SECRET');
  if (clientId && clientSecret) {
    try {
      const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      });
      if (!res.ok) {
        console.error(`Shopify token exchange failed (${res.status})`);
        return null;
      }
      const data = await res.json();
      const token = data?.access_token as string | undefined;
      if (!token) {
        console.error('Shopify token exchange returned no access_token');
        return null;
      }
      return token;
    } catch (e) {
      console.error('Shopify token exchange error:', (e as Error).message);
      return null;
    }
  }
  return Deno.env.get('SHOPIFY_ADMIN_ACCESS_TOKEN') ?? null;
}

async function sendCodeEmail(
  rewardTitle: string,
  code: string,
  toEmail: string,
): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return false;
  const from = Deno.env.get('RESEND_FROM_EMAIL')
    ?? 'BeaTrackFam Rewards <rewards@beatrackfam.info>';
  const text = [
    `You redeemed: ${rewardTitle}`,
    '',
    `Your single-use code: ${code}`,
    '',
    'Enter it at checkout on beatrackfam.info. It works once — and it lives',
    'in your Fam Rewards app under Rewards → MY CODES if you ever lose this',
    'email.',
    '',
    'Loyalty above all.',
    '— BeaTrackFam',
  ].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;background:#000;color:#fff;padding:32px;border-radius:16px">
    <p style="letter-spacing:3px;color:#999;font-size:12px">BEATRACKFAM REWARDS</p>
    <h1 style="font-size:24px;margin:8px 0">${rewardTitle}</h1>
    <p style="color:#ccc">Your single-use code:</p>
    <p style="background:#fff;color:#000;font-size:28px;font-weight:800;letter-spacing:4px;padding:14px 20px;border-radius:12px;display:inline-block">${code}</p>
    <p style="color:#ccc;line-height:1.6">Enter it at checkout on beatrackfam.info. It works once — and it lives in your Fam Rewards app under <b>Rewards → MY CODES</b> if you ever lose this email.</p>
    <p style="color:#999">Loyalty above all.<br/>— BeaTrackFam</p>
  </div>`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [toEmail],
        subject: `Your BeaTrackFam code: ${rewardTitle}`,
        text,
        html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json(401, { error: 'Missing or invalid authorization header' });
  }

  let body: { reward_id?: string; idempotency_key?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid request body' });
  }
  const rewardId = body.reward_id;
  const idempotencyKey = body.idempotency_key;
  if (!rewardId || !idempotencyKey) {
    return json(400, { error: 'reward_id and idempotency_key are required' });
  }

  const { createClient } = await import('npm:@supabase/supabase-js@2');
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (!url || !anonKey || !serviceRoleKey) {
    return json(500, { error: 'Function is not configured' });
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return json(401, { error: 'Could not verify your session — please sign in again' });
  }
  const userId = userData.user.id;

  const admin = createClient(url, serviceRoleKey);

  const okPayload = async (row: any, title: string) => {
    // Email on first completion — and on replays where the original send
    // never landed — never more than once per redemption.
    let emailSent = !!row.email_sent_at;
    if (!emailSent && row.email) {
      emailSent = await sendCodeEmail(title, row.code, row.email);
      if (emailSent) {
        await admin
          .from('redemptions')
          .update({ email_sent_at: new Date().toISOString() })
          .eq('id', row.id);
      }
    }
    return json(200, {
      ok: true,
      redemption_id: row.id,
      code: row.code,
      reward_title: title,
      email_sent: emailSent,
    });
  };

  // Idempotent replay: return the original redemption untouched.
  const { data: prior } = await admin
    .from('redemptions')
    .select('id, code, email, email_sent_at, reward_id')
    .eq('user_id', userId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (prior) {
    const { data: priorReward } = await admin
      .from('rewards')
      .select('title')
      .eq('id', prior.reward_id)
      .maybeSingle();
    return okPayload(prior, priorReward?.title ?? 'Reward');
  }

  // Load reward + profile for pre-checks (complete_redemption re-checks
  // everything authoritatively under a row lock).
  const { data: reward } = await admin
    .from('rewards')
    .select('id, title, cost, kind, discount_kind, discount_value, min_subtotal, active')
    .eq('id', rewardId)
    .maybeSingle();
  if (!reward || !reward.active) {
    return json(404, { error: 'reward not found or inactive' });
  }
  const { data: profile } = await admin
    .from('profiles')
    .select('id, email, points, birthday')
    .eq('id', userId)
    .maybeSingle();
  if (!profile) return json(404, { error: 'no profile for user' });

  if (reward.cost > 0 && (profile.points ?? 0) < reward.cost) {
    return json(400, { error: 'insufficient points' });
  }
  if (reward.kind === 'birthday') {
    if (!profile.birthday) return json(400, { error: 'birthday not set' });
    const { data: claimed } = await admin
      .from('redemptions')
      .select('id, rewards!inner(kind)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .eq('rewards.kind', 'birthday')
      .gt('created_at', new Date(Date.now() - 365.25 * 24 * 3600 * 1000).toISOString())
      .limit(1);
    if (claimed && claimed.length > 0) {
      return json(409, { error: 'birthday already claimed this cycle' });
    }
  }

  // Pick the delivery route. The Shopify token is resolved per request:
  // client credentials are exchanged for a short-lived token; a failed
  // exchange leaves shopToken null and the redemption falls through to
  // the pool/manual routes below.
  const shop = Deno.env.get('SHOPIFY_SHOP_DOMAIN');
  const freeProductId = Deno.env.get('SHOPIFY_FREE_PRODUCT_ID');
  const shopToken = shop ? await resolveShopifyToken(shop) : null;
  const mappable = reward.discount_kind === 'percent'
    || reward.discount_kind === 'shipping'
    || reward.discount_kind === 'amount'
    || (reward.discount_kind === 'free_product' && !!freeProductId);
  const liveShopify = !!(shop && shopToken && reward.discount_kind && mappable);

  let delivery: 'shopify' | 'pool' | 'manual' = 'manual';
  let code: string | null = null;
  let priceRuleId: number | null = null;

  if (liveShopify) {
    code = mintCode();
    try {
      priceRuleId = await shopifyCreateCode(
        shop!, shopToken!, reward as RewardRow, code, freeProductId,
      );
      delivery = 'shopify';
    } catch (e) {
      console.error('Shopify code creation failed:', (e as Error).message);
      return json(502, {
        error: 'Could not create your code in the store — points were not deducted. Try again.',
      });
    }
  } else {
    const { count } = await admin
      .from('code_pool')
      .select('id', { count: 'exact', head: true })
      .eq('reward_id', rewardId)
      .is('redemption_id', null);
    if ((count ?? 0) > 0) {
      delivery = 'pool'; // code drawn atomically inside complete_redemption
    } else {
      delivery = 'manual';
      code = mintCode();
    }
  }

  // Record it — atomically, exactly once.
  const { data: row, error: rpcError } = await admin.rpc('complete_redemption', {
    p_user_id: userId,
    p_reward_id: rewardId,
    p_idempotency_key: idempotencyKey,
    p_code: code,
    p_delivery: delivery,
  });
  if (rpcError || !row) {
    if (priceRuleId !== null && shop && shopToken) {
      await shopifyDeleteRule(shop, shopToken, priceRuleId);
    }
    const msg = (rpcError?.message ?? '').toLowerCase();
    if (msg.includes('insufficient points')) return json(400, { error: 'insufficient points' });
    if (msg.includes('birthday')) {
      return json(409, { error: msg.includes('not set') ? 'birthday not set' : 'birthday already claimed this cycle' });
    }
    if (msg.includes('no codes available')) {
      return json(503, { error: 'no codes available' });
    }
    if (msg.includes('not found')) return json(404, { error: 'reward not found or inactive' });
    console.error('complete_redemption failed:', rpcError?.message);
    return json(500, { error: 'Could not complete the redemption. Try again.' });
  }

  return okPayload(row, reward.title);
});
