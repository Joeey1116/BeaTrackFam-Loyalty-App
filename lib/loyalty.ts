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
 *                  referred_by uuid, birthday date
 *   points_ledger  id, user_id, delta, reason
 *   rewards        id, title, cost, description, active
 *   redemptions    id, user_id, reward_id, code
 *   RPCs: award_points(p_user_id, p_delta, p_reason),
 *         redeem_reward(p_user_id, p_reward_id, p_code)
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
}

export interface LedgerEntry {
  id: string;
  userId: string;
  delta: number;
  reason: string;
  createdAt: string;
}

export interface Reward {
  id: string;
  title: string;
  cost: number;
  description: string;
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
export const REFERRAL_GIVEN_REASON = 'Referral bonus — a friend joined the Fam';
export const REFERRAL_RECEIVED_REASON = 'Referral bonus — welcome to the Fam';

/* ------------------------------------------------------------------ */
/* Demo store (module-level, in-memory)                                 */
/* ------------------------------------------------------------------ */

const demoProfiles = new Map<string, Profile>();
const demoLedger = new Map<string, LedgerEntry[]>();

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
  });
  demoLedger.set(DEMO_USER_ID, [
    { id: 'seed-1', userId: DEMO_USER_ID, delta: 1000, reason: "Welcome to the Fam — thank God you're here", createdAt: now },
    { id: 'seed-2', userId: DEMO_USER_ID, delta: 50, reason: REFERRAL_GIVEN_REASON, createdAt: now },
    { id: 'seed-3', userId: DEMO_USER_ID, delta: 100, reason: BIRTHDAY_REASON, createdAt: now },
    { id: 'seed-4', userId: DEMO_USER_ID, delta: 20, reason: ONE_TIME_REASONS['follow-ig'], createdAt: now },
  ]);
}

const DEMO_REWARDS: Reward[] = [
  { id: 'reward-10off', title: '10% Off Your Order', cost: 100, description: 'Take 10% off any order at beatrackfam.info. One code per redemption.' },
  { id: 'reward-freeship', title: 'Free Shipping', cost: 250, description: 'Free US shipping on your next order.' },
  { id: 'reward-10dollar', title: '$10 Off', cost: 500, description: '$10 off any order over $25.' },
  { id: 'reward-freetee', title: 'Free Tee', cost: 1000, description: "A free BeaTrackFam tee of your choice. We'll email you to confirm size." },
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
  };
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
      };
      demoProfiles.set(userId, profile);
      demoLedger.set(userId, []);
    }
    return profile;
  }

  // The schema's auth trigger normally creates the profile on signup;
  // this is the client-side fallback.
  let { data } = await supabase
    .from('profiles')
    .select('id, email, points, referral_code, referred_by, birthday')
    .eq('id', userId)
    .maybeSingle();

  if (!data) {
    const { data: inserted, error } = await supabase
      .from('profiles')
      .insert({ id: userId, email, referral_code: generateReferralCode() })
      .select('id, email, points, referral_code, referred_by, birthday')
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
      const { data: reread } = await supabase
        .from('profiles')
        .select('id, email, points, referral_code, referred_by, birthday')
        .eq('id', userId)
        .maybeSingle();
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
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, points, referral_code, referred_by, birthday')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return buildProfile(data, await realLedgerReasons(userId));
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
  const { data } = await supabase
    .from('rewards')
    .select('id, title, cost, description')
    .eq('active', true)
    .order('cost', { ascending: true });
  return (data ?? []).map((row: any) => ({
    id: row.id,
    title: row.title,
    cost: row.cost,
    description: row.description ?? '',
  }));
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
/* Redemption                                                          */
/* ------------------------------------------------------------------ */

export interface RedeemResult {
  ok: boolean;
  code?: string;
  error?: string;
}

export async function redeemReward(userId: string, reward: Reward): Promise<RedeemResult> {
  const profile = await getProfile(userId);
  if (!profile) return { ok: false, error: 'No profile found.' };
  if (profile.points < reward.cost) {
    return { ok: false, error: `You need ${reward.cost - profile.points} more pts for this one.` };
  }

  const code = makeCode('BTF');

  if (isSupabaseConfigured() && supabase) {
    // The redeem_reward RPC checks the balance, deducts, and records the
    // redemption atomically server-side.
    const { error } = await supabase.rpc('redeem_reward', {
      p_user_id: userId,
      p_reward_id: reward.id,
      p_code: code,
    });
    if (error) {
      const msg = (error.message ?? '').toLowerCase();
      if (msg.includes('insufficient points')) {
        return { ok: false, error: 'Not enough points for this one yet.' };
      }
      return { ok: false, error: 'Could not redeem. Try again.' };
    }
    return { ok: true, code };
  }

  // Demo mode
  seedDemoStore();
  const deducted = await awardPoints(userId, -reward.cost, `Redeemed: ${reward.title}`);
  if (!deducted.ok) return { ok: false, error: deducted.error ?? 'Could not redeem. Try again.' };
  return { ok: true, code };
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
