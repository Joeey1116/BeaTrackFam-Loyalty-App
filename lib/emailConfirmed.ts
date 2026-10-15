/**
 * Coordinates the signup-confirmation deep link between the root layout
 * (which exchanges the confirmation code for a session) and the rest of
 * the app: the auth gate waits for the fresh session instead of bouncing
 * to onboarding, and the home tab shows a one-time welcome message.
 */
let confirmedPending = false;

export function markEmailConfirmedPending() {
  confirmedPending = true;
}

export function isEmailConfirmedPending(): boolean {
  return confirmedPending;
}

export function takeEmailConfirmedPending(): boolean {
  const value = confirmedPending;
  confirmedPending = false;
  return value;
}
