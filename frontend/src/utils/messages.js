import { ApiError } from '../api/client';

const UNAVAILABLE = 'The service is temporarily unavailable. Please try again shortly.';
const TRY_NEW_MESSAGE = 'Each sign-in message works once. Start again to get a new one.';
const CHECK_ACCOUNT = 'Make sure MetaMask is on the same account you connected here, then try again.';

// What happened, in plain language, for each error code the server can return.
const MESSAGES = {
  CHALLENGE_EXPIRED: 'The sign-in request expired. Please try again.',
  CHALLENGE_ALREADY_USED: 'This sign-in request is no longer valid. Please try again.',
  INVALID_CHALLENGE: 'This sign-in request is no longer valid. Please try again.',
  INVALID_SIGNATURE: 'The signature does not match the connected wallet.',
  SIGNATURE_MISMATCH: 'The signature does not match the connected wallet.',
  WALLET_NOT_REGISTERED: 'This wallet is not registered.',
  WALLET_REVOKED: 'This wallet has been revoked by an administrator.',
  WALLET_ALREADY_REGISTERED: 'This wallet is already registered.',
  REGISTRATION_INCOMPLETE: 'Your registration needs attention. Run registration again or contact an administrator.',
  STATE_CONFLICT: 'Your registration needs attention. Run registration again or contact an administrator.',
  ACCESS_DENIED: 'You do not have permission to view this page.',
  UNAUTHENTICATED: 'Your session has expired or was ended. Please sign in again.',
  SESSION_REVOKED: 'Your session has expired or was ended. Please sign in again.',
  WALLET_NOT_FOUND: 'This wallet is not registered on the blockchain.',
  WALLET_ALREADY_REVOKED: 'This wallet is already revoked.',
  WALLET_ALREADY_ACTIVE: 'This wallet is already active.',
  CANNOT_MODIFY_OWN_WALLET: 'You cannot change the status of your own wallet.',
  SECOND_STEP_INVALID: 'That code is not right, or it was already used.',
  SECOND_STEP_EXPIRED: 'This sign-in attempt has ended. Sign the message again to get a new one.',
  VERIFICATION_CODE_INVALID: 'That code is not right, or it was already used.',
  STEP_UP_FAILED: 'The confirmation signature was not accepted, so nothing was changed.',
  LOGIN_RISK_TOO_HIGH: 'This sign-in was refused because it does not look like your usual sign-ins.',
  RISK_CHECK_UNAVAILABLE: 'This sign-in could not be checked right now, so it was refused.',
  CURRENT_DEVICE: 'This is the device you are using. Use Logout to end this session.',
  SECOND_STEP_ALREADY_ENABLED: 'The second step is already turned on.',
  SECOND_STEP_NOT_ENABLED: 'The second step is not turned on for this wallet.',
  SECOND_STEP_SETUP_MISSING: 'Start the setup first.',
  WALLET_ALREADY_FLAGGED: 'This wallet is already flagged.',
  WALLET_NOT_FLAGGED: 'This wallet is not flagged.',
  EMERGENCY_STOP_ACTIVE: 'This is paused by an administrator.',
  EMERGENCY_STOP_ALREADY_ACTIVE: 'The emergency stop is already on.',
  EMERGENCY_STOP_NOT_ACTIVE: 'The emergency stop is not on.',
  ADMIN_ACTION_ALREADY_PENDING: 'The same request is already waiting.',
  ADMIN_ACTION_NOT_PENDING: 'This request is no longer waiting.',
  RESOURCE_NOT_FOUND: 'This item no longer exists.',
  INTERNAL_ERROR: 'An unexpected error occurred.',
  NETWORK: 'Cannot reach the server.',
};

// What the person can do next. Shown under the message when there is something useful to say.
const HINTS = {
  CHALLENGE_EXPIRED: 'Sign-in messages are valid for two minutes. Start again and approve the MetaMask request promptly.',
  CHALLENGE_ALREADY_USED: TRY_NEW_MESSAGE,
  INVALID_CHALLENGE: TRY_NEW_MESSAGE,
  INVALID_SIGNATURE: CHECK_ACCOUNT,
  SIGNATURE_MISMATCH: CHECK_ACCOUNT,
  WALLET_REVOKED:
    'A revoked wallet cannot sign in or register. Contact an administrator if you think this is a mistake.',
  REGISTRATION_INCOMPLETE: 'Open the Register page and register this wallet again. It costs no gas.',
  IP_TEMPORARILY_BLOCKED: 'Sign-in from this network is paused after repeated failed attempts.',
  SECOND_STEP_INVALID: 'Codes change every 30 seconds. Check the clock on your phone, or use a backup code.',
  STEP_UP_FAILED: 'Approve the MetaMask request with the wallet you are signed in with, within two minutes.',
  LOGIN_RISK_TOO_HIGH:
    'Sign in from a device you have used before, or ask an administrator. Turning on the second step lets such sign-ins continue with a code.',
  EMERGENCY_STOP_ACTIVE: 'An administrator has paused changes while a security problem is handled. Try again later.',
  INTERNAL_ERROR: 'If this keeps happening, give the reference under "Technical details" to an administrator.',
  NETWORK: 'Check that you are online and that the BlockAuth server is running.',
};

function isAddressError(error) {
  return error.fieldErrors.some((field) => field.field === 'walletAddress' || field.field === 'address');
}

/** Plain-language text for any failure from the API or from MetaMask. */
export function messageFor(error) {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return error.retryAfter
        ? `Too many attempts. Please wait ${error.retryAfter} seconds.`
        : 'Too many attempts. Please wait and try again.';
    }
    if (error.code === 'EMERGENCY_STOP_ACTIVE') return MESSAGES.EMERGENCY_STOP_ACTIVE;
    if (error.status >= 502 || (error.status >= 500 && error.code === 'UNKNOWN')) return UNAVAILABLE;
    if (error.code === 'VALIDATION_FAILED' && isAddressError(error)) return 'Not a valid Ethereum address';
    return MESSAGES[error.code] ?? error.message;
  }
  // MetaMask reports failures as { code, message } (EIP-1193).
  if (error?.code === 4001) return 'You cancelled the request in MetaMask.';
  if (error?.code === -32002) return 'A MetaMask request is already open — check the extension.';
  if (error?.code === 4100) return 'MetaMask has not shared this account with BlockAuth. Connect the wallet again.';
  return 'Something went wrong. Please try again.';
}

export function hintFor(error) {
  if (error instanceof ApiError) {
    if (error.status >= 502 && error.code !== 'EMERGENCY_STOP_ACTIVE') return 'Your wallet and your account are not affected.';
    return HINTS[error.code] ?? null;
  }
  if (error?.code === 4001) return 'Nothing was signed or shared. You can try again when you are ready.';
  return null;
}
