import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { I18nService } from '../i18n/i18n.service';

export type ErrorActionCategory =
  | 'auth'
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
    const detectedCategory = this.detectCategory(err) || category;

    switch (detectedCategory) {
      case 'auth':
        return {
          headline: this.i18n.t('PORTAL.ERRORS.AUTH_HEADLINE'),
          message: this.i18n.t('PORTAL.ERRORS.AUTH_MSG'),
          actionText: this.i18n.t('PORTAL.ERRORS.AUTH_ACTION'),
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
  private detectCategory(err: any): ErrorActionCategory | null {
    if (!err) return null;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return 'network';
    }

    if (err?.message === 'OFFLINE') {
      return 'network';
    }

    const code = err?.errors?.[0]?.extensions?.code || err?.code;
    const status = err?.status || err?.response?.status;

    if (code === 'TOKEN_EXPIRED' || code === 'INVALID_TOKEN' || status === 401) {
      return 'auth';
    }

    if (code === 'FORBIDDEN' || code === 'PERMISSION_DENIED' || status === 403) {
      return 'permission';
    }

    const msg = typeof err?.message === 'string' ? err.message : '';
    if (/permission|forbidden|access fields|not exist/i.test(msg)) {
      return 'permission';
    }

    if (/network|failed to fetch|econnrefused|timeout/i.test(msg)) {
      return 'network';
    }

    return null;
  }

  /**
   * Diagnostic logger that suppresses internal leakage in production.
   */
  private logDiagnostic(err: unknown, category: string): void {
    if (!environment.production) {
      console.warn(`[CustomerErrorService:${category}] Handled diagnostic:`, err);
    } else {
      // In production, log a minimal sanitized message without payload/schema/tokens
      const sanitizedName = (err as any)?.name || 'Error';
      const code = (err as any)?.errors?.[0]?.extensions?.code || (err as any)?.code || 'UNKNOWN';
      console.warn(`[Diagnostic] Action failed (${category}): ${sanitizedName} [${code}]`);
    }
  }
}
