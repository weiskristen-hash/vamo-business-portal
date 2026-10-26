import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { I18nService } from '../i18n/i18n.service';

export type ErrorActionCategory =
  | 'auth'
  | 'register'
  | 'register-auth'
  | 'register-config'
  | 'register-login-unavailable'
  | 'register-verify-email'
  | 'register-validation'
  | 'duplicate-email'
  | 'save'
  | 'load'
  | 'upload'
  | 'delete'
  | 'network'
  | 'permission'
  | 'validation';

export interface CustomerErrorDetail {
  headline: string;
  message: string;
  secondaryMessage?: string;
  actionText?: string;
}

export const VAMO_SUPPORT_EMAIL = 'support@vamo-app.com';

@Injectable({
  providedIn: 'root',
})
export class CustomerErrorService {
  private readonly i18n = inject(I18nService);

  private readonly technicalPatterns = [
    /directus/i,
    /collection/i,
    /field\s*['"][a-zA-Z0-9_]+['"]/i,
    /forbidden/i,
    /unauthorized/i,
    /permission/i,
    /queried in root/i,
    /database/i,
    /schema/i,
    /sql/i,
    /jwt/i,
    /token/i,
    /graphql/i,
    /http\s*(?:401|403|404|500|502|503)/i,
    /request failed/i,
    /network error/i,
    /failed to fetch/i,
    /provider_link/i,
    /events_files/i,
    /providers_files/i,
    /stripe/i,
    /client_secret/i,
    /payment_intent/i,
    /setup_intent/i,
    /verification_url/i,
    /can't be used to verify registered users/i,
    /cannot be used to verify registered users/i,
  ];

  /**
   * Translates any error into a safe, user-friendly message.
   * Guaranteed never to leak Directus details, field names, or stack traces.
   */
  toCustomerMessage(
    err: unknown,
    category: ErrorActionCategory = 'save',
    customValidationMessage?: string
  ): string {
    const detail = this.toCustomerError(err, category, customValidationMessage);
    return detail.message;
  }

  /**
   * Produces a structured translation key and optional parameters for reactive customer-safe errors.
   */
  toCustomerErrorKey(
    err: unknown,
    category: ErrorActionCategory = 'save'
  ): { key: string; params?: Record<string, string | number> } {
    this.logDiagnostic(err, category);
    const detectedCategory = this.detectCategory(err, category) || category;

    switch (detectedCategory) {
      case 'auth':
        return { key: 'PORTAL.ERRORS.AUTH_MSG' };
      case 'duplicate-email':
        return { key: 'PORTAL.ERRORS.DUPLICATE_EMAIL_MSG' };
      case 'register-auth':
        return { key: 'PORTAL.ERRORS.REGISTER_AUTH_MSG' };
      case 'register-config':
        return { key: 'PORTAL.ERRORS.REGISTER_CONFIG_MSG' };
      case 'register-login-unavailable':
        return { key: 'PORTAL.ERRORS.REGISTER_LOGIN_UNAVAILABLE_MSG' };
      case 'register-verify-email':
        return { key: 'PORTAL.ERRORS.REGISTER_VERIFY_EMAIL_MSG' };
      case 'register-validation':
        return { key: 'PORTAL.ERRORS.REGISTER_VALIDATION_MSG' };
      case 'register':
        return { key: 'PORTAL.ERRORS.REGISTER_MSG' };
      case 'network':
        return { key: 'PORTAL.ERRORS.NETWORK_MSG' };
      case 'permission':
        return {
          key: category === 'load'
            ? 'PORTAL.ERRORS.PERMISSION_LOAD_MSG'
            : 'PORTAL.ERRORS.PERMISSION_ACTION_MSG',
        };
      case 'upload':
        return { key: 'PORTAL.ERRORS.UPLOAD_MSG' };
      case 'delete':
        return { key: 'PORTAL.ERRORS.DELETE_MSG' };
      case 'load':
        return { key: 'PORTAL.ERRORS.LOAD_MSG' };
      case 'save':
        return { key: 'PORTAL.ERRORS.SAVE_MSG' };
      case 'validation':
        return { key: 'PORTAL.ERRORS.VALIDATION_MSG' };
      default:
        return { key: 'PORTAL.ERRORS.SAVE_MSG' };
    }
  }

  /**
   * Produces a structured customer error containing headline, message, and optional support action.
   */
  toCustomerError(
    err: unknown,
    category: ErrorActionCategory = 'save',
    customValidationMessage?: string
  ): CustomerErrorDetail {
    // 1. Log technical diagnostic sanitized in development
    this.logDiagnostic(err, category);

    // 2. Explicit validation message (safe if it doesn't contain technical internals)
    if (category === 'validation' && customValidationMessage) {
      if (!this.containsTechnicalLeak(customValidationMessage)) {
        return {
          headline: this.i18n.t('PORTAL.ERRORS.VALIDATION_HEADLINE'),
          message: customValidationMessage,
        };
      }
    }

    // 3. Inspect technical error characteristics
    const detectedCategory = this.detectCategory(err, category) || category;

    switch (detectedCategory) {
      case 'auth':
        return {
          headline: this.i18n.t('PORTAL.ERRORS.AUTH_HEADLINE'),
          message: this.i18n.t('PORTAL.ERRORS.AUTH_MSG'),
          actionText: this.i18n.t('PORTAL.ERRORS.AUTH_ACTION'),
        };

      case 'duplicate-email':
        return {
          headline: this.i18n.t('ONBOARDING.ERROR_EMAIL_TAKEN'),
          message: this.i18n.t('PORTAL.ERRORS.DUPLICATE_EMAIL_MSG'),
          actionText: this.i18n.t('ONBOARDING.ERROR_EMAIL_TAKEN_LOGIN'),
        };

      case 'register-auth':
        return {
          headline: this.i18n.t('PORTAL.ERRORS.REGISTER_HEADLINE'),
          message: this.i18n.t('PORTAL.ERRORS.REGISTER_AUTH_MSG'),
          actionText: this.i18n.t('ONBOARDING.ERROR_EMAIL_TAKEN_LOGIN'),
        };

      case 'register-config':
        return {
          headline: this.i18n.t('PORTAL.ERRORS.REGISTER_HEADLINE'),
          message: this.i18n.t('PORTAL.ERRORS.REGISTER_CONFIG_MSG'),
          secondaryMessage: this.i18n.t('PORTAL.ERRORS.SUPPORT_SECONDARY', { email: VAMO_SUPPORT_EMAIL }),
          actionText: this.i18n.t('PORTAL.ERRORS.TRY_AGAIN'),
        };

      case 'register-login-unavailable':
        return {
          headline: this.i18n.t('PORTAL.ERRORS.REGISTER_HEADLINE'),
          message: this.i18n.t('PORTAL.ERRORS.REGISTER_LOGIN_UNAVAILABLE_MSG'),
          actionText: this.i18n.t('ONBOARDING.ERROR_EMAIL_TAKEN_LOGIN'),
        };

      case 'register-verify-email':
        return {
          headline: this.i18n.t('PORTAL.ERRORS.REGISTER_HEADLINE'),
          message: this.i18n.t('PORTAL.ERRORS.REGISTER_VERIFY_EMAIL_MSG'),
          actionText: this.i18n.t('ONBOARDING.ERROR_EMAIL_TAKEN_LOGIN'),
        };

      case 'register-validation':
        return {
          headline: this.i18n.t('PORTAL.ERRORS.VALIDATION_HEADLINE'),
          message: this.i18n.t('PORTAL.ERRORS.REGISTER_VALIDATION_MSG'),
          actionText: this.i18n.t('PORTAL.ERRORS.TRY_AGAIN'),
        };

      case 'register':
        return {
          headline: this.i18n.t('PORTAL.ERRORS.REGISTER_HEADLINE'),
          message: this.i18n.t('PORTAL.ERRORS.REGISTER_MSG'),
          secondaryMessage: this.i18n.t('PORTAL.ERRORS.SUPPORT_SECONDARY', { email: VAMO_SUPPORT_EMAIL }),
          actionText: this.i18n.t('PORTAL.ERRORS.TRY_AGAIN'),
        };

      case 'network':
        return {
          headline: this.i18n.t('PORTAL.ERRORS.NETWORK_HEADLINE'),
          message: this.i18n.t('PORTAL.ERRORS.NETWORK_MSG'),
          secondaryMessage: this.i18n.t('PORTAL.ERRORS.NETWORK_SECONDARY', { email: VAMO_SUPPORT_EMAIL }),
          actionText: this.i18n.t('PORTAL.ERRORS.TRY_AGAIN'),
        };

      case 'permission':
        return {
          headline: category === 'load'
            ? this.i18n.t('PORTAL.ERRORS.PERMISSION_LOAD_HEADLINE')
            : this.i18n.t('PORTAL.ERRORS.PERMISSION_ACTION_HEADLINE'),
          message: category === 'load'
            ? this.i18n.t('PORTAL.ERRORS.PERMISSION_LOAD_MSG')
            : this.i18n.t('PORTAL.ERRORS.PERMISSION_ACTION_MSG'),
          secondaryMessage: this.i18n.t('PORTAL.ERRORS.PERMISSION_SECONDARY', { email: VAMO_SUPPORT_EMAIL }),
          actionText: category === 'load' ? this.i18n.t('PORTAL.ERRORS.REFRESH') : undefined,
        };

      case 'upload':
        return {
          headline: this.i18n.t('PORTAL.ERRORS.UPLOAD_HEADLINE'),
          message: this.i18n.t('PORTAL.ERRORS.UPLOAD_MSG'),
          secondaryMessage: this.i18n.t('PORTAL.ERRORS.UPLOAD_SECONDARY'),
          actionText: this.i18n.t('PORTAL.ERRORS.TRY_AGAIN'),
        };

      case 'delete':
        return {
          headline: this.i18n.t('PORTAL.ERRORS.DELETE_HEADLINE'),
          message: this.i18n.t('PORTAL.ERRORS.DELETE_MSG'),
          secondaryMessage: this.i18n.t('PORTAL.ERRORS.SUPPORT_SECONDARY', { email: VAMO_SUPPORT_EMAIL }),
          actionText: this.i18n.t('PORTAL.ERRORS.TRY_AGAIN'),
        };

      case 'load':
        return {
          headline: this.i18n.t('PORTAL.ERRORS.LOAD_HEADLINE'),
          message: this.i18n.t('PORTAL.ERRORS.LOAD_MSG'),
          secondaryMessage: this.i18n.t('PORTAL.ERRORS.SUPPORT_SECONDARY', { email: VAMO_SUPPORT_EMAIL }),
          actionText: this.i18n.t('PORTAL.ERRORS.REFRESH'),
        };

      case 'save':
        return {
          headline: this.i18n.t('PORTAL.ERRORS.SAVE_HEADLINE'),
          message: this.i18n.t('PORTAL.ERRORS.SAVE_MSG'),
          secondaryMessage: this.i18n.t('PORTAL.ERRORS.SUPPORT_SECONDARY', { email: VAMO_SUPPORT_EMAIL }),
          actionText: this.i18n.t('PORTAL.ERRORS.TRY_AGAIN'),
        };

      case 'validation':
        return {
          headline: this.i18n.t('PORTAL.ERRORS.VALIDATION_HEADLINE'),
          message: this.i18n.t('PORTAL.ERRORS.VALIDATION_MSG'),
          actionText: this.i18n.t('PORTAL.ERRORS.TRY_AGAIN'),
        };

      default:
        return {
          headline: this.i18n.t('PORTAL.ERRORS.SAVE_HEADLINE'),
          message: this.i18n.t('PORTAL.ERRORS.SAVE_MSG'),
          secondaryMessage: this.i18n.t('PORTAL.ERRORS.SUPPORT_SECONDARY', { email: VAMO_SUPPORT_EMAIL }),
          actionText: this.i18n.t('PORTAL.ERRORS.TRY_AGAIN'),
        };
    }
  }

  /**
   * Sanitizes any custom user-facing message to prevent accidental leaks.
   */
  sanitizeCustomerFacingText(text: string, fallback: string): string {
    if (!text || this.containsTechnicalLeak(text)) {
      return fallback;
    }
    return text;
  }

  /**
   * Checks whether a string exposes backend implementation details.
   */
  containsTechnicalLeak(str: string): boolean {
    if (!str || typeof str !== 'string') return false;
    return this.technicalPatterns.some((pattern) => pattern.test(str));
  }

  /**
   * Detects underlying category from error code, status, or network states.
   */
  private detectCategory(
    err: any,
    fallbackCategory: ErrorActionCategory = 'save'
  ): ErrorActionCategory | null {
    if (!err) return null;

    const errors = Array.isArray(err?.errors) ? err.errors : [];
    const code = err?.errors?.[0]?.extensions?.code || err?.code || '';
    const status = err?.status || err?.response?.status;
    const rawMsg = [
      ...errors.map((e: any) => (typeof e?.message === 'string' ? e.message : '')),
      ...errors.map((e: any) => (typeof e?.extensions?.reason === 'string' ? e.extensions.reason : '')),
      typeof err?.message === 'string' ? err.message : '',
    ]
      .join(' ')
      .trim();
    const lowerMsg = rawMsg.toLowerCase();

    const isDuplicateEmail =
      code === 'RECORD_NOT_UNIQUE' ||
      errors.some((e: any) => e?.extensions?.code === 'RECORD_NOT_UNIQUE' || e?.code === 'RECORD_NOT_UNIQUE') ||
      lowerMsg.includes('has to be unique') ||
      lowerMsg.includes('already exist') ||
      lowerMsg.includes('already registered') ||
      lowerMsg.includes('email already taken');

    if (isDuplicateEmail) {
      return 'duplicate-email';
    }

    const isRegistrationContext =
      fallbackCategory === 'register' ||
      fallbackCategory === 'register-auth' ||
      fallbackCategory === 'register-config' ||
      fallbackCategory === 'register-login-unavailable' ||
      fallbackCategory === 'register-verify-email' ||
      fallbackCategory === 'register-validation';

    // Email verification required before sign-in
    if (
      code === 'UNVERIFIED_USER' ||
      code === 'EMAIL_NOT_VERIFIED' ||
      err?.requiresEmailVerification ||
      (isRegistrationContext &&
        (lowerMsg.includes('email not verified') ||
          lowerMsg.includes('verify your email') ||
          lowerMsg.includes('account is unverified') ||
          lowerMsg.includes('user is unverified')))
    ) {
      return 'register-verify-email';
    }

    // Registration succeeded, but immediate automatic login failed for a non-credential reason
    if (code === 'POST_REGISTRATION_LOGIN_FAILED' || err?.isPostRegistrationLoginFailure) {
      return 'register-login-unavailable';
    }

    // Registration configuration error (e.g., Directus rejecting verification_url or public registration disabled)
    if (
      code === 'REGISTRATION_CONFIG_ERROR' ||
      (isRegistrationContext &&
        (code === 'FORBIDDEN' ||
          code === 'PERMISSION_DENIED' ||
          status === 403 ||
          lowerMsg.includes('public registration') ||
          lowerMsg.includes('registration is disabled') ||
          lowerMsg.includes("can't be used to verify registered users") ||
          lowerMsg.includes('cannot be used to verify registered users') ||
          lowerMsg.includes('verification_url')))
    ) {
      return 'register-config';
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return 'network';
    }

    if (err?.message === 'OFFLINE' || err?.isNetworkError) {
      return 'network';
    }

    // Genuine authenticated session expiry
    if (
      code === 'TOKEN_EXPIRED' ||
      code === 'SESSION_EXPIRED' ||
      err?.message === 'SESSION_EXPIRED'
    ) {
      return 'auth';
    }

    // Registration or credential authentication failure (never a session expiry)
    if (
      code === 'INVALID_CREDENTIALS' ||
      code === 'INVALID_USER_CREDENTIALS' ||
      code === 'REGISTRATION_AUTH_FAILED' ||
      err?.isRegistrationAuthConflict ||
      (isRegistrationContext && (status === 401 || code === 'INVALID_TOKEN'))
    ) {
      return 'register-auth';
    }

    if (code === 'INVALID_TOKEN' || status === 401) {
      return 'auth';
    }

    if (code === 'FORBIDDEN' || code === 'PERMISSION_DENIED' || status === 403) {
      return 'permission';
    }

    if (
      code === 'INVALID_PAYLOAD' ||
      code === 'FAILED_VALIDATION' ||
      code === 'INVALID_QUERY' ||
      status === 400 ||
      status === 422
    ) {
      if (isRegistrationContext) {
        return 'register-validation';
      }
      if (fallbackCategory === 'validation') {
        return 'validation';
      }
    }

    if (/permission|forbidden|access fields|not exist/i.test(rawMsg)) {
      return 'permission';
    }

    if (/network|failed to fetch|econnrefused|timeout/i.test(rawMsg)) {
      return 'network';
    }

    return null;
  }

  /**
   * Redacts passwords and tokens from diagnostic payloads before logging.
   */
  private redactDiagnosticError(err: unknown): unknown {
    if (!err || typeof err !== 'object') return err;
    const sensitiveKeys = new Set([
      'password',
      'confirmPassword',
      'access_token',
      'refresh_token',
      'token',
      'authorization',
    ]);
    const hasSensitiveKey = Object.keys(err as Record<string, unknown>).some((k) =>
      sensitiveKeys.has(k)
    );
    if (!hasSensitiveKey) return err;

    const clone: Record<string, unknown> = { ...(err as Record<string, unknown>) };
    if (err instanceof Error) {
      clone['name'] = err.name;
      clone['message'] = err.message;
    }
    for (const key of Object.keys(clone)) {
      if (sensitiveKeys.has(key)) {
        clone[key] = '[REDACTED]';
      }
    }
    return clone;
  }

  /**
   * Diagnostic logger that suppresses internal leakage in production.
   */
  private logDiagnostic(err: unknown, category: string): void {
    if (!environment.production) {
      console.warn(
        `[CustomerErrorService:${category}] Handled diagnostic:`,
        this.redactDiagnosticError(err)
      );
    } else {
      // In production, log a minimal sanitized message without payload/schema/tokens
      const sanitizedName = (err as any)?.name || 'Error';
      const code = (err as any)?.errors?.[0]?.extensions?.code || (err as any)?.code || 'UNKNOWN';
      console.warn(`[Diagnostic] Action failed (${category}): ${sanitizedName} [${code}]`);
    }
  }
}
