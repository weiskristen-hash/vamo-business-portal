/**
 * Customer-safe translation keys shared by Apple authentication entry points.
 */
export function appleAuthErrorKey(err: unknown): string {
  const code = (err as any)?.code || '';
  const message = err instanceof Error ? err.message : String(err ?? '');
  const lower = message.toLowerCase();

  if (
    code === 'CANCELLED' ||
    message === 'APPLE_POPUP_CLOSED' ||
    message === 'APPLE_CANCELLED' ||
    lower.includes('popup_closed_by_user') ||
    lower.includes('user_trigger_new_signin_flow') ||
    lower.includes('cancelled') ||
    lower.includes('canceled')
  ) {
    return 'AUTH.APPLE_CANCELLED';
  }

  if (
    code === 'SCRIPT_LOAD_FAILED' ||
    code === 'NOT_CONFIGURED' ||
    code === 'UNAVAILABLE' ||
    [
      'APPLE_SDK_UNAVAILABLE',
      'APPLE_SDK_ERROR',
      'APPLE_CLIENT_ID_NOT_CONFIGURED',
      'APPLE_FLOW_NOT_CONFIGURED',
    ].includes(message) ||
    lower.includes('failed to load apple') ||
    lower.includes('sdk is unavailable') ||
    lower.includes('not configured')
  ) {
    return 'AUTH.APPLE_UNAVAILABLE';
  }

  if (
    code === 'TOKEN_MISSING' ||
    code === 'STATE_MISMATCH' ||
    code === 'NONCE_MISMATCH' ||
    [
      'APPLE_TOKEN_MISSING',
      'APPLE_STATE_MISMATCH',
      'APPLE_NONCE_MISMATCH',
    ].includes(message) ||
    lower.includes('identity_token') ||
    lower.includes('state mismatch') ||
    lower.includes('nonce mismatch')
  ) {
    return 'AUTH.APPLE_TOKEN_MISSING';
  }

  return 'AUTH.APPLE_LOGIN_ERROR';
}
