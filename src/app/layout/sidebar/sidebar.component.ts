import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BusinessService } from '../../core/services/business.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

interface NavItem {
  labelKey: string;
  route: string;
  icon: string;
  badge?: string;
  isAction?: boolean;
}

interface NavSection {
  titleKey: string;
  items: NavItem[];
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe],
  template: `
    <aside class="sidebar" [class.mobile-open]="mobileOpen" role="navigation" [attr.aria-label]="'PORTAL.SHELL.MAIN_NAV' | translate">
      <!-- Brand Header -->
      <div class="sidebar-header">
        <a routerLink="/app/overview" class="brand-link" (click)="closeNav()">
          <img src="/assets/vamo-logo.png" alt="VAMO" class="brand-logo" onerror="this.style.display='none'" />
          <div class="brand-text">
            <span class="brand-name">VAMO</span>
            <span class="brand-tag">BUSINESS</span>
          </div>
        </a>
        <button
          type="button"
          class="mobile-close-btn"
          (click)="closeNav()"
          [attr.aria-label]="'PORTAL.SHELL.CLOSE_MENU' | translate"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <!-- Navigation Sections -->
      <nav class="sidebar-nav">
        <div *ngFor="let section of navSections" class="nav-section">
          <div class="section-title">{{ section.titleKey | translate }}</div>
          <ul class="nav-list">
            <li *ngFor="let item of section.items">
              <a
                [routerLink]="item.route"
                routerLinkActive="active"
                [routerLinkActiveOptions]="{ exact: item.route === '/app/overview' }"
                (click)="closeNav()"
                class="nav-link"
                [class.action-link]="item.isAction"
              >
                <!-- Render Icon -->
                <span class="nav-icon" [innerHTML]="item.icon"></span>
                <span class="nav-label">{{ item.labelKey | translate }}</span>
                <span *ngIf="item.badge" class="nav-badge">{{ item.badge }}</span>
              </a>
            </li>
          </ul>
        </div>
      </nav>

      <!-- Bottom User / Logout Section -->
      <div class="sidebar-footer">
        <div class="user-info" *ngIf="authService.currentUser as user">
          <div class="user-avatar">
            {{ getInitials(user) }}
          </div>
          <div class="user-meta">
            <div class="user-name">{{ user.first_name || ('PORTAL.SHELL.DEFAULT_USER_NAME' | translate) }} {{ user.last_name || '' }}</div>
            <div class="user-role">{{ user.provider_link?.name || user.email }}</div>
          </div>
        </div>

        <button
          type="button"
          class="signout-btn"
          (click)="onSignOut()"
          [attr.aria-label]="'PORTAL.SHELL.SIGN_OUT_ARIA' | translate"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          <span>{{ 'PORTAL.SHELL.SIGN_OUT' | translate }}</span>
        </button>
      </div>
    </aside>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
    }

    .sidebar {
      display: flex;
      flex-direction: column;
      width: var(--vamo-sidebar-width);
      height: 100%;
      background: var(--vamo-bg-secondary);
      border-right: 1px solid var(--vamo-border-glass);
      user-select: none;
      transition: transform 0.25s ease-in-out;
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: var(--vamo-topbar-height);
      padding: 0 20px;
      border-bottom: 1px solid var(--vamo-border-glass);
    }

    .brand-link {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: inherit;
    }

    .brand-logo {
      height: 32px;
      width: auto;
      object-fit: contain;
    }

    .brand-text {
      display: flex;
      flex-direction: column;
      line-height: 1.1;
    }

    .brand-name {
      font-size: 1.15rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #ffffff;
    }

    .brand-tag {
      font-size: 0.68rem;
      font-weight: 700;
      color: var(--vamo-pink);
      letter-spacing: 0.12em;
    }

    .mobile-close-btn {
      display: none;
      background: transparent;
      border: none;
      color: var(--vamo-text-muted);
      cursor: pointer;
      padding: 6px;
      border-radius: 6px;
    }

    .mobile-close-btn:hover {
      color: #ffffff;
      background: var(--vamo-bg-glass);
    }

    .sidebar-nav {
      flex: 1;
      overflow-y: auto;
      padding: 16px 12px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .nav-section {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .section-title {
      font-size: 0.7rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--vamo-text-dim);
      padding: 4px 12px 6px;
    }

    .nav-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .nav-link {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 9px 12px;
      border-radius: 8px;
      color: var(--vamo-text-secondary);
      text-decoration: none;
      font-weight: 500;
      font-size: 0.88rem;
      transition: all 0.15s ease;
    }

    .nav-link:hover {
      background: var(--vamo-bg-glass);
      color: #ffffff;
    }

    .nav-link.active {
      background: rgba(124, 58, 237, 0.18);
      color: #ffffff;
      font-weight: 600;
      border: 1px solid rgba(124, 58, 237, 0.4);
    }

    .nav-link.active .nav-icon {
      color: var(--vamo-accent);
    }

    .nav-link.action-link {
      background: rgba(254, 57, 127, 0.08);
      color: #ff75a6;
      border: 1px dashed rgba(254, 57, 127, 0.3);
    }

    .nav-link.action-link:hover {
      background: rgba(254, 57, 127, 0.16);
      color: #ffffff;
      border-style: solid;
    }

    .nav-link.action-link.active {
      background: var(--vamo-gradient-accent);
      color: #ffffff;
      border: none;
      box-shadow: 0 4px 12px rgba(254, 57, 127, 0.35);
    }

    .nav-link.action-link.active .nav-icon {
      color: #ffffff;
    }

    .nav-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      color: var(--vamo-text-muted);
      transition: color 0.15s ease;
    }

    .nav-label {
      flex: 1;
    }

    .nav-badge {
      font-size: 0.65rem;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 999px;
      background: var(--vamo-bg-glass-strong);
      color: var(--vamo-text-muted);
    }

    .sidebar-footer {
      padding: 16px;
      border-top: 1px solid var(--vamo-border-glass);
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: rgba(0, 0, 0, 0.15);
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .user-avatar {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      background: var(--vamo-gradient-accent);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.8rem;
      font-weight: 700;
    }

    .user-meta {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .user-name {
      font-size: 0.84rem;
      font-weight: 600;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .user-role {
      font-size: 0.72rem;
      color: var(--vamo-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .signout-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 8px 12px;
      background: transparent;
      border: 1px solid var(--vamo-border-glass);
      border-radius: 6px;
      color: var(--vamo-text-muted);
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.15s ease;
    }

    .signout-btn:hover {
      background: rgba(239, 68, 68, 0.1);
      border-color: rgba(239, 68, 68, 0.3);
      color: #ef4444;
    }

    @media (max-width: 1023px) {
      .mobile-close-btn {
        display: block;
      }
    }
  `],
})
export class SidebarComponent {
  authService = inject(AuthService);
  businessService = inject(BusinessService);

  @Input() mobileOpen = false;
  @Output() close = new EventEmitter<void>();

  navSections: NavSection[] = [
    {
      titleKey: 'PORTAL.SHELL.SECTION_OVERVIEW',
      items: [
        {
          labelKey: 'PORTAL.SHELL.NAV_OVERVIEW',
          route: '/app/overview',
          icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`,
        },
      ],
    },
    {
      titleKey: 'PORTAL.SHELL.SECTION_MANAGE',
      items: [
        {
          labelKey: 'PORTAL.SHELL.NAV_PROFILE',
          route: '/app/business',
          icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`,
        },
        {
          labelKey: 'PORTAL.SHELL.NAV_LISTINGS',
          route: '/app/listings',
          icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,
        },
        {
          labelKey: 'PORTAL.SHELL.NAV_CREATE_LISTING',
          route: '/app/listings/create',
          icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>`,
          isAction: true,
        },
      ],
    },
    {
      titleKey: 'PORTAL.SHELL.SECTION_GROW',
      items: [
        {
          labelKey: 'PORTAL.SHELL.NAV_PROMOTIONS',
          route: '/app/promotions',
          icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
        },
        {
          labelKey: 'PORTAL.SHELL.NAV_INSIGHTS',
          route: '/app/insights',
          icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>`,
        },
      ],
    },
    {
      titleKey: 'PORTAL.SHELL.SECTION_ACCOUNT',
      items: [
        {
          labelKey: 'PORTAL.SHELL.NAV_BILLING',
          route: '/app/billing',
          icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>`,
        },
        {
          labelKey: 'PORTAL.SHELL.NAV_SETTINGS',
          route: '/app/settings',
          icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
        },
      ],
    },
  ];

  closeNav(): void {
    this.close.emit();
  }

  onSignOut(): void {
    this.closeNav();
    this.authService.logout();
  }

  getInitials(user: any): string {
    const first = (user?.first_name || '').trim();
    const last = (user?.last_name || '').trim();
    if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
    if (first) return first.slice(0, 2).toUpperCase();
    if (user?.provider_link?.name) return user.provider_link.name.slice(0, 2).toUpperCase();
    return 'VB';
  }
}
