import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

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
          headline: 'Please check your information',
          message: customValidationMessage,
        };
      }
    }

    // 3. Inspect technical error characteristics
    const detectedCategory = this.detectCategory(err) || category;

    switch (detectedCategory) {
      case 'auth':
        return {
          headline: 'Session expired',
          message: 'Your session has expired. Please sign in again.',
          actionText: 'Sign In',
        };

      case 'network':
        return {
          headline: 'Connection issue',
          message: "We're having trouble connecting. Check your connection and try again.",
          secondaryMessage: `If the problem continues, contact VAMO support at ${VAMO_SUPPORT_EMAIL}.`,
          actionText: 'Try Again',
        };

      case 'permission':
        return {
          headline: category === 'load' ? 'Loading error' : 'Action unavailable',
          message: category === 'load'
            ? "We couldn't load your business profile. Please refresh the page."
            : "We couldn't make that change. This action is not available for your account.",
          secondaryMessage: `If you believe this is an error, please reach out to ${VAMO_SUPPORT_EMAIL}.`,
          actionText: category === 'load' ? 'Refresh' : undefined,
        };

      case 'upload':
        return {
          headline: 'Upload failed',
          message: "We couldn't upload that image. Please try again.",
          secondaryMessage: 'Supported formats include JPG, PNG, and WebP up to 10MB.',
          actionText: 'Try Again',
        };

      case 'delete':
        return {
          headline: 'Removal failed',
          message: "We couldn't remove this item. Please try again.",
          secondaryMessage: `If the problem continues, contact VAMO support at ${VAMO_SUPPORT_EMAIL}.`,
          actionText: 'Try Again',
        };

      case 'load':
        return {
          headline: 'Loading error',
          message: "We couldn't load this information. Please refresh the page.",
          secondaryMessage: `If the problem continues, contact VAMO support at ${VAMO_SUPPORT_EMAIL}.`,
          actionText: 'Refresh',
        };

      case 'save':
      default:
        return {
          headline: 'Save failed',
          message: "We couldn't save your changes. Please try again.",
          secondaryMessage: `If the problem continues, contact VAMO support at ${VAMO_SUPPORT_EMAIL}.`,
          actionText: 'Try Again',
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
