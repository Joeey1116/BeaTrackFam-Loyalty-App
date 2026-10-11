/**
 * Live Activity manager for BeaTrackFam Rewards (expo-widgets, iOS 16.2+).
 *
 * Use case: when the user is within striking distance of their next reward,
 * a Lock Screen / Dynamic Island card shows live progress ("40 pts to your
 * free tee"). It updates as points accrue and ends when the reward is
 * redeemed or the user drifts far from the milestone.
 *
 * Product rules (match iOS limits — an activity lives ~8h after its last
 * update, so this is for NEAR milestones, not multi-day countdowns):
 *   - start/update when remaining <= STRIKE_DISTANCE (150 pts)
 *   - end when the reward becomes affordable (remaining 0) or unreachable
 *
 * All expo-widgets imports are lazy — a missing native module can never
 * crash the app, and Android/web silently no-op.
 */
import { getRewards, type Reward } from './loyalty';
import type { PointsActivityProps } from '../widgets/PointsActivity';

const STRIKE_DISTANCE = 150;

let activityModule: typeof import('../widgets/PointsActivity') | null = null;
let activeInstance: { update: (p: PointsActivityProps) => Promise<void>; end: (...a: any[]) => Promise<void> } | null = null;

async function loadModule() {
  if (activityModule) return activityModule;
  try {
    // Only meaningful on iOS; skip the import elsewhere.
    const { Platform } = await import('react-native');
    if (Platform.OS !== 'ios') return null;
    activityModule = await import('../widgets/PointsActivity');
    return activityModule;
  } catch {
    return null;
  }
}

/** Next reward the user can't afford yet (cheapest above their balance). */
export async function nextMilestone(points: number): Promise<Reward | null> {
  try {
    const rewards = await getRewards();
    const upcoming = rewards
      .filter((r) => r.cost > points)
      .sort((a, b) => a.cost - b.cost);
    return upcoming[0] ?? null;
  } catch {
    return null;
  }
}

export async function syncMilestoneActivity(points: number): Promise<void> {
  const mod = await loadModule();
  if (!mod) return;
  try {
    const milestone = await nextMilestone(points);
    if (!milestone) {
      await endMilestoneActivity();
      return;
    }
    const remaining = milestone.cost - points;
    if (remaining > STRIKE_DISTANCE) {
      await endMilestoneActivity();
      return;
    }
    const props: PointsActivityProps = {
      points,
      target: milestone.cost,
      rewardName: milestone.title,
      expiresText: '',
    };
    if (activeInstance) {
      await activeInstance.update(props);
    } else {
      const { default: PointsActivity } = mod;
      // Recover instances that outlived the JS process (e.g. app relaunch).
      const existing = PointsActivity.getInstances?.() ?? [];
      if (existing.length > 0) {
        activeInstance = existing[0];
        await activeInstance.update(props);
      } else {
        activeInstance = await PointsActivity.start(props, 'beatrackfamrewards://rewards');
      }
    }
  } catch {
    // Live Activities unavailable — silent no-op.
  }
}

export async function endMilestoneActivity(finalProps?: PointsActivityProps): Promise<void> {
  if (!activeInstance) return;
  try {
    const { after } = await import('expo-widgets');
    if (finalProps) {
      await activeInstance.end(after(new Date(Date.now() + 5 * 60 * 1000)), finalProps);
    } else {
      await activeInstance.end();
    }
  } catch {
    // Best effort.
  } finally {
    activeInstance = null;
  }
}
