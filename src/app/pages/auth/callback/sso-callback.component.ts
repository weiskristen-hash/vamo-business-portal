import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-sso-callback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="callback-container">
      <div class="callback-card">
        <div class="spinner"></div>
        <h2>Authenticating with VAMO…</h2>
        <p>Restoring your business session, please wait.</p>
      </div>
    </div>
  `,
  styles: [`
    .callback-container {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--vamo-bg-base);
    }
    .callback-card {
      text-align: center;
      background: var(--vamo-bg-card);
      border: 1px solid var(--vamo-border-glass);
      border-radius: 14px;
      padding: 36px 48px;
      color: #ffffff;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid rgba(255, 255, 255, 0.2);
      border-radius: 50%;
      border-top-color: var(--vamo-pink);
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `],
})
export class SsoCallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);

  async ngOnInit(): Promise<void> {
    const params = this.route.snapshot.queryParams;
    const error = params['error'];

    if (error) {
      await this.router.navigate(['/login'], { queryParams: { error } });
      return;
    }

    // Attempt session restore
    const user = await this.authService.restoreSession();
    if (user && user.provider_link) {
      await this.router.navigate(['/app/overview']);
    } else if (user) {
      await this.router.navigate(['/no-business']);
    } else {
      await this.router.navigate(['/login']);
    }
  }
}
