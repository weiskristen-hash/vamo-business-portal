import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';

interface ModuleConfig {
  title: string;
  phase: string;
  description: string;
  features: string[];
}

@Component({
  selector: 'app-placeholder',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="placeholder-container">
      <div class="placeholder-header">
        <span class="phase-pill">{{ currentConfig.phase }}</span>
        <h1 class="module-title">{{ currentConfig.title }}</h1>
        <p class="module-desc">{{ currentConfig.description }}</p>
      </div>

      <div class="module-preview-card card">
        <div class="preview-badge">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <span>Under Active Development</span>
        </div>

        <h3 class="preview-heading">Planned capabilities for this module:</h3>
        <ul class="feature-list">
          <li *ngFor="let feat of currentConfig.features" class="feature-item">
            <span class="bullet">✓</span>
            <span>{{ feat }}</span>
          </li>
        </ul>

        <div class="preview-actions">
          <a routerLink="/app/overview" class="btn btn-secondary">
            ← Return to Overview
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
    business: {
      title: 'My Business Profile',
      phase: 'Phase 1B Roadmap',
      description: 'Manage your verified business identity, locations, contact info, and opening hours across the VAMO discovery network.',
      features: [
        'Profile details editing (name, description, category, offerings)',
        'Operating hours & weekly schedule manager',
        'Logo and photo gallery image management',
        'Social media & WhatsApp direct booking links',
        'Location pinning and GPS coordinates',
      ],
    },
    posts: {
      title: 'Post & Event Management',
      phase: 'Phase 1B Roadmap',
      description: 'Review, manage, filter, and schedule your business events and happenings.',
      features: [
        'Comprehensive post table with status filtering (published, draft, archived)',
        'Rich preview of active listings with image previews',
        'Quick actions: pause, duplicate, or archive existing posts',
        'Recurring event schedule viewer',
      ],
    },
    create: {
      title: 'Create Post',
      phase: 'Phase 1B Roadmap',
      description: 'Create engaging single and recurring events that broadcast directly to tourists and locals on the VAMO mobile app.',
      features: [
        'High-resolution promotional banner upload & image cropper',
        'Date & time pickers with single and recurring cadence rules',
        'Multi-area targeting across Las Terrenas, Samaná, and the Dominican Republic',
        'Draft saving and live preview',
      ],
    },
    promotions: {
      title: 'VAMO Promotions & Placements',
      phase: 'Phase 1C Roadmap',
      description: 'Supercharge your visibility with premium home feed banners and What’s Hot placements.',
      features: [
        'Top of Discovery: Main Banner promotion placement',
        'Trending Tonight: What’s Hot highlight slots',
        'Transparent impression and tap performance metrics',
        'Stripe billing integration for automated campaign checkouts',
      ],
    },
    insights: {
      title: 'Audience & Performance Insights',
      phase: 'Phase 1C Roadmap',
      description: 'Deep analytics tracking impressions, profile views, event bookmarks, and customer engagement over time.',
      features: [
        'Interactive timeline charts for daily impressions and profile visits',
        'Bookmark growth metrics and audience retention analytics',
        'Geographic visitor breakdown by province and traveler origin',
        'Exportable CSV and PDF performance summaries',
      ],
    },
    billing: {
      title: 'Subscription & Invoices',
      phase: 'Phase 1C Roadmap',
      description: 'Manage your VAMO Business tier subscription, payment methods, and historical invoices.',
      features: [
        'Current subscription tier details (Starter, Basic, Advanced)',
        'Seamless Stripe Customer Portal self-service',
        'Downloadable tax invoices and billing receipts',
        'Plan upgrade and renewal preferences',
      ],
    },
    settings: {
      title: 'Account Settings',
      phase: 'Phase 1B Roadmap',
      description: 'Manage your user credentials, notification preferences, and team collaborator permissions.',
      features: [
        'User profile editing (first name, last name, email)',
        'Security: Password update and session management',
        'Operational email notification alerts',
        'Future team member accounts and role delegation',
      ],
    },
  };

  currentConfig: ModuleConfig = {
    title: 'Future Module',
    phase: 'Phase 1B Roadmap',
    description: 'This feature is part of upcoming development phases.',
    features: ['Desktop optimization', 'Seamless data integration'],
  };

  ngOnInit(): void {
    const moduleKey = this.route.snapshot.data['module'] || 'business';
    if (this.moduleMap[moduleKey]) {
      this.currentConfig = this.moduleMap[moduleKey];
    }
  }
}
