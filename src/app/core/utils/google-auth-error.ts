/** Customer-safe translation keys shared by Google registration entry points. */
export function googleAuthErrorKey(err: unknown): string {
  const message = err instanceof Error ? err.message : '';
  if (message === 'GOOGLE_POPUP_CLOSED' || message === 'GOOGLE_CANCELLED') return 'AUTH.GOOGLE_CANCELLED';
  if (['GOOGLE_SDK_UNAVAILABLE', 'GOOGLE_SDK_ERROR', 'GOOGLE_PROMPT_NOT_DISPLAYED', 'GOOGLE_CLIENT_ID_NOT_CONFIGURED'].includes(message)) {
    return 'AUTH.GOOGLE_UNAVAILABLE';
  }
  if (message === 'GOOGLE_TOKEN_MISSING') return 'AUTH.GOOGLE_TOKEN_MISSING';
  return 'AUTH.GOOGLE_LOGIN_ERROR';
}
