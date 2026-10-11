/**
 * PointsActivity — the BeaTrackFam Rewards Live Activity.
 *
 * Shows on the Lock Screen and Dynamic Island (iPhone 14 Pro+):
 * a points-milestone progress card ("X pts to your free tee") with a
 * progress bar, plus an optional limited-time reward countdown line.
 *
 * Widget rules: 'widget' directive, @expo/ui SwiftUI components only,
 * no hooks, no async — props-only data. Registered at runtime via
 * createLiveActivity (no widgets[] entry in app.json — the plugin's
 * built-in Live Activity target handles it).
 */
import { HStack, ProgressView, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, progressViewStyle } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export type PointsActivityProps = {
  points: number;
  target: number;
  rewardName: string;
  /** e.g. "Ends Sunday" — empty string hides the countdown line */
  expiresText: string;
};

const PointsActivity = (props: PointsActivityProps, _env: LiveActivityEnvironment) => {
  'widget';
  const remaining = Math.max(0, props.target - props.points);
  const pct = Math.min(1, props.points / Math.max(1, props.target));
  return {
    banner: (
      <VStack>
        <Text modifiers={[font({ weight: 'bold' }), foregroundStyle('#FFFFFF')]}>
          BeaTrackFam Rewards
        </Text>
        <Text modifiers={[foregroundStyle('#FFFFFF')]}>
          {props.rewardName}: {props.points}/{props.target} pts
        </Text>
        <ProgressView value={pct} modifiers={[progressViewStyle('linear')]} />
        {props.expiresText !== '' ? (
          <Text modifiers={[foregroundStyle('#BBBBBB')]}>{props.expiresText}</Text>
        ) : null}
      </VStack>
    ),
    compactLeading: <Text modifiers={[foregroundStyle('#FFFFFF')]}>{remaining} pts to go</Text>,
    compactTrailing: <ProgressView value={pct} modifiers={[progressViewStyle('circular')]} />,
    minimal: <Text modifiers={[foregroundStyle('#FFFFFF')]}>{remaining}</Text>,
  };
};

export default createLiveActivity('PointsActivity', PointsActivity);
