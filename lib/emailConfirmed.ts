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

/* A confirmation link was opened but did NOT establish a session (bad or
 * already-used code, dropped credentials). The account itself is usually
 * confirmed server-side by then, so the gate sends the user to sign in
 * instead of onboarding. */
let confirmationFailed = false;

export function markEmailConfirmationFailed() {
  confirmationFailed = true;
}

export function takeEmailConfirmationFailed(): boolean {
  const value = confirmationFailed;
  confirmationFailed = false;
  return value;
}
