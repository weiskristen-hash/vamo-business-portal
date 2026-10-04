import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { I18nService } from '../../core/i18n/i18n.service';

interface ModuleConfig {
  titleKey: string;
  phaseKey: string;
  descriptionKey: string;
  featureKeys: string[];
}

@Component({
  selector: 'app-placeholder',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe],
  template: `
    <div class="placeholder-container">
      <div class="placeholder-header">
        <span class="phase-pill">{{ currentConfig().phaseKey | translate }}</span>
        <h1 class="module-title">{{ currentConfig().titleKey | translate }}</h1>
        <p class="module-desc">{{ currentConfig().descriptionKey | translate }}</p>
      </div>

      <div class="module-preview-card card">
        <div class="preview-badge">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <span>{{ 'PORTAL.PLACEHOLDER.BADGE_DEVELOPMENT' | translate }}</span>
        </div>

        <h3 class="preview-heading">{{ 'PORTAL.PLACEHOLDER.PLANNED_CAPABILITIES' | translate }}</h3>
        <ul class="feature-list">
          <li *ngFor="let featKey of currentConfig().featureKeys" class="feature-item">
            <span class="bullet">✓</span>
            <span>{{ featKey | translate }}</span>
          </li>
        </ul>

        <div class="preview-actions">
          <a routerLink="/app/overview" class="btn btn-secondary">
            {{ 'PORTAL.PLACEHOLDER.RETURN_OVERVIEW' | translate }}
          </a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .placeholder-container {
      display: flex;
      flex-direction: column;
      gap: 28px;
      max-width: 900px;
    }

    .placeholder-header {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .phase-pill {
      display: inline-block;
      width: fit-content;
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--vamo-pink);
      background: var(--vamo-pink-light);
      border: 1px solid var(--vamo-pink-border);
      padding: 3px 10px;
      border-radius: 999px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .module-title {
      font-size: 1.8rem;
      font-weight: 800;
      color: var(--vamo-text);
      letter-spacing: -0.02em;
    }

    .module-desc {
      font-size: 1rem;
      color: var(--vamo-text-muted);
      line-height: 1.5;
    }

    .module-preview-card {
      background: var(--vamo-surface);
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-md);
      box-shadow: var(--vamo-shadow-sm);
      padding: 32px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .preview-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      width: fit-content;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--vamo-primary);
      background: rgba(124, 58, 237, 0.1);
      border: 1px solid rgba(124, 58, 237, 0.25);
      padding: 4px 10px;
      border-radius: 6px;
    }

    .preview-heading {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--vamo-text);
    }

    .feature-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .feature-item {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 0.92rem;
      color: var(--vamo-text-muted);
    }

    .bullet {
      color: var(--vamo-primary);
      font-weight: 800;
      font-size: 0.95rem;
    }

    .preview-actions {
      margin-top: 10px;
    }
  `],
})
export class PlaceholderComponent implements OnInit {
  private route = inject(ActivatedRoute);

  moduleMap: Record<string, ModuleConfig> = {
    settings: {
      titleKey: 'PORTAL.PLACEHOLDER.SETTINGS.TITLE',
      phaseKey: 'PORTAL.PLACEHOLDER.SETTINGS.PHASE',
      descriptionKey: 'PORTAL.PLACEHOLDER.SETTINGS.DESC',
      featureKeys: [
        'PORTAL.PLACEHOLDER.SETTINGS.FEAT_PROFILE',
        'PORTAL.PLACEHOLDER.SETTINGS.FEAT_SECURITY',
        'PORTAL.PLACEHOLDER.SETTINGS.FEAT_NOTIFS',
        'PORTAL.PLACEHOLDER.SETTINGS.FEAT_TEAM',
      ],
    },
    promotions: {
      titleKey: 'PORTAL.PLACEHOLDER.PROMOTIONS.TITLE',
      phaseKey: 'PORTAL.PLACEHOLDER.PROMOTIONS.PHASE',
      descriptionKey: 'PORTAL.PLACEHOLDER.PROMOTIONS.DESC',
      featureKeys: [
        'PORTAL.PLACEHOLDER.PROMOTIONS.FEAT_MAIN_BANNER',
        'PORTAL.PLACEHOLDER.PROMOTIONS.FEAT_WHATS_HOT',
        'PORTAL.PLACEHOLDER.PROMOTIONS.FEAT_METRICS',
        'PORTAL.PLACEHOLDER.PROMOTIONS.FEAT_BILLING',
      ],
    },
    insights: {
      titleKey: 'PORTAL.PLACEHOLDER.INSIGHTS.TITLE',
      phaseKey: 'PORTAL.PLACEHOLDER.INSIGHTS.PHASE',
      descriptionKey: 'PORTAL.PLACEHOLDER.INSIGHTS.DESC',
      featureKeys: [
        'PORTAL.PLACEHOLDER.INSIGHTS.FEAT_TIMELINE',
        'PORTAL.PLACEHOLDER.INSIGHTS.FEAT_GROWTH',
        'PORTAL.PLACEHOLDER.INSIGHTS.FEAT_GEOGRAPHIC',
        'PORTAL.PLACEHOLDER.INSIGHTS.FEAT_EXPORTS',
      ],
    },
  };

  currentConfig = signal<ModuleConfig>({
    titleKey: 'PORTAL.PLACEHOLDER.FUTURE_MODULE',
    phaseKey: 'PORTAL.PLACEHOLDER.FUTURE_PHASE',
    descriptionKey: 'PORTAL.PLACEHOLDER.FUTURE_DESC',
    featureKeys: [
      'PORTAL.PLACEHOLDER.FUTURE_FEAT_DESKTOP',
      'PORTAL.PLACEHOLDER.FUTURE_FEAT_SEAMLESS',
    ],
  });

  ngOnInit(): void {
    const moduleKey = this.route.snapshot.data['module'] || 'settings';
    if (this.moduleMap[moduleKey]) {
      this.currentConfig.set(this.moduleMap[moduleKey]);
    }
  }
}
