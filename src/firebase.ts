/**
 * Google Sheets access is now handled entirely server-side by the FastAPI
 * backend, using a service account (see backend/google_auth_client.py and
 * backend/README.md). Nobody has to sign in with a Google account to use
 * this app anymore.
 *
 * This file keeps the same exported function names/shapes that App.tsx
 * already calls (initAuth, googleSignIn, getAccessToken, logoutGoogle) so
 * the rest of the frontend needs no changes, but they no longer open a
 * real Google popup - they just report an always-connected state.
 *
 * Note: the "Backup to Google Drive" feature in App.tsx (saveBackupsToDrive)
 * was built on top of each signed-in user's personal Drive access. Since
 * there's no longer a per-user Google token, that feature will no longer
 * be able to reach the real Google Drive API - everything else (login,
 * records, submissions, live rates, admin stats) is unaffected because
 * those all go through the backend, which authenticates itself.
 */

const PLACEHOLDER_TOKEN = 'server-managed';
const PLACEHOLDER_USER = { displayName: 'Server-managed Sheets access', email: null };

export const initAuth = (
  onAuthSuccess?: (user: any, token: string) => void,
  _onAuthFailure?: () => void
) => {
  // Fire immediately - no popup, no redirect, no waiting on Firebase.
  if (onAuthSuccess) {
    Promise.resolve().then(() => onAuthSuccess(PLACEHOLDER_USER, PLACEHOLDER_TOKEN));
  }
  // Return a no-op "unsubscribe" function to match onAuthStateChanged's shape.
  return () => {};
};

export const googleSignIn = async (): Promise<{ user: any; accessToken: string } | null> => {
  return { user: PLACEHOLDER_USER, accessToken: PLACEHOLDER_TOKEN };
};

export const getAccessToken = async (): Promise<string | null> => {
  return PLACEHOLDER_TOKEN;
};

export const logoutGoogle = async () => {
  // Nothing to sign out of.
};
