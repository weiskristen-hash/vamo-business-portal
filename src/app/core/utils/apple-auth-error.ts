/** Customer-safe translation keys shared by Apple authentication entry points. */
export function appleAuthErrorKey(err: unknown): string {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (
    message === 'APPLE_CANCELLED' ||
    message === 'APPLE_POPUP_CLOSED' ||
    message === 'user_cancelled_authorize' ||
    message === 'access_denied'
  ) {
    return 'AUTH.APPLE_CANCELLED';
  }
  if (
    [
      'APPLE_SDK_UNAVAILABLE',
      'APPLE_SDK_ERROR',
      'APPLE_CLIENT_ID_NOT_CONFIGURED',
      'APPLE_UNAVAILABLE',
    ].includes(message)
  ) {
    return 'AUTH.APPLE_UNAVAILABLE';
  }
  if (
    [
      'APPLE_TOKEN_MISSING',
      'APPLE_STATE_MISMATCH',
      'APPLE_STATE_EXPIRED',
      'APPLE_NONCE_MISSING',
      'INVALID_PAYLOAD',
      'INVALID_TOKEN',
    ].includes(message)
  ) {
    return 'AUTH.APPLE_TOKEN_MISSING';
  }
  if (message === 'ACCOUNT_CONFLICT' || message === 'APPLE_ACCOUNT_CONFLICT') {
    return 'AUTH.APPLE_ACCOUNT_CONFLICT';
  }
  if (message === 'ADMIN_ACCOUNT' || message === 'APPLE_ADMIN_FORBIDDEN') {
    return 'AUTH.APPLE_ADMIN_FORBIDDEN';
  }
  if (message === 'TFA_ENABLED' || message === 'APPLE_TFA_REQUIRED') {
    return 'AUTH.APPLE_TFA_REQUIRED';
  }
  if (message === 'USER_INACTIVE' || message === 'APPLE_ACCOUNT_INACTIVE') {
    return 'AUTH.APPLE_ACCOUNT_INACTIVE';
  }
  if (message === 'PROVIDER_MISMATCH' || message === 'APPLE_PROVIDER_MISMATCH') {
    return 'AUTH.APPLE_PROVIDER_MISMATCH';
  }
  if (
    message === 'EMAIL_REQUIRED' ||
    message === 'EMAIL_NOT_VERIFIED' ||
    message === 'APPLE_EMAIL_REQUIRED'
  ) {
    return 'AUTH.APPLE_EMAIL_REQUIRED';
  }
  return 'AUTH.APPLE_LOGIN_ERROR';
}
