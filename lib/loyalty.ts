/**
 * Loyalty engine for BeaTrackFam Rewards.
 *
 * Works against the real Supabase backend (schema in supabase/schema.sql) AND
 * a local in-memory demo store when Supabase credentials are missing
 * (demo mode). Every exported function branches internally on
 * isSupabaseConfigured() — screens never need to.
 *
 * Real schema:
 *   profiles       id uuid PK, email, points, tier, referral_code unique,
 *                  referred_by uuid, birthday date, display_name,
 *                  avatar_url
 *   points_ledger  id, user_id, delta, reason
 *   rewards        id, title, cost, description, active, kind,
 *                  discount_kind, discount_value, min_subtotal
 *   redemptions    id, user_id, reward_id, code, idempotency_key,
 *                  cycle_key, status, delivery, email, email_sent_at
 *   RPC: award_points(p_user_id, p_delta, p_reason)
 *
 * Redemptions (build 19) go through the `redeem-reward` Edge Function:
 * the server mints a REAL single-use store code (Shopify Admin API, a
 * pre-created code pool, or a manual claim code), records the redemption
 * account-side via complete_redemption(), and emails the code. A
 * completed redemption is final — reinstalls and new devices read the
 * same server history; nothing can be re-minted for free.
 *
 * RLS notes handled here:
 * - Clients can only read their OWN profile row and ledger rows, so
 *   one-time-action claims, the birthday bonus flag, and the referral count
 *   are all derived from the user's own ledger reasons (no extra columns).
 * - Looking up a referrer by code needs a security-definer RPC
 *   (find_referrer) — see the note at the bottom of this file.
 */

import { isSupabaseConfigured, supabase } from './supabase';
import { clearPendingReferral, peekPendingReferral } from './pendingReferral';

export type Tier = 'fam' | 'loyal' | 'ride-or-die';

export interface TierInfo {
  id: Tier;
  name: string;
  minPoints: number;
}

export const TIERS: TierInfo[] = [
  { id: 'fam', name: 'Fam', minPoints: 0 },
  { id: 'loyal', name: 'Loyal', minPoints: 500 },
  { id: 'ride-or-die', name: 'Ride or Die', minPoints: 1500 },
];

export function tierFor(points: number): TierInfo {
  let current = TIERS[0];
  for (const tier of TIERS) {
    if (points >= tier.minPoints) current = tier;
  }
  return current;
}

export interface Profile {
  userId: string;
  email: string;
  points: number;
  referralCode: string;
  referredBy: string | null;
  referredCount: number;
  birthday: string | null; // YYYY-MM-DD
  birthdayBonusClaimed: boolean;
  claimedActions: string[];
  displayName: string;
  avatarUrl: string | null;
}

export interface LedgerEntry {
  id: string;
  userId: string;
  delta: number;
  reason: string;
  createdAt: string;
}

export type RewardKind = 'points' | 'birthday';

export interface Reward {
  id: string;
  title: string;
  cost: number;
  description: string;
  kind: RewardKind;
}

export interface Redemption {
  id: string;
  rewardTitle: string;
  code: string;
  status: string;
  createdAt: string;
}

export const DEMO_USER_ID = 'demo-user';

/* ------------------------------------------------------------------ */
/* Canonical ledger reasons (single source of truth)                   */
/* ------------------------------------------------------------------ */

export const ONE_TIME_REASONS: Record<string, string> = {
  'follow-ig': 'Followed on Instagram',
  'follow-tiktok': 'Followed on TikTok',
  review: 'Wrote a product review',
};

export const BIRTHDAY_REASON = 'Birthday bonus';

/**
 * Birthday reward policy (Joey, Oct 22 2026 — FINAL): 'yearly' means the
 * birthday reward can be claimed once per birthday cycle (a rolling
 * 12-month window). ENFORCED server-side in complete_redemption() (see
 * supabase/schema.sql) from CLAIM HISTORY — editing the birthday field
 * never unlocks another claim inside a cycle. This constant is the
 * client mirror of that policy point.
 */
export const BIRTHDAY_CYCLE = 'yearly' as const;
export const REFERRAL_GIVEN_REASON = 'Referral bonus — a friend joined the Fam';
export const REFERRAL_RECEIVED_REASON = 'Referral bonus — welcome to the Fam';

/* ------------------------------------------------------------------ */
/* Demo store (module-level, in-memory)                                 */
/* ------------------------------------------------------------------ */

const demoProfiles = new Map<string, Profile>();
const demoLedger = new Map<string, LedgerEntry[]>();
const demoRedemptions = new Map<string, Redemption[]>();

function seedDemoStore() {
  if (demoProfiles.has(DEMO_USER_ID)) return;
  const now = new Date().toISOString();
  demoProfiles.set(DEMO_USER_ID, {
    userId: DEMO_USER_ID,
    email: 'demo@beatrackfam.info',
    points: 1250,
    referralCode: 'FAM-DEMO1',
    referredBy: null,
    referredCount: 3,
    birthday: null,
    birthdayBonusClaimed: true,
    claimedActions: ['follow-ig'],
    displayName: 'Demo Fam',
    avatarUrl: null,
  });
  demoLedger.set(DEMO_USER_ID, [
    { id: 'seed-1', userId: DEMO_USER_ID, delta: 1000, reason: "Welcome to the Fam — thank God you're here", createdAt: now },
    { id: 'seed-2', userId: DEMO_USER_ID, delta: 50, reason: REFERRAL_GIVEN_REASON, createdAt: now },
    { id: 'seed-3', userId: DEMO_USER_ID, delta: 100, reason: BIRTHDAY_REASON, createdAt: now },
    { id: 'seed-4', userId: DEMO_USER_ID, delta: 20, reason: ONE_TIME_REASONS['follow-ig'], createdAt: now },
  ]);
  demoRedemptions.set(DEMO_USER_ID, [
    { id: 'seed-r1', rewardTitle: '10% Off Your Order', code: 'BTF-DEMO1', status: 'active', createdAt: now },
  ]);
}

const DEMO_REWARDS: Reward[] = [
  { id: 'reward-10off', title: '10% Off Your Order', cost: 100, description: 'Take 10% off any order at beatrackfam.info. One code per redemption.', kind: 'points' },
  { id: 'reward-freeship', title: 'Free Shipping', cost: 250, description: 'Free US shipping on your next order.', kind: 'points' },
  { id: 'reward-10dollar', title: '$10 Off', cost: 500, description: '$10 off any order over $25.', kind: 'points' },
  { id: 'reward-freetee', title: 'Free Tee', cost: 1000, description: "A free BeaTrackFam tee of your choice. We'll email you to confirm size.", kind: 'points' },
  { id: 'reward-birthday', title: 'Birthday 10% Off', cost: 0, description: 'Your birthday treat: 10% off, one code per birthday cycle. Happy birthday, Fam.', kind: 'birthday' },
];

export function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `FAM-${suffix}`;
}

function makeCode(prefix: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${suffix}`;
}

/* ------------------------------------------------------------------ */
/* Session state lives in lib/auth.tsx (AuthProvider / useAuth).       */
/* Screens must consume the shared auth state — per-screen             */
/* getSession() helpers were removed in build 18: they let every tab   */
/* resolve (and freeze) its own view of the session independently.     */
/* ------------------------------------------------------------------ */
/* Profiles                                                            */
/* ------------------------------------------------------------------ */

async function realLedgerReasons(userId: string): Promise<string[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('points_ledger')
    .select('reason')
    .eq('user_id', userId)
    .limit(500);
  return (data ?? []).map((r: any) => r.reason as string);
}

function buildProfile(row: any, reasons: string[]): Profile {
  const claimedActions = Object.entries(ONE_TIME_REASONS)
    .filter(([, reason]) => reasons.includes(reason))
    .map(([actionId]) => actionId);
  return {
    userId: row.id,
    email: row.email ?? '',
    points: row.points ?? 0,
    // The only profile field that can come back NULL from the DB (rows made
    // before the signup trigger set a code) — coalesce like every other field.
    referralCode: row.referral_code ?? '',
    referredBy: row.referred_by ?? null,
    referredCount: reasons.filter((r) => r === REFERRAL_GIVEN_REASON).length,
    birthday: row.birthday ?? null,
    birthdayBonusClaimed: reasons.includes(BIRTHDAY_REASON),
    claimedActions,
    displayName: row.display_name ?? '',
    avatarUrl: row.avatar_url ?? null,
  };
}

const PROFILE_COLUMNS =
  'id, email, points, referral_code, referred_by, birthday, display_name, avatar_url';
const PROFILE_COLUMNS_BASE =
  'id, email, points, referral_code, referred_by, birthday';

/**
 * Fetch one profile row. If the build-19 columns (display_name,
 * avatar_url) aren't in the database yet — i.e. the migration hasn't
 * been run — fall back to the base columns so profiles keep loading
 * instead of failing wholesale.
 */
async function fetchProfileRow(userId: string): Promise<any | null> {
  if (!supabase) return null;
  const full = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle();
  if (!full.error) return full.data;
  const base = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS_BASE)
    .eq('id', userId)
    .maybeSingle();
  return base.error ? null : base.data;
}

export async function ensureProfile(userId: string, email: string): Promise<Profile> {
  if (!isSupabaseConfigured() || !supabase) {
    seedDemoStore();
    let profile = demoProfiles.get(userId);
    if (!profile) {
      profile = {
        userId,
        email,
        points: 0,
        referralCode: generateReferralCode(),
        referredBy: null,
        referredCount: 0,
        birthday: null,
        birthdayBonusClaimed: false,
        claimedActions: [],
        displayName: '',
        avatarUrl: null,
      };
      demoProfiles.set(userId, profile);
      demoLedger.set(userId, []);
      demoRedemptions.set(userId, []);
    }
    return profile;
  }

  // The schema's auth trigger normally creates the profile on signup;
  // this is the client-side fallback.
  let data = await fetchProfileRow(userId);

  if (!data) {
    const { data: inserted, error } = await supabase
      .from('profiles')
      .insert({ id: userId, email, referral_code: generateReferralCode() })
      .select(PROFILE_COLUMNS_BASE)
      .single();
    if (error) throw new Error('Could not create your profile. Try again.');
    data = inserted;
  } else if (!data.referral_code) {
    // Self-heal: a row created before the DB trigger assigned codes (or by an
    // older schema) can carry a NULL referral_code — the Refer tab then shows
    // "—" forever. Generate one, save it, and use it.
    const healed = generateReferralCode();
    const { error: healError } = await supabase
      .from('profiles')
      .update({ referral_code: healed })
      .eq('id', userId);
    if (!healError) {
      data = { ...data, referral_code: healed };
    } else {
      // Unique collision or a lost race — re-read whatever is stored now.
      const reread = await fetchProfileRow(userId);
      if (reread) data = reread;
    }
  }

  return buildProfile(data, await realLedgerReasons(userId));
}

export async function getProfile(userId: string): Promise<Profile | null> {
  if (!isSupabaseConfigured() || !supabase) {
    seedDemoStore();
    return demoProfiles.get(userId) ?? null;
  }
  const data = await fetchProfileRow(userId);
  if (!data) return null;
  return buildProfile(data, await realLedgerReasons(userId));
}

/* ------------------------------------------------------------------ */
/* Edit Profile: display name, birthday, avatar                        */
/* ------------------------------------------------------------------ */

export const DISPLAY_NAME_MAX = 40;

export function validateDisplayName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name) return null;
  return name.slice(0, DISPLAY_NAME_MAX);
}

export async function updateDisplayName(
  userId: string,
  raw: string,
): Promise<{ ok: boolean; error?: string }> {
  const name = validateDisplayName(raw);
  if (!name) return { ok: false, error: 'Pick a name first — even just your first name.' };
  if (!isSupabaseConfigured() || !supabase) {
    seedDemoStore();
    const profile = demoProfiles.get(userId);
    if (!profile) return { ok: false, error: 'No profile found.' };
    profile.displayName = name;
    return { ok: true };
  }
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: name })
    .eq('id', userId);
  if (error) return { ok: false, error: 'Could not save your name. Try again.' };
  return { ok: true };
}

/**
 * Update the birthday date. This edits ONLY the date field: reward
 * eligibility is governed by claim history server-side (see
 * complete_redemption), so moving the date can never unlock another
 * birthday claim inside the current cycle.
 */
export async function updateBirthday(
  userId: string,
  birthday: string,
): Promise<{ ok: boolean; error?: string }> {
  const value = birthday.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    return { ok: false, error: 'Use the YYYY-MM-DD format, like 2001-11-16.' };
  }
  if (!isSupabaseConfigured() || !supabase) {
    seedDemoStore();
    const profile = demoProfiles.get(userId);
    if (!profile) return { ok: false, error: 'No profile found.' };
    profile.birthday = value;
    return { ok: true };
  }
  const { error } = await supabase
    .from('profiles')
    .update({ birthday: value })
    .eq('id', userId);
  if (error) return { ok: false, error: 'Could not save your birthday. Try again.' };
  return { ok: true };
}

export const AVATAR_BUCKET = 'avatars';
export const avatarPath = (userId: string) => `${userId}/avatar.jpg`;

/**
 * Resize/compress a picked photo, upload it to the avatars bucket, and
 * store its public URL on the profile. Replaces any previous avatar
 * (same object path, upsert). Demo mode keeps the photo device-local —
 * clearly separate from real accounts, like all demo data.
 */
export async function uploadAvatar(
  userId: string,
  pickedUri: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  let uri = pickedUri;
  try {
    const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
    const result = await manipulateAsync(
      pickedUri,
      [{ resize: { width: 512 } }],
      { compress: 0.8, format: SaveFormat.JPEG },
    );
    uri = result.uri;
  } catch {
    // Manipulator unavailable — upload the picked image as-is.
  }

  if (!isSupabaseConfigured() || !supabase) {
    seedDemoStore();
    const profile = demoProfiles.get(userId);
    if (!profile) return { ok: false, error: 'No profile found.' };
    profile.avatarUrl = uri;
    return { ok: true, url: uri };
  }

  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const path = avatarPath(userId);
    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    // Cache-bust so a replaced photo shows immediately (same URL path).
    const url = `${data.publicUrl}?v=${Date.now()}`;
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: url })
      .eq('id', userId);
    if (updateError) throw updateError;
    return { ok: true, url };
  } catch {
    return { ok: false, error: 'Could not upload that photo. Try again.' };
  }
}

export async function removeAvatar(
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    seedDemoStore();
    const profile = demoProfiles.get(userId);
    if (profile) profile.avatarUrl = null;
    return { ok: true };
  }
  try {
    await supabase.storage.from(AVATAR_BUCKET).remove([avatarPath(userId)]);
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: null })
      .eq('id', userId);
    if (error) throw error;
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not remove your photo. Try again.' };
  }
}

/* ------------------------------------------------------------------ */
/* Ledger                                                              */
/* ------------------------------------------------------------------ */

export async function getLedger(userId: string): Promise<LedgerEntry[]> {
  if (!isSupabaseConfigured() || !supabase) {
    seedDemoStore();
    return [...(demoLedger.get(userId) ?? [])].reverse();
  }
  const { data } = await supabase
    .from('points_ledger')
    .select('id, user_id, delta, reason, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  return (data ?? []).map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    delta: row.delta,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}

/* ------------------------------------------------------------------ */
/* Rewards catalog                                                     */
/* ------------------------------------------------------------------ */

export async function getRewards(): Promise<Reward[]> {
  if (!isSupabaseConfigured() || !supabase) return DEMO_REWARDS;
  const mapRow = (row: any): Reward => ({
    id: row.id,
    title: row.title,
    cost: row.cost,
    description: row.description ?? '',
    kind: row.kind === 'birthday' ? 'birthday' : 'points',
  });
  const withKind = await supabase
    .from('rewards')
    .select('id, title, cost, description, kind')
    .eq('active', true)
    .order('cost', { ascending: true });
  if (!withKind.error) return (withKind.data ?? []).map(mapRow);
  // Pre-migration database (no kind column yet) — base columns still work.
  const base = await supabase
    .from('rewards')
    .select('id, title, cost, description')
    .eq('active', true)
    .order('cost', { ascending: true });
  return (base.data ?? []).map(mapRow);
}

/* ------------------------------------------------------------------ */
/* Points                                                              */
/* ------------------------------------------------------------------ */

export interface AwardResult {
  ok: boolean;
  points: number;
  error?: string;
}

/**
 * Add (or subtract) points and write a ledger entry.
 * Pass actionId for one-time actions (social follows etc.) — the second call
 * for the same action is skipped instead of double-awarding. One-time state
 * is derived from the ledger (clients can only read their own rows).
 */
export async function awardPoints(
  userId: string,
  delta: number,
  reason: string,
  opts?: { actionId?: string },
): Promise<AwardResult> {
  const actionId = opts?.actionId;

  if (!isSupabaseConfigured() || !supabase) {
    seedDemoStore();
    const profile = demoProfiles.get(userId);
    if (!profile) return { ok: false, points: 0, error: 'No profile found.' };
    if (actionId && profile.claimedActions.includes(actionId)) {
      return { ok: true, points: profile.points, error: 'already-claimed' };
    }
    profile.points = Math.max(0, profile.points + delta);
    if (actionId) profile.claimedActions.push(actionId);
    if (reason === BIRTHDAY_REASON) profile.birthdayBonusClaimed = true;
    if (reason === REFERRAL_GIVEN_REASON) profile.referredCount += 1;
    const entries = demoLedger.get(userId) ?? [];
    entries.push({ id: makeCode('L'), userId, delta, reason, createdAt: new Date().toISOString() });
    demoLedger.set(userId, entries);
    return { ok: true, points: profile.points };
  }

  if (actionId) {
    const reasons = await realLedgerReasons(userId);
    const marker = ONE_TIME_REASONS[actionId] ?? reason;
    if (reasons.includes(marker)) {
      const profile = await getProfile(userId);
      return { ok: true, points: profile?.points ?? 0, error: 'already-claimed' };
    }
  }

  const { data, error } = await supabase.rpc('award_points', {
    p_user_id: userId,
    p_delta: delta,
    p_reason: reason,
  });
  if (error) return { ok: false, points: 0, error: 'Could not update points. Try again.' };
  return { ok: true, points: (data as number) ?? 0 };
}

/* ------------------------------------------------------------------ */
/* Redemption (build 19 — server-minted codes, final & account-keyed) */
/* ------------------------------------------------------------------ */

export interface RedeemResult {
  ok: boolean;
  code?: string;
  emailSent?: boolean;
  error?: string;
}

/**
 * One idempotency key per redemption ATTEMPT. The rewards screen keeps
 * the key for an attempt across retries, so a double-tap or a flaky
 * network can never mint two codes or deduct twice — the server honors
 * each key exactly once (see the redeem-reward Edge Function).
 */
export function makeIdempotencyKey(): string {
  const rand = makeCode('K').slice(2); // 6 chars
  return `rdm-${Date.now().toString(36)}-${rand}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function friendlyRedeemError(raw: string, reward: Reward, points: number): string {
  const msg = raw.toLowerCase();
  if (msg.includes('insufficient points')) {
    return reward.cost > points
      ? `You need ${reward.cost - points} more pts for this one.`
      : 'Not enough points for this one yet.';
  }
  if (msg.includes('birthday not set')) {
    return 'Set your birthday in Profile first — then this one is yours.';
  }
  if (msg.includes('birthday already claimed')) {
    return `You've already claimed your birthday reward this cycle — it comes back next cycle (BIRTHDAY_CYCLE = ${BIRTHDAY_CYCLE}).`;
  }
  if (msg.includes('no codes available')) {
    return 'Codes for this reward are being restocked — check back soon.';
  }
  if (msg.includes('not found')) return 'That reward is no longer available.';
  if (msg.includes('session')) return raw;
  return 'Could not redeem. Try again.';
}

export async function redeemReward(
  userId: string,
  reward: Reward,
  idempotencyKey: string,
): Promise<RedeemResult> {
  const profile = await getProfile(userId);
  if (!profile) return { ok: false, error: 'No profile found.' };
  if (profile.points < reward.cost) {
    return { ok: false, error: `You need ${reward.cost - profile.points} more pts for this one.` };
  }
  if (reward.kind === 'birthday' && !profile.birthday) {
    return { ok: false, error: 'Set your birthday in Profile first — then this one is yours.' };
  }

  if (isSupabaseConfigured() && supabase) {
    // The Edge Function mints the real store code, records the
    // redemption server-side (exactly once per idempotency key), and
    // emails the code. Nothing about a completed redemption lives only
    // on this device.
    const { data, error } = await supabase.functions.invoke('redeem-reward', {
      body: { reward_id: reward.id, idempotency_key: idempotencyKey },
    });
    if (error) {
      let raw = error.message ?? '';
      try {
        const ctx = (error as any).context;
        if (ctx && typeof ctx.json === 'function') {
          const parsed = await ctx.json();
          if (parsed?.error) raw = String(parsed.error);
        }
      } catch {
        // Keep the generic message.
      }
      return { ok: false, error: friendlyRedeemError(raw, reward, profile.points) };
    }
    const code = (data as any)?.code as string | undefined;
    if (!code) return { ok: false, error: 'Could not redeem. Try again.' };
    return { ok: true, code, emailSent: !!(data as any)?.email_sent };
  }

  // Demo mode — local-only sample flow, clearly separate from real
  // accounts: the "code" is a demo string, kept in the in-memory store.
  seedDemoStore();
  if (reward.kind === 'birthday') {
    const list = demoRedemptions.get(userId) ?? [];
    const last = list
      .filter((r) => r.rewardTitle === reward.title)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (last && Date.now() - Date.parse(last.createdAt) < 365.25 * 24 * 3600 * 1000) {
      return { ok: false, error: friendlyRedeemError('birthday already claimed this cycle', reward, profile.points) };
    }
  }
  const deducted = await awardPoints(userId, -reward.cost, `Redeemed: ${reward.title}`);
  if (!deducted.ok) return { ok: false, error: deducted.error ?? 'Could not redeem. Try again.' };
  const code = makeCode('BTF');
  const list = demoRedemptions.get(userId) ?? [];
  list.unshift({
    id: makeCode('R'),
    rewardTitle: reward.title,
    code,
    status: 'active',
    createdAt: new Date().toISOString(),
  });
  demoRedemptions.set(userId, list);
  return { ok: true, code, emailSent: false };
}

export async function getRedemptions(userId: string): Promise<Redemption[]> {
  if (!isSupabaseConfigured() || !supabase) {
    seedDemoStore();
    return [...(demoRedemptions.get(userId) ?? [])];
  }
  const { data, error } = await supabase
    .from('redemptions')
    .select('id, code, status, created_at, rewards(title)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? []).map((row: any) => ({
    id: row.id,
    rewardTitle: (row.rewards as any)?.title ?? 'Reward',
    code: row.code,
    status: row.status ?? 'active',
    createdAt: row.created_at,
  }));
}

/* ------------------------------------------------------------------ */
/* Referrals                                                           */
/* ------------------------------------------------------------------ */

export interface ReferralResult {
  ok: boolean;
  error?: string;
}

/**
 * Apply a referral code for a new user: 50 pts each, sets referred_by,
 * guards self-referral and double-use.
 *
 * NOTE: RLS only lets clients read their own profile row, so the referrer
 * lookup goes through a security-definer RPC `find_referrer(p_code)`.
 * If that RPC is missing from the database, referrals fail gracefully with
 * a clear message (the referrer award is skipped, the error surfaces).
 */
export async function applyReferral(newUserId: string, code: string): Promise<ReferralResult> {
  const clean = code.trim().toUpperCase();
  if (!clean) return { ok: false, error: 'Enter a referral code.' };

  if (!isSupabaseConfigured() || !supabase) {
    seedDemoStore();
    const referrer = [...demoProfiles.values()].find((p) => p.referralCode === clean);
    if (!referrer) return { ok: false, error: "Hmm, that code didn't match anyone." };
    if (referrer.userId === newUserId) return { ok: false, error: "That's your own code — nice try though." };
    const newcomer = demoProfiles.get(newUserId);
    if (!newcomer) return { ok: false, error: 'No profile found.' };
    if (newcomer.referredBy) return { ok: false, error: 'You already used a referral code.' };
    newcomer.referredBy = referrer.userId;
    await awardPoints(newUserId, 50, REFERRAL_RECEIVED_REASON);
    await awardPoints(referrer.userId, 50, REFERRAL_GIVEN_REASON);
    return { ok: true };
  }

  let referrerId: string | null = null;
  try {
    const { data, error } = await supabase.rpc('find_referrer', { p_code: clean });
    if (error) throw error;
    referrerId = (data as string) ?? null;
  } catch {
    return {
      ok: false,
      error: 'Referrals are not set up yet on the server — your account is fine, just skip the code for now.',
    };
  }
  if (!referrerId) return { ok: false, error: "Hmm, that code didn't match anyone." };
  if (referrerId === newUserId) return { ok: false, error: "That's your own code — nice try though." };

  const newcomer = await getProfile(newUserId);
  if (!newcomer) return { ok: false, error: 'No profile found.' };
  if (newcomer.referredBy) return { ok: false, error: 'You already used a referral code.' };

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ referred_by: referrerId })
    .eq('id', newUserId);
  if (updateError) return { ok: false, error: 'Could not apply the referral. Try again.' };

  const mine = await awardPoints(newUserId, 50, REFERRAL_RECEIVED_REASON);
  const theirs = await awardPoints(referrerId, 50, REFERRAL_GIVEN_REASON);
  if (!mine.ok || !theirs.ok) {
    return { ok: false, error: 'Referral saved, but the bonus points hiccuped — they will land shortly.' };
  }
  return { ok: true };
}

/**
 * Apply a referral code that was stashed at sign-up (lib/pendingReferral).
 * Email-confirmed sign-ups have no session when the code is typed, so the
 * deep-link handler and the sign-in flow call this once a session exists and
 * the profile is ensured. The stash is cleared on any definitive outcome;
 * it is kept only when the server can't process referrals at all yet, so a
 * later sign-in can retry.
 */
export async function applyPendingReferral(userId: string): Promise<void> {
  const code = await peekPendingReferral();
  if (!code) return;
  const result = await applyReferral(userId, code);
  if (result.ok || !(result.error ?? '').includes('not set up')) {
    await clearPendingReferral();
  }
}

/*
 * REQUIRED server addition for referrals (add to supabase/schema.sql):
 *
 *   create or replace function public.find_referrer(p_code text)
 *   returns uuid
 *   language plpgsql
 *   security definer
 *   set search_path = public
 *   as $$
 *   declare r uuid;
 *   begin
 *     select id into r from public.profiles
 *     where referral_code = upper(trim(p_code));
 *     return r;
 *   end;
 *   $$;
 *   grant execute on function public.find_referrer(text) to authenticated;
 */
