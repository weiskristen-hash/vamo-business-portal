import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BusinessService } from '../../core/services/business.service';
import { LanguageSelectorComponent } from '../../core/i18n/language-selector.component';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, RouterModule, LanguageSelectorComponent, TranslatePipe],
  template: `
    <header class="topbar" role="banner">
      <div class="topbar-left">
        <!-- Mobile hamburger toggle button -->
        <button
          type="button"
          class="hamburger-btn"
          (click)="toggleSidebar.emit()"
          [attr.aria-label]="'PORTAL.SHELL.OPEN_MENU' | translate"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>

        <h1 class="page-title">{{ pageTitle | translate }}</h1>
      </div>

      <!-- Business Identity / User Menu & Language Selector -->
      <div class="topbar-right" *ngIf="authService.currentUser as user">
        <app-language-selector></app-language-selector>

        <!-- Business Identity Pill -->
        <div class="business-pill" (click)="toggleDropdown()" [attr.aria-expanded]="dropdownOpen" [attr.aria-label]="'PORTAL.SHELL.USER_MENU' | translate">
          <div class="business-avatar" *ngIf="getBusinessLogoUrl(user) as logoUrl; else textAvatar">
            <img [src]="logoUrl" [alt]="user.provider_link?.name || ('PORTAL.SHELL.DEFAULT_BUSINESS_NAME' | translate)" />
          </div>
          <ng-template #textAvatar>
            <div class="business-avatar business-avatar-text">
              {{ getBusinessInitials(user) }}
            </div>
          </ng-template>

          <div class="business-meta">
            <span class="business-name">{{ user.provider_link?.name || ('PORTAL.SHELL.DEFAULT_BUSINESS_NAME' | translate) }}</span>
            <span class="business-status">
              <span class="status-dot"></span>
              {{ user.provider_link?.subscription_tier ? (user.provider_link?.subscription_tier | uppercase) : ('PORTAL.SHELL.STATUS_ACTIVE' | translate) }}
            </span>
          </div>

          <svg class="chevron-icon" [class.rotated]="dropdownOpen" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>

        <!-- User Dropdown Menu -->
        <div class="dropdown-menu" *ngIf="dropdownOpen">
          <div class="dropdown-header">
            <div class="dropdown-user-name">{{ user.first_name || ('PORTAL.SHELL.DEFAULT_USER_NAME' | translate) }} {{ user.last_name || '' }}</div>
            <div class="dropdown-user-email">{{ user.email }}</div>
          </div>
          <div class="dropdown-divider"></div>
          <a routerLink="/app/business" (click)="dropdownOpen = false" class="dropdown-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <span>{{ 'PORTAL.SHELL.NAV_PROFILE' | translate }}</span>
          </a>
          <a routerLink="/app/settings" (click)="dropdownOpen = false" class="dropdown-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            <span>{{ 'PORTAL.SHELL.NAV_SETTINGS' | translate }}</span>
          </a>
          <div class="dropdown-divider"></div>
          <button type="button" class="dropdown-item dropdown-item-danger" (click)="signOut()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span>{{ 'PORTAL.SHELL.SIGN_OUT' | translate }}</span>
          </button>
        </div>
      </div>
    </header>
  `,
  styles: [`
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: var(--vamo-topbar-height);
      padding: 0 28px;
      background: var(--vamo-surface);
      border-bottom: 1px solid var(--vamo-border);
      position: sticky;
      top: 0;
      z-index: 20;
    }

    .topbar-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .hamburger-btn {
      display: none;
      background: transparent;
      border: 1px solid var(--vamo-border);
      color: var(--vamo-text);
      padding: 7px;
      border-radius: 8px;
      cursor: pointer;
    }

    .hamburger-btn:hover {
      color: var(--vamo-primary);
      background: var(--vamo-surface-subtle);
    }

    .page-title {
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--vamo-text);
    }

    .topbar-right {
      display: flex;
      align-items: center;
      gap: 14px;
      position: relative;
    }

    .business-pill {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 14px 6px 6px;
      border-radius: 999px;
      background: var(--vamo-surface);
      border: 1px solid var(--vamo-border);
      box-shadow: var(--vamo-shadow-sm);
      cursor: pointer;
      transition: all 0.15s ease;
      user-select: none;
    }

    .business-pill:hover {
      background: var(--vamo-surface-subtle);
      border-color: var(--vamo-border-hover);
    }

    .business-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      overflow: hidden;
      background: var(--vamo-surface-subtle);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .business-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .business-avatar-text {
      background: var(--vamo-gradient-brand);
      color: #ffffff;
      font-weight: 700;
      font-size: 0.85rem;
    }

    .business-meta {
      display: flex;
      flex-direction: column;
      line-height: 1.2;
    }

    .business-name {
      font-size: 0.88rem;
      font-weight: 700;
      color: var(--vamo-text);
      max-width: 180px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .business-status {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 0.7rem;
      color: var(--vamo-status-published);
      font-weight: 600;
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--vamo-status-published);
      display: inline-block;
    }

    .chevron-icon {
      color: var(--vamo-text-muted);
      transition: transform 0.2s ease;
    }

    .chevron-icon.rotated {
      transform: rotate(180deg);
    }

    .dropdown-menu {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      width: 230px;
      background: var(--vamo-surface);
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-md);
      box-shadow: var(--vamo-shadow-md);
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      animation: fadeInDown 0.15s ease-out;
      z-index: 50;
    }

    @keyframes fadeInDown {
      from { opacity: 0; transform: translateY(-6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .dropdown-header {
      padding: 10px 12px;
    }

    .dropdown-user-name {
      font-size: 0.88rem;
      font-weight: 700;
      color: var(--vamo-text);
    }

    .dropdown-user-email {
      font-size: 0.76rem;
      color: var(--vamo-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .dropdown-divider {
      height: 1px;
      background: var(--vamo-border);
      margin: 4px 0;
    }

    .dropdown-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border-radius: 6px;
      color: var(--vamo-text);
      text-decoration: none;
      font-size: 0.84rem;
      font-weight: 500;
      cursor: pointer;
      background: transparent;
      border: none;
      width: 100%;
      text-align: left;
      font-family: inherit;
      transition: all 0.12s ease;
    }

    .dropdown-item:hover {
      background: var(--vamo-surface-subtle);
      color: var(--vamo-primary);
    }

    .dropdown-item-danger:hover {
      background: rgba(239, 68, 68, 0.08);
      color: #ef4444;
    }

    @media (max-width: 1023px) {
      .topbar {
        padding: 0 16px;
      }
      .hamburger-btn {
        display: block;
      }
      .page-title {
        font-size: 1.1rem;
      }
      .topbar-right {
        gap: 8px;
      }
      .business-meta {
        display: none;
      }
      .business-pill {
        padding: 4px;
      }
    }
  `],
})
export class TopbarComponent {
  authService = inject(AuthService);
  businessService = inject(BusinessService);

  @Input() pageTitle = 'Overview';
  @Output() toggleSidebar = new EventEmitter<void>();

  dropdownOpen = false;

  toggleDropdown(): void {
    this.dropdownOpen = !this.dropdownOpen;
  }

  getBusinessLogoUrl(user: any): string | null {
    const logo = user?.provider_link?.logo;
    if (!logo) return null;
    return this.businessService.getAssetUrl(logo, 'width=72&height=72&fit=cover');
  }

  getBusinessInitials(user: any): string {
    const name = user?.provider_link?.name || user?.first_name || 'VAMO';
    return name.slice(0, 2).toUpperCase();
  }

  signOut(): void {
    this.dropdownOpen = false;
    this.authService.logout();
  }
}
