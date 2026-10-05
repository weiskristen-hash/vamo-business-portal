import { Injectable } from '@angular/core';
import { runtimeConfig } from '../config/runtime-config';

@Injectable({
  providedIn: 'root',
})
export class GoogleAuthService {
  private scriptLoadingPromise: Promise<void> | null = null;

  /**
   * Loads the Google Identity Services (GIS) client script if not already present.
   */
  loadGoogleScript(): Promise<void> {
    if (typeof window === 'undefined') {
      return Promise.reject(new Error('GOOGLE_SDK_UNAVAILABLE'));
    }

    const g = (window as any).google;
    if (g?.accounts?.id) {
      return Promise.resolve();
    }

    if (this.scriptLoadingPromise) {
      return this.scriptLoadingPromise;
    }

    this.scriptLoadingPromise = new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve());
        existingScript.addEventListener('error', () => {
          this.scriptLoadingPromise = null;
          reject(new Error('GOOGLE_SDK_UNAVAILABLE'));
        });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        this.scriptLoadingPromise = null;
        reject(new Error('GOOGLE_SDK_UNAVAILABLE'));
      };
      document.head.appendChild(script);
    });

    return this.scriptLoadingPromise;
  }

  /**
   * Checks whether the Google Identity Services SDK is loaded in the window.
   */
  isLoaded(): boolean {
    if (typeof window === 'undefined') return false;
    const g = (window as any).google;
    return !!(g?.accounts?.id?.initialize && g?.accounts?.id?.renderButton);
  }

  /**
   * Triggers the Google One Tap / credential prompt and returns the Google ID token.
   * Note: As per Google Identity Services documentation, google.accounts.id.prompt()
   * is subject to exponential cooldowns and browser privacy/One Tap suppression.
   * For explicit user button clicks, use renderButton() instead.
   */
  async promptForIdToken(): Promise<string> {
    await this.loadGoogleScript();

    const google = (window as any).google;
    if (!google?.accounts?.id) {
      throw new Error('GOOGLE_SDK_UNAVAILABLE');
    }

    const clientId = runtimeConfig.googleClientId;
    if (!clientId) {
      throw new Error('GOOGLE_CLIENT_ID_NOT_CONFIGURED');
    }

    return new Promise<string>((resolve, reject) => {
      let settled = false;

      const finishResolve = (token: string) => {
        if (!settled) {
          settled = true;
          resolve(token);
        }
      };

      const finishReject = (err: Error) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      };

      try {
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (response: { credential?: string }) => {
            if (response?.credential && typeof response.credential === 'string') {
              finishResolve(response.credential);
            } else {
              finishReject(new Error('GOOGLE_TOKEN_MISSING'));
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
          itp_support: true,
        });

        google.accounts.id.prompt((notification: any) => {
          if (!notification) return;

          if (notification.isNotDisplayed && notification.isNotDisplayed()) {
            finishReject(new Error('GOOGLE_SDK_UNAVAILABLE'));
          } else if (notification.isSkippedMoment && notification.isSkippedMoment()) {
            finishReject(new Error('GOOGLE_POPUP_CLOSED'));
          } else if (notification.isDismissedMoment && notification.isDismissedMoment()) {
            const reason = notification.getDismissedReason ? notification.getDismissedReason() : '';
            if (reason === 'credential_returned') {
              // Resolved via callback
              return;
            }
            finishReject(new Error('GOOGLE_POPUP_CLOSED'));
          }
        });
      } catch {
        finishReject(new Error('GOOGLE_SDK_ERROR'));
      }
    });
  }

  /**
   * Renders the official Google-provided Sign-In button into a host element.
   * Google Identity Services button flow opens an OAuth popup window upon user click,
   * bypassing One Tap cooldowns, user dismissal suppression, and third-party cookie restrictions.
   */
  renderButton(
    element: HTMLElement,
    onCredential: (credential: string) => void,
    onError?: (err: Error) => void,
    options?: {
      locale?: string;
      width?: number;
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      text?: 'continue_with' | 'signin_with' | 'signup_with';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      logo_alignment?: 'left' | 'center';
      click_listener?: () => void;
    }
  ): void {
    if (typeof window === 'undefined') return;

    const google = (window as any).google;
    if (!google?.accounts?.id) {
      onError?.(new Error('GOOGLE_SDK_UNAVAILABLE'));
      return;
    }

    const clientId = runtimeConfig.googleClientId;
    if (!clientId) {
      onError?.(new Error('GOOGLE_CLIENT_ID_NOT_CONFIGURED'));
      return;
    }

    try {
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (response: { credential?: string }) => {
          if (response?.credential && typeof response.credential === 'string') {
            onCredential(response.credential);
          } else {
            onError?.(new Error('GOOGLE_TOKEN_MISSING'));
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
        itp_support: true,
      });

      google.accounts.id.renderButton(element, {
        type: 'standard',
        shape: options?.shape || 'rectangular',
        theme: options?.theme || 'outline',
        text: options?.text || 'continue_with',
        size: 'large',
        logo_alignment: options?.logo_alignment || 'center',
        width: options?.width || 380,
        locale: options?.locale,
        click_listener: options?.click_listener,
      });
    } catch {
      onError?.(new Error('GOOGLE_SDK_ERROR'));
    }
  }
}
