/**
 * Coordinates the password-reset deep link between the root layout
 * (which exchanges the recovery code for a session) and the auth gate
 * (which must route a fresh recovery session to the reset screen
 * instead of bouncing it straight into the tabs).
 */
let resetPending = false;

export function markPasswordResetPending() {
  resetPending = true;
}

export function takePasswordResetPending(): boolean {
  const value = resetPending;
  resetPending = false;
  return value;
}
