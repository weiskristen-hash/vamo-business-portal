import { Component, HostListener, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs/operators';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { TopbarComponent } from '../topbar/topbar.component';
import { AuthService } from '../../core/services/auth.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterModule, SidebarComponent, TopbarComponent, TranslatePipe],
  template: `
    <div class="shell-container">
      <!-- Desktop Permanent / Mobile Drawer Sidebar -->
      <app-sidebar
        class="shell-sidebar"
        [class.mobile-open]="mobileNavOpen"
        [mobileOpen]="mobileNavOpen"
        (close)="closeMobileNav()"
      ></app-sidebar>

      <!-- Mobile Backdrop -->
      <div
        class="sidebar-backdrop"
        *ngIf="mobileNavOpen"
        (click)="closeMobileNav()"
        aria-hidden="true"
      ></div>

      <!-- Main Application Layout -->
      <div class="shell-main">
        <app-topbar
          [pageTitle]="pageTitle"
          (toggleSidebar)="toggleMobileNav()"
        ></app-topbar>

        <main class="shell-content" role="main">
          <div class="content-wrapper">
            <router-outlet></router-outlet>
          </div>
        </main>
      </div>

      <!-- Predictable Session Expiry Warning Modal -->
      <div
        class="session-warning-backdrop"
        *ngIf="authService.sessionExpiring$ | async"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-warning-title"
      >
        <div class="session-warning-modal">
          <div class="session-warning-icon">⏳</div>
          <h2 id="session-warning-title" class="session-warning-title">
            {{ 'PORTAL.SHELL.SESSION_EXPIRING_TITLE' | translate }}
          </h2>
          <p class="session-warning-msg">
            {{ 'PORTAL.SHELL.SESSION_EXPIRING_MSG' | translate }}
          </p>
          <div class="session-warning-actions">
            <button
              type="button"
              class="btn btn-secondary"
              (click)="onSignOutSession()"
            >
              {{ 'PORTAL.SHELL.SIGN_OUT_BTN' | translate }}
            </button>
            <button
              type="button"
              class="btn btn-primary"
              (click)="onStaySignedIn()"
            >
              {{ 'PORTAL.SHELL.STAY_SIGNED_IN' | translate }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100vh;
      overflow: hidden;
    }

    .shell-container {
      display: flex;
      height: 100vh;
      width: 100vw;
      background: var(--vamo-bg-base);
      overflow: hidden;
    }

    .shell-sidebar {
      width: var(--vamo-sidebar-width);
      height: 100vh;
      flex-shrink: 0;
      z-index: 30;
    }

    .shell-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
      min-width: 0;
    }

    .shell-content {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 32px 36px 48px;
    }

    .content-wrapper {
      max-width: 1400px;
      margin: 0 auto;
      width: 100%;
    }

    .sidebar-backdrop {
      display: none;
    }

    @media (max-width: 1023px) {
      .shell-sidebar {
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        transform: translateX(-100%);
        transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
        box-shadow: none;
      }

      .shell-sidebar.mobile-open {
        transform: translateX(0);
        box-shadow: 8px 0 32px rgba(0, 0, 0, 0.6);
      }

      .sidebar-backdrop {
        display: block;
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.65);
        backdrop-filter: blur(2px);
        z-index: 25;
      }

      .shell-content {
        padding: 20px 16px 36px;
      }
    }

    .session-warning-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .session-warning-modal {
      background: var(--vamo-surface, #ffffff);
      border: 1px solid var(--vamo-border, #e2e8f0);
      border-radius: 16px;
      padding: 32px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1);
    }

    .session-warning-icon {
      font-size: 2.5rem;
      margin-bottom: 16px;
    }

    .session-warning-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--vamo-text, #0f172a);
      margin: 0 0 8px;
    }

    .session-warning-msg {
      font-size: 0.95rem;
      color: var(--vamo-text-muted, #64748b);
      line-height: 1.5;
      margin: 0 0 24px;
    }

    .session-warning-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
    }

    .session-warning-actions .btn {
      flex: 1;
      padding: 10px 16px;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
    }
  `],
})
export class ShellComponent implements OnInit {
  private router = inject(Router);
  authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  mobileNavOpen = false;
  pageTitle = 'PORTAL.SHELL.NAV_OVERVIEW';

  ngOnInit(): void {
    this.updatePageTitle(this.router.url);

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.updatePageTitle(event.urlAfterRedirects);
        this.mobileNavOpen = false;
        this.cdr.markForCheck();
      });
  }

  toggleMobileNav(): void {
    this.mobileNavOpen = !this.mobileNavOpen;
    this.cdr.markForCheck();
  }

  closeMobileNav(): void {
    this.mobileNavOpen = false;
    this.cdr.markForCheck();
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    if (this.mobileNavOpen) {
      this.closeMobileNav();
    }
  }

  async onStaySignedIn(): Promise<void> {
    await this.authService.staySignedIn();
    this.cdr.markForCheck();
  }

  async onSignOutSession(): Promise<void> {
    await this.authService.logout();
  }

  private updatePageTitle(url: string): void {
    const cleanUrl = url.split('?')[0];
    if (cleanUrl.includes('/app/overview')) this.pageTitle = 'PORTAL.SHELL.NAV_OVERVIEW';
    else if (cleanUrl.includes('/app/business')) this.pageTitle = 'PORTAL.SHELL.NAV_PROFILE';
    else if (cleanUrl.includes('/app/listings/create') || cleanUrl.includes('/app/create')) this.pageTitle = 'PORTAL.SHELL.NAV_CREATE_LISTING';
    else if (cleanUrl.includes('/app/listings/edit')) this.pageTitle = 'PORTAL.SHELL.TITLE_EDIT_LISTING';
    else if (cleanUrl.includes('/app/listings') || cleanUrl.includes('/app/posts')) this.pageTitle = 'PORTAL.SHELL.NAV_LISTINGS';
    else if (cleanUrl.includes('/app/promotions')) this.pageTitle = 'PORTAL.SHELL.NAV_PROMOTIONS';
    else if (cleanUrl.includes('/app/insights')) this.pageTitle = 'PORTAL.SHELL.NAV_INSIGHTS';
    else if (cleanUrl.includes('/app/billing')) this.pageTitle = 'PORTAL.SHELL.NAV_BILLING';
    else if (cleanUrl.includes('/app/settings')) this.pageTitle = 'PORTAL.SHELL.NAV_SETTINGS';
    else this.pageTitle = 'PORTAL.SHELL.TITLE_DEFAULT';
    this.cdr.markForCheck();
  }
}
