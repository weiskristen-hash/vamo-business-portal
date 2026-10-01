import { Component, HostListener, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs/operators';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { TopbarComponent } from '../topbar/topbar.component';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterModule, SidebarComponent, TopbarComponent],
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
  `],
})
export class ShellComponent implements OnInit {
  private router = inject(Router);
  authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  mobileNavOpen = false;
  pageTitle = 'Overview';

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

  private updatePageTitle(url: string): void {
    const cleanUrl = url.split('?')[0];
    if (cleanUrl.includes('/app/overview')) this.pageTitle = 'Overview';
    else if (cleanUrl.includes('/app/business')) this.pageTitle = 'My Business';
    else if (cleanUrl.includes('/app/posts')) this.pageTitle = 'My Posts';
    else if (cleanUrl.includes('/app/create')) this.pageTitle = 'Create Post';
    else if (cleanUrl.includes('/app/promotions')) this.pageTitle = 'Promotions';
    else if (cleanUrl.includes('/app/insights')) this.pageTitle = 'Insights';
    else if (cleanUrl.includes('/app/billing')) this.pageTitle = 'Billing';
    else if (cleanUrl.includes('/app/settings')) this.pageTitle = 'Settings';
    else this.pageTitle = 'VAMO Business';
    this.cdr.markForCheck();
  }
}
