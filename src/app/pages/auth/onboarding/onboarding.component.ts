import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { BusinessService } from '../../../core/services/business.service';
import { CustomerErrorService } from '../../../core/services/customer-error.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { LanguageSelectorComponent } from '../../../core/i18n/language-selector.component';
import { Area } from '../../../core/models/event.model';
import { GeoJsonPoint } from '../../../core/models/provider.model';
import { isValidPhone } from '../../../core/utils/phone';

export type OnboardingStep =
  | 'location-permission'
  | 'area'
  | 'intent'
  | 'browse-account'
  | 'business-pitch'
  | 'business-register'
  | 'business-details';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe, LanguageSelectorComponent],
  template: "<div class=\"onboarding-page\">\n  <div class=\"ob-container\">\n    <!-- Top Bar -->\n    <header class=\"ob-topbar\">\n      <div class=\"ob-topbar-left\">\n        <button\n          *ngIf=\"currentStep() !== 'location-permission'\"\n          type=\"button\"\n          class=\"ob-nav-btn ob-back-btn\"\n          (click)=\"goBack()\"\n          [attr.aria-label]=\"'COMMON.BACK' | translate\"\n        >\n          <svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n            <line x1=\"19\" y1=\"12\" x2=\"5\" y2=\"12\"></line>\n            <polyline points=\"12 19 5 12 12 5\"></polyline>\n          </svg>\n        </button>\n        <div class=\"ob-logo-wrap\">\n          <img src=\"/assets/vamo-logo.png\" alt=\"VAMO\" class=\"ob-logo\" onerror=\"this.style.display='none'\" />\n          <span class=\"ob-brand-text\">VAMO</span>\n        </div>\n      </div>\n\n      <div class=\"ob-progress\">\n        <span\n          *ngFor=\"let dot of progressDots; let i = index\"\n          class=\"ob-dot\"\n          [class.ob-dot--active]=\"dot.active\"\n        ></span>\n      </div>\n\n      <div class=\"ob-topbar-right\">\n        <app-language-selector></app-language-selector>\n        <button\n          type=\"button\"\n          class=\"ob-nav-btn ob-close-btn\"\n          (click)=\"cancelOnboarding()\"\n          [attr.aria-label]=\"'COMMON.CANCEL' | translate\"\n        >\n          <svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n            <line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"></line>\n            <line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"></line>\n          </svg>\n        </button>\n      </div>\n    </header>\n\n    <!-- Error Banner -->\n    <div *ngIf=\"errorMessage()\" class=\"ob-alert ob-alert-error\" role=\"alert\">\n      <svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n        <circle cx=\"12\" cy=\"12\" r=\"10\"></circle>\n        <line x1=\"12\" y1=\"8\" x2=\"12\" y2=\"12\"></line>\n        <line x1=\"12\" y1=\"16\" x2=\"12.01\" y2=\"16\"></line>\n      </svg>\n      <span>{{ errorMessage() }}</span>\n    </div>\n\n    <!-- Duplicate Email Notice -->\n    <div *ngIf=\"emailTaken()\" class=\"ob-alert ob-alert-warning\" role=\"alert\">\n      <svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n        <path d=\"M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z\"></path>\n        <line x1=\"12\" y1=\"9\" x2=\"12\" y2=\"13\"></line>\n        <line x1=\"12\" y1=\"17\" x2=\"12.01\" y2=\"17\"></line>\n      </svg>\n      <div class=\"warning-text\">\n        <span>{{ 'ONBOARDING.ERROR_EMAIL_TAKEN' | translate }}</span>\n        <a routerLink=\"/login\" class=\"warning-link\">{{ 'ONBOARDING.ERROR_EMAIL_TAKEN_LOGIN' | translate }} &rarr;</a>\n      </div>\n    </div>\n\n    <!-- STEP 0: LOCATION PERMISSION -->\n    <section *ngIf=\"currentStep() === 'location-permission'\" class=\"ob-step ob-step--location\">\n      <div class=\"ob-location-visual\">\n        <div class=\"ob-location-ring ob-location-ring--outer\"></div>\n        <div class=\"ob-location-ring ob-location-ring--inner\"></div>\n        <div class=\"ob-location-pin\">\n          <svg width=\"32\" height=\"32\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n            <path d=\"M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z\"></path>\n            <circle cx=\"12\" cy=\"10\" r=\"3\"></circle>\n          </svg>\n        </div>\n      </div>\n\n      <div class=\"ob-header ob-header--center\">\n        <h1 class=\"ob-title\">{{ 'ONBOARDING.LOCATION_TITLE' | translate }}</h1>\n        <p class=\"ob-subtitle\">{{ 'ONBOARDING.LOCATION_SUB' | translate }}</p>\n      </div>\n\n      <div class=\"ob-benefits\">\n        <div class=\"ob-benefit-row\">\n          <div class=\"benefit-icon-wrap\" aria-hidden=\"true\">\n            <svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n              <polygon points=\"13 2 3 14 12 14 11 22 21 10 12 10 13 2\"></polygon>\n            </svg>\n          </div>\n          <span>{{ 'ONBOARDING.LOCATION_BENEFIT_1' | translate }}</span>\n        </div>\n        <div class=\"ob-benefit-row\">\n          <div class=\"benefit-icon-wrap\" aria-hidden=\"true\">\n            <svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n              <polygon points=\"1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6\"></polygon>\n              <line x1=\"8\" y1=\"2\" x2=\"8\" y2=\"18\"></line>\n              <line x1=\"16\" y1=\"6\" x2=\"16\" y2=\"22\"></line>\n            </svg>\n          </div>\n          <span>{{ 'ONBOARDING.LOCATION_BENEFIT_2' | translate }}</span>\n        </div>\n        <div class=\"ob-benefit-row\">\n          <div class=\"benefit-icon-wrap\" aria-hidden=\"true\">\n            <svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n              <path d=\"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z\"></path>\n            </svg>\n          </div>\n          <span>{{ 'ONBOARDING.LOCATION_BENEFIT_3' | translate }}</span>\n        </div>\n      </div>\n\n      <div class=\"ob-footer ob-footer--stack\">\n        <button\n          type=\"button\"\n          class=\"btn btn-primary ob-btn-full\"\n          [disabled]=\"locationLoading()\"\n          (click)=\"requestLocation()\"\n        >\n          <span *ngIf=\"!locationLoading()\">{{ 'ONBOARDING.CONTINUE' | translate }}</span>\n          <span *ngIf=\"locationLoading()\" class=\"spinner-row\">\n            <span class=\"spinner\"></span>\n            <span>{{ 'PORTAL.ONBOARDING.DETECTING_LOCATION' | translate }}</span>\n          </span>\n        </button>\n\n        <button type=\"button\" class=\"btn btn-ghost ob-skip-btn\" (click)=\"skipLocation()\">\n          {{ 'ONBOARDING.LOCATION_SKIP' | translate }}\n        </button>\n\n        <div class=\"ob-login-link-wrap\">\n          <span class=\"ob-login-text\">{{ 'ONBOARDING.ALREADY_HAVE_ACCOUNT' | translate }}</span>\n          <a routerLink=\"/login\" class=\"ob-login-link\">{{ 'ONBOARDING.LOGIN' | translate }}</a>\n        </div>\n      </div>\n    </section>\n\n    <!-- STEP 1: AREA SELECTION -->\n    <section *ngIf=\"currentStep() === 'area'\" class=\"ob-step ob-step--area\">\n      <div class=\"ob-header\">\n        <h1 class=\"ob-title\">{{ 'ONBOARDING.AREA_TITLE' | translate }}</h1>\n        <p class=\"ob-subtitle\">{{ 'ONBOARDING.AREA_SUBTITLE' | translate }}</p>\n      </div>\n\n      <div *ngIf=\"nearestArea()\" class=\"ob-banner ob-banner--found\">\n        <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n          <path d=\"M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z\"></path>\n          <circle cx=\"12\" cy=\"10\" r=\"3\"></circle>\n        </svg>\n        <span>{{ 'ONBOARDING.AREA_DETECTED' | translate: { area: nearestArea()!.name } }}</span>\n      </div>\n\n      <div *ngIf=\"notInDR()\" class=\"ob-banner ob-banner--outside\">\n        <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n          <circle cx=\"12\" cy=\"12\" r=\"10\"></circle>\n          <line x1=\"2\" y1=\"12\" x2=\"22\" y2=\"12\"></line>\n          <path d=\"M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z\"></path>\n        </svg>\n        <span>{{ 'ONBOARDING.AREA_NOT_IN_DR' | translate }}</span>\n      </div>\n\n      <div *ngIf=\"areasLoading()\" class=\"ob-loading-state\">\n        <span class=\"spinner\"></span>\n        <span>{{ 'PORTAL.ONBOARDING.LOADING_REGIONS' | translate }}</span>\n      </div>\n\n      <div *ngIf=\"!areasLoading()\" class=\"ob-area-grid\">\n        <button\n          *ngFor=\"let area of areas()\"\n          type=\"button\"\n          class=\"ob-area-card\"\n          [class.ob-area-card--selected]=\"selectedArea()?.id === area.id\"\n          (click)=\"selectArea(area)\"\n        >\n          <span class=\"ob-area-emoji\">{{ area.emoji }}</span>\n          <span class=\"ob-area-name\">{{ area.name }}</span>\n          <span *ngIf=\"selectedArea()?.id === area.id\" class=\"ob-area-check\">\n            <svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n              <polyline points=\"20 6 9 17 4 12\"></polyline>\n            </svg>\n          </span>\n        </button>\n      </div>\n\n      <div class=\"ob-footer\">\n        <button\n          type=\"button\"\n          class=\"btn btn-primary ob-btn-full\"\n          [disabled]=\"!selectedArea()\"\n          (click)=\"goToIntent()\"\n        >\n          {{ 'ONBOARDING.CONTINUE' | translate }}\n        </button>\n      </div>\n    </section>\n\n    <!-- STEP 2: INTENT SELECTION -->\n    <section *ngIf=\"currentStep() === 'intent'\" class=\"ob-step ob-step--intent\">\n      <div class=\"ob-header\">\n        <h1 class=\"ob-title\">{{ 'ONBOARDING.INTENT_TITLE' | translate }}</h1>\n      </div>\n\n      <div class=\"ob-intent-cards\">\n        <button type=\"button\" class=\"ob-intent-card\" (click)=\"selectIntent('browse')\">\n          <div class=\"ob-intent-icon ob-intent-icon--browse\">\n            <svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n              <path d=\"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z\"></path>\n              <circle cx=\"12\" cy=\"12\" r=\"3\"></circle>\n            </svg>\n          </div>\n          <div class=\"ob-intent-text\">\n            <strong>{{ 'ONBOARDING.INTENT_BROWSE_TITLE' | translate }}</strong>\n            <span>{{ 'ONBOARDING.INTENT_BROWSE_SUB' | translate }}</span>\n          </div>\n          <span class=\"ob-intent-arrow\">\n            <svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n              <line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"></line>\n              <polyline points=\"12 5 19 12 12 19\"></polyline>\n            </svg>\n          </span>\n        </button>\n\n        <button type=\"button\" class=\"ob-intent-card\" (click)=\"selectIntent('business')\">\n          <div class=\"ob-intent-icon ob-intent-icon--business\">\n            <svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n              <rect x=\"2\" y=\"7\" width=\"20\" height=\"14\" rx=\"2\" ry=\"2\"></rect>\n              <path d=\"M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16\"></path>\n            </svg>\n          </div>\n          <div class=\"ob-intent-text\">\n            <strong>{{ 'ONBOARDING.INTENT_BUSINESS_TITLE' | translate }}</strong>\n            <span>{{ 'ONBOARDING.INTENT_BUSINESS_SUB' | translate }}</span>\n          </div>\n          <span class=\"ob-intent-arrow\">\n            <svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n              <line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"></line>\n              <polyline points=\"12 5 19 12 12 19\"></polyline>\n            </svg>\n          </span>\n        </button>\n      </div>\n    </section>\n\n    <!-- STEP 3a: BROWSE ACCOUNT CREATION -->\n    <section *ngIf=\"currentStep() === 'browse-account'\" class=\"ob-step ob-step--form\">\n      <div class=\"ob-header\">\n        <h1 class=\"ob-title\">{{ 'ONBOARDING.BROWSE_ACCOUNT_TITLE' | translate }}</h1>\n        <p class=\"ob-subtitle\">{{ 'ONBOARDING.BROWSE_ACCOUNT_SUB' | translate }}</p>\n      </div>\n\n      <div class=\"ob-card\">\n        <ng-container *ngTemplateOutlet=\"userFormTpl\"></ng-container>\n\n        <div class=\"ob-footer ob-footer--stack\">\n          <button\n            type=\"button\"\n            class=\"btn btn-primary ob-btn-full\"\n            [disabled]=\"loading() || !isUserFormValid()\"\n            (click)=\"registerBrowseUser()\"\n          >\n            <span *ngIf=\"!loading()\">{{ 'ONBOARDING.CREATE_ACCOUNT' | translate }}</span>\n            <span *ngIf=\"loading()\" class=\"spinner-row\">\n              <span class=\"spinner\"></span>\n              <span>{{ 'PORTAL.ONBOARDING.CREATING_ACCOUNT' | translate }}</span>\n            </span>\n          </button>\n\n          <div class=\"ob-social-divider\"><span>{{ 'AUTH.OR_CONTINUE_WITH' | translate | uppercase }}</span></div>\n\n          <div class=\"ob-social-row\">\n            <button type=\"button\" class=\"btn btn-secondary ob-social-btn\" [disabled]=\"loading()\" (click)=\"onGoogleSignUp()\">\n              <svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\">\n                <path fill=\"#4285F4\" d=\"M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z\"/>\n                <path fill=\"#34A853\" d=\"M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z\"/>\n                <path fill=\"#FBBC05\" d=\"M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z\"/>\n                <path fill=\"#EA4335\" d=\"M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z\"/>\n              </svg>\n              <span>{{ 'AUTH.LOGIN_GOOGLE' | translate }}</span>\n            </button>\n          </div>\n\n          <div class=\"ob-login-link-wrap\">\n            <span class=\"ob-login-text\">{{ 'ONBOARDING.ALREADY_HAVE_ACCOUNT' | translate }}</span>\n            <a routerLink=\"/login\" class=\"ob-login-link\">{{ 'ONBOARDING.LOGIN' | translate }}</a>\n          </div>\n        </div>\n      </div>\n    </section>\n\n    <!-- STEP 3b: BUSINESS PITCH (3 Slides) -->\n    <section *ngIf=\"currentStep() === 'business-pitch'\" class=\"ob-step ob-step--pitch\">\n      <!-- Slide 0 -->\n      <div *ngIf=\"pitchSlide() === 0\" class=\"pitch-slide\">\n        <div class=\"pitch-content\">\n          <span class=\"pitch-badge\">VAMO Business</span>\n          <h2 class=\"pitch-title\">\n            {{ 'ONBOARDING.PITCH_SLIDE1_TITLE' | translate }}<br>\n            <span class=\"pitch-highlight\">{{ 'ONBOARDING.PITCH_SLIDE1_TITLE_HIGHLIGHT' | translate }}</span>\n          </h2>\n          <p class=\"pitch-sub\">{{ 'ONBOARDING.PITCH_SLIDE1_SUB' | translate }}</p>\n        </div>\n        <div class=\"pitch-visual\">\n          <div class=\"visual-card\">\n            <span class=\"visual-stat\">10,000+</span>\n            <span class=\"visual-label\">{{ 'ONBOARDING.PITCH_STAT_VIEWS' | translate }}</span>\n          </div>\n        </div>\n        <div class=\"pitch-footer\">\n          <div class=\"pitch-dots\">\n            <span class=\"pitch-dot pitch-dot--active\"></span>\n            <span class=\"pitch-dot\"></span>\n            <span class=\"pitch-dot\"></span>\n          </div>\n          <button type=\"button\" class=\"btn btn-primary ob-btn-full\" (click)=\"nextPitchSlide()\">\n            {{ 'ONBOARDING.PITCH_NEXT' | translate }} &rarr;\n          </button>\n        </div>\n      </div>\n\n      <!-- Slide 1 -->\n      <div *ngIf=\"pitchSlide() === 1\" class=\"pitch-slide\">\n        <div class=\"pitch-content\">\n          <span class=\"pitch-badge\">VAMO Business</span>\n          <h2 class=\"pitch-title\">\n            {{ 'ONBOARDING.PITCH_SLIDE2_TITLE' | translate }}<br>\n            <span class=\"pitch-highlight\">{{ 'ONBOARDING.PITCH_SLIDE2_TITLE_HIGHLIGHT' | translate }}</span>\n          </h2>\n          <div class=\"pitch-features\">\n            <div class=\"pitch-feature\">\n              <div class=\"pitch-feature-icon\">\n                <svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n                  <path d=\"M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z\"></path>\n                  <circle cx=\"12\" cy=\"10\" r=\"3\"></circle>\n                </svg>\n              </div>\n              <div class=\"pitch-feature-text\">\n                <strong>{{ 'ONBOARDING.PITCH_FEATURE_REACH' | translate }}</strong>\n              </div>\n            </div>\n            <div class=\"pitch-feature\">\n              <div class=\"pitch-feature-icon\">\n                <svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n                  <polygon points=\"13 2 3 14 12 14 11 22 21 10 12 10 13 2\"></polygon>\n                </svg>\n              </div>\n              <div class=\"pitch-feature-text\">\n                <strong>{{ 'ONBOARDING.PITCH_FEATURE_PROMOTE' | translate }}</strong>\n              </div>\n            </div>\n            <div class=\"pitch-feature\">\n              <div class=\"pitch-feature-icon\">\n                <svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n                  <polyline points=\"23 6 13.5 15.5 8.5 10.5 1 18\"></polyline>\n                  <polyline points=\"17 6 23 6 23 12\"></polyline>\n                </svg>\n              </div>\n              <div class=\"pitch-feature-text\">\n                <strong>{{ 'ONBOARDING.PITCH_FEATURE_REVENUE' | translate }}</strong>\n              </div>\n            </div>\n          </div>\n        </div>\n        <div class=\"pitch-footer\">\n          <div class=\"pitch-dots\">\n            <span class=\"pitch-dot\"></span>\n            <span class=\"pitch-dot pitch-dot--active\"></span>\n            <span class=\"pitch-dot\"></span>\n          </div>\n          <button type=\"button\" class=\"btn btn-primary ob-btn-full\" (click)=\"nextPitchSlide()\">\n            {{ 'ONBOARDING.PITCH_NEXT' | translate }} &rarr;\n          </button>\n        </div>\n      </div>\n\n      <!-- Slide 2 -->\n      <div *ngIf=\"pitchSlide() === 2\" class=\"pitch-slide\">\n        <div class=\"pitch-content\">\n          <span class=\"pitch-badge\">VAMO Business</span>\n          <h2 class=\"pitch-title\">\n            {{ 'ONBOARDING.PITCH_SLIDE3_TITLE' | translate }}<br>\n            <span class=\"pitch-highlight\">{{ 'ONBOARDING.PITCH_SLIDE3_TITLE_HIGHLIGHT' | translate }}</span>\n          </h2>\n          <p class=\"pitch-sub\">{{ 'ONBOARDING.PITCH_SLIDE3_SUB' | translate }}</p>\n        </div>\n        <div class=\"pitch-mockup\">\n          <div class=\"mockup-header\">\n            <span class=\"mockup-dot red\"></span>\n            <span class=\"mockup-dot yellow\"></span>\n            <span class=\"mockup-dot green\"></span>\n            <span class=\"mockup-title\">VAMO Business</span>\n          </div>\n          <div class=\"mockup-body\">\n            <div class=\"mockup-event-title\">Live Music & Events</div>\n            <div class=\"mockup-field\"></div>\n            <div class=\"mockup-field sm\"></div>\n          </div>\n        </div>\n        <div class=\"pitch-footer\">\n          <div class=\"pitch-dots\">\n            <span class=\"pitch-dot\"></span>\n            <span class=\"pitch-dot\"></span>\n            <span class=\"pitch-dot pitch-dot--active\"></span>\n          </div>\n          <button type=\"button\" class=\"btn btn-primary ob-btn-full\" (click)=\"nextPitchSlide()\">\n            {{ 'ONBOARDING.PITCH_REGISTER' | translate }} &rarr;\n          </button>\n        </div>\n      </div>\n    </section>\n\n    <!-- STEP 4: BUSINESS ACCOUNT REGISTRATION -->\n    <section *ngIf=\"currentStep() === 'business-register'\" class=\"ob-step ob-step--form\">\n      <div class=\"ob-header\">\n        <h1 class=\"ob-title\">{{ 'ONBOARDING.BUSINESS_REGISTER_TITLE' | translate }}</h1>\n        <p class=\"ob-subtitle\">{{ 'ONBOARDING.BUSINESS_REGISTER_SUB' | translate }}</p>\n      </div>\n\n      <div class=\"ob-card\">\n        <ng-container *ngTemplateOutlet=\"userFormTpl\"></ng-container>\n\n        <div class=\"ob-footer ob-footer--stack\">\n          <button\n            type=\"button\"\n            class=\"btn btn-primary ob-btn-full\"\n            [disabled]=\"loading() || !isUserFormValid()\"\n            (click)=\"registerBusinessUser()\"\n          >\n            <span *ngIf=\"!loading()\">{{ 'ONBOARDING.CONTINUE' | translate }}</span>\n            <span *ngIf=\"loading()\" class=\"spinner-row\">\n              <span class=\"spinner\"></span>\n              <span>{{ 'PORTAL.ONBOARDING.CREATING_ACCOUNT' | translate }}</span>\n            </span>\n          </button>\n\n          <div class=\"ob-social-divider\"><span>{{ 'AUTH.OR_CONTINUE_WITH' | translate | uppercase }}</span></div>\n\n          <div class=\"ob-social-row\">\n            <button type=\"button\" class=\"btn btn-secondary ob-social-btn\" [disabled]=\"loading()\" (click)=\"onGoogleSignUp()\">\n              <svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\">\n                <path fill=\"#4285F4\" d=\"M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z\"/>\n                <path fill=\"#34A853\" d=\"M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z\"/>\n                <path fill=\"#FBBC05\" d=\"M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z\"/>\n                <path fill=\"#EA4335\" d=\"M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z\"/>\n              </svg>\n              <span>{{ 'AUTH.LOGIN_GOOGLE' | translate }}</span>\n            </button>\n          </div>\n\n          <div class=\"ob-login-link-wrap\">\n            <span class=\"ob-login-text\">{{ 'ONBOARDING.ALREADY_HAVE_ACCOUNT' | translate }}</span>\n            <a routerLink=\"/login\" class=\"ob-login-link\">{{ 'ONBOARDING.LOGIN' | translate }}</a>\n          </div>\n        </div>\n      </div>\n    </section>\n\n    <!-- STEP 5: BUSINESS DETAILS FORM -->\n    <section *ngIf=\"currentStep() === 'business-details'\" class=\"ob-step ob-step--form\">\n      <div class=\"ob-header\">\n        <h1 class=\"ob-title\">{{ 'ONBOARDING.BUSINESS_DETAILS_TITLE' | translate }}</h1>\n        <p class=\"ob-subtitle\">{{ 'ONBOARDING.BUSINESS_DETAILS_SUB' | translate }}</p>\n      </div>\n\n      <div class=\"ob-card\">\n        <form (ngSubmit)=\"submitBusinessDetails()\" class=\"ob-form\">\n          <!-- Business Name -->\n          <div class=\"form-group\">\n            <label for=\"businessName\" class=\"form-label\">{{ 'ONBOARDING.BUSINESS_NAME' | translate }} *</label>\n            <input\n              type=\"text\"\n              id=\"businessName\"\n              name=\"businessName\"\n              [(ngModel)]=\"businessName\"\n              (blur)=\"touch('businessName')\"\n              required\n              class=\"form-input\"\n              placeholder=\"e.g. Las Terrenas Beach Club\"\n              [disabled]=\"loading()\"\n            />\n            <p *ngIf=\"touched.businessName && !businessName.trim()\" class=\"field-error\">\n              {{ 'ONBOARDING.ERROR_BUSINESS_NAME_REQUIRED' | translate }}\n            </p>\n          </div>\n\n          <!-- Business Type -->\n          <div class=\"form-group\">\n            <label for=\"businessType\" class=\"form-label\">{{ 'ONBOARDING.BUSINESS_TYPE' | translate }} *</label>\n            <select\n              id=\"businessType\"\n              name=\"businessType\"\n              [(ngModel)]=\"businessType\"\n              (change)=\"touch('businessType')\"\n              required\n              class=\"form-input form-select\"\n              [disabled]=\"loading()\"\n            >\n              <option value=\"\" disabled selected>{{ 'PORTAL.ONBOARDING.SELECT_BUSINESS_TYPE' | translate }}</option>\n              <option *ngFor=\"let type of businessTypes()\" [value]=\"type.value\">\n                {{ type.label }}\n              </option>\n            </select>\n            <p *ngIf=\"touched.businessType && !businessType\" class=\"field-error\">\n              {{ 'ONBOARDING.ERROR_BUSINESS_TYPE_REQUIRED' | translate }}\n            </p>\n          </div>\n\n          <!-- Business Description -->\n          <div class=\"form-group\">\n            <label for=\"businessDescription\" class=\"form-label\">\n              {{ 'ONBOARDING.BUSINESS_DESCRIPTION' | translate }} *\n            </label>\n            <textarea\n              id=\"businessDescription\"\n              name=\"businessDescription\"\n              rows=\"3\"\n              [(ngModel)]=\"businessDescription\"\n              (blur)=\"touch('businessDescription')\"\n              required\n              minlength=\"20\"\n              class=\"form-input form-textarea\"\n              placeholder=\"Describe your venue, offerings, and special atmosphere…\"\n              [disabled]=\"loading()\"\n            ></textarea>\n            <p\n              *ngIf=\"touched.businessDescription && businessDescription.trim().length < 20\"\n              class=\"field-error\"\n            >\n              {{ 'PORTAL.ONBOARDING.DESCRIPTION_CHAR_COUNT' | translate: { count: businessDescription.trim().length } }}\n            </p>\n          </div>\n\n          <!-- Business Phone -->\n          <div class=\"form-group\">\n            <label for=\"businessPhone\" class=\"form-label\">{{ 'ONBOARDING.BUSINESS_PHONE' | translate }} *</label>\n            <input\n              type=\"tel\"\n              id=\"businessPhone\"\n              name=\"businessPhone\"\n              [(ngModel)]=\"businessPhone\"\n              (blur)=\"touch('businessPhone')\"\n              required\n              class=\"form-input\"\n              placeholder=\"+1 809-555-0199\"\n              [disabled]=\"loading()\"\n            />\n            <p *ngIf=\"touched.businessPhone && !businessPhone.trim()\" class=\"field-error\">\n              {{ 'ONBOARDING.ERROR_PHONE_REQUIRED' | translate }}\n            </p>\n            <p\n              *ngIf=\"touched.businessPhone && businessPhone.trim() && !isValidPhone(businessPhone)\"\n              class=\"field-error\"\n            >\n              {{ 'PORTAL.ONBOARDING.INVALID_PHONE' | translate }}\n            </p>\n          </div>\n\n          <!-- WhatsApp Toggle -->\n          <div class=\"form-group toggle-group\">\n            <label class=\"toggle-label\">\n              <input\n                type=\"checkbox\"\n                name=\"waNumberSameAsPhone\"\n                [(ngModel)]=\"waNumberSameAsPhone\"\n                [disabled]=\"loading()\"\n              />\n              <span class=\"toggle-custom\"></span>\n              <span class=\"toggle-text\">{{ 'ONBOARDING.WA_SAME_AS_PHONE' | translate }}</span>\n            </label>\n          </div>\n\n          <!-- WhatsApp Number (Conditional) -->\n          <div *ngIf=\"!waNumberSameAsPhone\" class=\"form-group\">\n            <label for=\"businessWhatsapp\" class=\"form-label\">{{ 'ONBOARDING.BUSINESS_WHATSAPP' | translate }}</label>\n            <input\n              type=\"tel\"\n              id=\"businessWhatsapp\"\n              name=\"businessWhatsapp\"\n              [(ngModel)]=\"businessWhatsapp\"\n              (blur)=\"touch('businessWhatsapp')\"\n              class=\"form-input\"\n              placeholder=\"+1 809-555-0199\"\n              [disabled]=\"loading()\"\n            />\n            <p\n              *ngIf=\"\n                touched.businessWhatsapp &&\n                businessWhatsapp.trim() &&\n                !isValidPhone(businessWhatsapp)\n              \"\n              class=\"field-error\"\n            >\n              {{ 'PORTAL.ONBOARDING.INVALID_WHATSAPP' | translate }}\n            </p>\n          </div>\n\n          <!-- Business Address -->\n          <div class=\"form-group\">\n            <label for=\"businessAddress\" class=\"form-label\">{{ 'ONBOARDING.BUSINESS_ADDRESS' | translate }} *</label>\n            <input\n              type=\"text\"\n              id=\"businessAddress\"\n              name=\"businessAddress\"\n              [(ngModel)]=\"businessAddress\"\n              (blur)=\"touch('businessAddress')\"\n              required\n              class=\"form-input\"\n              placeholder=\"e.g. Calle Principal #14, Las Terrenas\"\n              [disabled]=\"loading()\"\n            />\n            <p *ngIf=\"touched.businessAddress && !businessAddress.trim()\" class=\"field-error\">\n              {{ 'ONBOARDING.ERROR_ADDRESS_REQUIRED' | translate }}\n            </p>\n          </div>\n\n          <div class=\"ob-footer\">\n            <button\n              type=\"submit\"\n              class=\"btn btn-primary ob-btn-full\"\n              [disabled]=\"loading() || !isBusinessFormValid()\"\n            >\n              <span *ngIf=\"!loading()\">{{ 'PORTAL.ONBOARDING.CREATE_BUSINESS_PROFILE' | translate }}</span>\n              <span *ngIf=\"loading()\" class=\"spinner-row\">\n                <span class=\"spinner\"></span>\n                <span>{{ 'PORTAL.ONBOARDING.SETTING_UP' | translate }}</span>\n              </span>\n            </button>\n          </div>\n        </form>\n      </div>\n    </section>\n  </div>\n</div>\n\n<!-- SHARED USER FORM TEMPLATE -->\n<ng-template #userFormTpl>\n  <form class=\"ob-form\">\n    <div class=\"form-row\">\n      <div class=\"form-group flex-1\">\n        <label for=\"firstName\" class=\"form-label\">{{ 'ONBOARDING.FIRST_NAME' | translate }} *</label>\n        <input\n          type=\"text\"\n          id=\"firstName\"\n          name=\"firstName\"\n          [(ngModel)]=\"firstName\"\n          (blur)=\"touch('firstName')\"\n          required\n          class=\"form-input\"\n          placeholder=\"Juan\"\n          autocomplete=\"given-name\"\n          [disabled]=\"loading()\"\n        />\n        <p *ngIf=\"touched.firstName && !firstName.trim()\" class=\"field-error\">\n          {{ 'ONBOARDING.ERROR_FIRST_NAME_REQUIRED' | translate }}\n        </p>\n      </div>\n\n      <div class=\"form-group flex-1\">\n        <label for=\"lastName\" class=\"form-label\">{{ 'ONBOARDING.LAST_NAME' | translate }} *</label>\n        <input\n          type=\"text\"\n          id=\"lastName\"\n          name=\"lastName\"\n          [(ngModel)]=\"lastName\"\n          (blur)=\"touch('lastName')\"\n          required\n          class=\"form-input\"\n          placeholder=\"Pérez\"\n          autocomplete=\"family-name\"\n          [disabled]=\"loading()\"\n        />\n        <p *ngIf=\"touched.lastName && !lastName.trim()\" class=\"field-error\">\n          {{ 'ONBOARDING.ERROR_LAST_NAME_REQUIRED' | translate }}\n        </p>\n      </div>\n    </div>\n\n    <div class=\"form-group\">\n      <label for=\"email\" class=\"form-label\">{{ 'ONBOARDING.EMAIL' | translate }} *</label>\n      <input\n        type=\"email\"\n        id=\"email\"\n        name=\"email\"\n        [(ngModel)]=\"email\"\n        (blur)=\"touch('email')\"\n        required\n        class=\"form-input\"\n        placeholder=\"operator@yourbusiness.com\"\n        autocomplete=\"email\"\n        inputmode=\"email\"\n        [disabled]=\"loading()\"\n      />\n      <p *ngIf=\"touched.email && !email.trim()\" class=\"field-error\">\n        {{ 'ONBOARDING.ERROR_EMAIL_REQUIRED' | translate }}\n      </p>\n      <p *ngIf=\"touched.email && email.trim() && !isEmailValid()\" class=\"field-error\">\n        {{ 'ONBOARDING.ERROR_EMAIL_INVALID' | translate }}\n      </p>\n    </div>\n\n    <div class=\"form-group\">\n      <label for=\"password\" class=\"form-label\">{{ 'ONBOARDING.PASSWORD' | translate }} *</label>\n      <div class=\"password-wrapper\">\n        <input\n          [type]=\"showPassword ? 'text' : 'password'\"\n          id=\"password\"\n          name=\"password\"\n          [(ngModel)]=\"password\"\n          (blur)=\"touch('password')\"\n          required\n          minlength=\"6\"\n          class=\"form-input password-input\"\n          placeholder=\"••••••••••••\"\n          autocomplete=\"new-password\"\n          [disabled]=\"loading()\"\n        />\n        <button\n          type=\"button\"\n          class=\"password-toggle\"\n          (click)=\"togglePasswordVisibility()\"\n          [attr.aria-label]=\"showPassword ? 'Hide password' : 'Show password'\"\n        >\n          <svg *ngIf=\"showPassword\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\">\n            <path d=\"M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24\"></path>\n            <line x1=\"1\" y1=\"1\" x2=\"23\" y2=\"23\"></line>\n          </svg>\n          <svg *ngIf=\"!showPassword\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\">\n            <path d=\"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z\"></path>\n            <circle cx=\"12\" cy=\"12\" r=\"3\"></circle>\n          </svg>\n        </button>\n      </div>\n      <p *ngIf=\"touched.password && password.length < 6\" class=\"field-error\">\n        {{ 'ONBOARDING.ERROR_PASSWORD_MIN_LENGTH' | translate }}\n      </p>\n    </div>\n\n    <div class=\"form-group\">\n      <label for=\"confirmPassword\" class=\"form-label\">{{ 'ONBOARDING.CONFIRM_PASSWORD' | translate }} *</label>\n      <div class=\"password-wrapper\">\n        <input\n          [type]=\"showConfirmPassword ? 'text' : 'password'\"\n          id=\"confirmPassword\"\n          name=\"confirmPassword\"\n          [(ngModel)]=\"confirmPassword\"\n          (blur)=\"touch('confirmPassword')\"\n          required\n          class=\"form-input password-input\"\n          placeholder=\"••••••••••••\"\n          autocomplete=\"new-password\"\n          [disabled]=\"loading()\"\n        />\n        <button\n          type=\"button\"\n          class=\"password-toggle\"\n          (click)=\"toggleConfirmPasswordVisibility()\"\n          [attr.aria-label]=\"showConfirmPassword ? 'Hide password' : 'Show password'\"\n        >\n          <svg *ngIf=\"showConfirmPassword\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\">\n            <path d=\"M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24\"></path>\n            <line x1=\"1\" y1=\"1\" x2=\"23\" y2=\"23\"></line>\n          </svg>\n          <svg *ngIf=\"!showConfirmPassword\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\">\n            <path d=\"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z\"></path>\n            <circle cx=\"12\" cy=\"12\" r=\"3\"></circle>\n          </svg>\n        </button>\n      </div>\n      <p *ngIf=\"touched.confirmPassword && !confirmPassword.trim()\" class=\"field-error\">\n        {{ 'ONBOARDING.ERROR_CONFIRM_PASSWORD_REQUIRED' | translate }}\n      </p>\n      <p\n        *ngIf=\"touched.confirmPassword && confirmPassword && password !== confirmPassword\"\n        class=\"field-error\"\n      >\n        {{ 'ONBOARDING.ERROR_PASSWORD_MISMATCH' | translate }}\n      </p>\n    </div>\n\n    <div class=\"form-group checkbox-group\">\n      <label class=\"checkbox-label\">\n        <input\n          type=\"checkbox\"\n          name=\"agreedToTerms\"\n          [(ngModel)]=\"agreedToTerms\"\n          (change)=\"touch('agreedToTerms')\"\n          [disabled]=\"loading()\"\n        />\n        <span class=\"checkbox-custom\"></span>\n        <span class=\"terms-text\">\n          {{ 'ONBOARDING.TERMS_AGREE_PRE' | translate }}\n          <a href=\"https://vamo-app.com/terms\" target=\"_blank\" rel=\"noopener noreferrer\">{{ 'ONBOARDING.TERMS_OF_USE' | translate }}</a>\n          {{ 'ONBOARDING.TERMS_AGREE_AND' | translate }}\n          <a href=\"https://vamo-app.com/privacy\" target=\"_blank\" rel=\"noopener noreferrer\">{{ 'ONBOARDING.PRIVACY_POLICY' | translate }}</a>.\n        </span>\n      </label>\n      <p *ngIf=\"touched.agreedToTerms && !agreedToTerms\" class=\"field-error\">\n        {{ 'ONBOARDING.ERROR_TERMS_REQUIRED' | translate }}\n      </p>\n    </div>\n  </form>\n</ng-template>\n",
  styles: ["/* ==========================================================================\n   VAMO Business Portal — Onboarding Flow Stylesheet\n   Matches Redesigned Login Aesthetic & VAMO Visual Tokens\n   ========================================================================== */\n\n.onboarding-page {\n  min-height: 100vh;\n  width: 100vw;\n  background: #f8fafc;\n  color: #0f172a;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  padding: 32px 16px;\n  box-sizing: border-box;\n  font-family: var(--vamo-font-sans, system-ui, -apple-system, sans-serif);\n}\n\n.ob-container {\n  width: 100%;\n  max-width: 520px;\n  background: #ffffff;\n  border: 1px solid #e2e8f0;\n  border-radius: 20px;\n  padding: 36px 32px;\n  box-shadow:\n    0 10px 25px -5px rgba(15, 23, 42, 0.05),\n    0 8px 10px -6px rgba(15, 23, 42, 0.03);\n  box-sizing: border-box;\n  display: flex;\n  flex-direction: column;\n}\n\n/* ── Top Bar ───────────────────────────────────────────────────────────── */\n.ob-topbar {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  margin-bottom: 24px;\n}\n\n.ob-topbar-left {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n}\n\n.ob-logo-wrap {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n.ob-logo {\n  height: 28px;\n  width: auto;\n}\n\n.ob-brand-text {\n  font-weight: 800;\n  font-size: 1.15rem;\n  letter-spacing: -0.02em;\n  color: #0f172a;\n}\n\n.ob-nav-btn {\n  background: #f1f5f9;\n  border: 1px solid #cbd5e1;\n  border-radius: 50%;\n  width: 34px;\n  height: 34px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  color: #475569;\n  cursor: pointer;\n  transition: all 0.15s ease;\n  padding: 0;\n}\n\n.ob-nav-btn:hover {\n  background: #e2e8f0;\n  color: #0f172a;\n  border-color: #94a3b8;\n}\n\n.ob-progress {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n}\n\n.ob-dot {\n  width: 8px;\n  height: 8px;\n  border-radius: 50%;\n  background: #e2e8f0;\n  transition: all 0.2s ease;\n}\n\n.ob-dot--active {\n  background: var(--vamo-pink, #ec4899);\n  width: 22px;\n  border-radius: 4px;\n}\n\n.ob-topbar-right {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n/* ── Header ────────────────────────────────────────────────────────────── */\n.ob-header {\n  margin-bottom: 22px;\n}\n\n.ob-header--center {\n  text-align: center;\n}\n\n.ob-title {\n  font-size: 1.6rem;\n  font-weight: 800;\n  color: #0f172a;\n  letter-spacing: -0.025em;\n  margin: 0 0 6px 0;\n  line-height: 1.25;\n}\n\n.ob-subtitle {\n  font-size: 0.92rem;\n  color: #64748b;\n  margin: 0;\n  line-height: 1.45;\n}\n\n/* ── Alerts & Banners ──────────────────────────────────────────────────── */\n.ob-alert {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 12px 14px;\n  border-radius: 10px;\n  font-size: 0.86rem;\n  margin-bottom: 20px;\n  line-height: 1.4;\n}\n\n.ob-alert-error {\n  background: rgba(239, 68, 68, 0.1);\n  border: 1px solid rgba(239, 68, 68, 0.3);\n  color: #b91c1c;\n}\n\n.ob-alert-warning {\n  background: rgba(245, 158, 11, 0.1);\n  border: 1px solid rgba(245, 158, 11, 0.3);\n  color: #b45309;\n}\n\n.warning-text {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n\n.warning-link {\n  color: var(--vamo-pink, #ec4899);\n  font-weight: 600;\n  text-decoration: underline;\n}\n\n.ob-banner {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 10px 14px;\n  border-radius: 8px;\n  font-size: 0.85rem;\n  margin-bottom: 18px;\n  line-height: 1.4;\n}\n\n.ob-banner--found {\n  background: rgba(16, 185, 129, 0.1);\n  border: 1px solid rgba(16, 185, 129, 0.3);\n  color: #047857;\n}\n\n.ob-banner--outside {\n  background: rgba(245, 158, 11, 0.1);\n  border: 1px solid rgba(245, 158, 11, 0.3);\n  color: #b45309;\n}\n\n.ob-loading-state {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 10px;\n  padding: 32px 16px;\n  color: #64748b;\n  font-size: 0.9rem;\n}\n\n/* ── Location Permission Visual ────────────────────────────────────────── */\n.ob-location-visual {\n  position: relative;\n  width: 90px;\n  height: 90px;\n  margin: 12px auto 24px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n\n.ob-location-pin {\n  position: relative;\n  z-index: 2;\n  width: 56px;\n  height: 56px;\n  border-radius: 50%;\n  background: var(--vamo-pink, #ec4899);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  color: #ffffff;\n  box-shadow: 0 4px 16px rgba(236, 72, 153, 0.35);\n}\n\n.ob-location-ring {\n  position: absolute;\n  border-radius: 50%;\n  border: 1px solid rgba(236, 72, 153, 0.35);\n}\n\n.ob-location-ring--inner {\n  width: 74px;\n  height: 74px;\n}\n\n.ob-location-ring--outer {\n  width: 90px;\n  height: 90px;\n  opacity: 0.45;\n}\n\n.ob-benefits {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  margin-bottom: 24px;\n  background: #f8fafc;\n  border: 1px solid #e2e8f0;\n  border-radius: 12px;\n  padding: 16px;\n}\n\n.ob-benefit-row {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  font-size: 0.88rem;\n  color: #334155;\n  line-height: 1.4;\n}\n\n.benefit-icon-wrap {\n  width: 32px;\n  height: 32px;\n  border-radius: 8px;\n  background: rgba(236, 72, 153, 0.1);\n  color: var(--vamo-pink, #ec4899);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  flex-shrink: 0;\n}\n\n/* ── Area Selection ────────────────────────────────────────────────────── */\n.ob-area-grid {\n  display: grid;\n  grid-template-columns: repeat(2, 1fr);\n  gap: 12px;\n  margin-bottom: 24px;\n}\n\n.ob-area-card {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 14px;\n  background: #f8fafc;\n  border: 1.5px solid #e2e8f0;\n  border-radius: 12px;\n  color: #0f172a;\n  cursor: pointer;\n  transition: all 0.15s ease;\n  position: relative;\n  text-align: left;\n  font-family: inherit;\n}\n\n.ob-area-card:hover {\n  background: #ffffff;\n  border-color: #cbd5e1;\n  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);\n}\n\n.ob-area-card--selected {\n  background: #fdf2f8 !important;\n  border-color: var(--vamo-pink, #ec4899) !important;\n  box-shadow: 0 0 0 2px rgba(236, 72, 153, 0.15);\n}\n\n.ob-area-emoji {\n  font-size: 1.35rem;\n  line-height: 1;\n}\n\n.ob-area-name {\n  font-size: 0.88rem;\n  font-weight: 600;\n  color: #0f172a;\n  flex: 1;\n}\n\n.ob-area-check {\n  color: var(--vamo-pink, #ec4899);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n\n/* ── Intent Cards ──────────────────────────────────────────────────────── */\n.ob-intent-cards {\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n}\n\n.ob-intent-card {\n  display: flex;\n  align-items: center;\n  gap: 16px;\n  padding: 20px;\n  background: #f8fafc;\n  border: 1.5px solid #e2e8f0;\n  border-radius: 14px;\n  color: #0f172a;\n  cursor: pointer;\n  transition: all 0.15s ease;\n  text-align: left;\n  width: 100%;\n  box-sizing: border-box;\n  font-family: inherit;\n}\n\n.ob-intent-card:hover {\n  background: #ffffff;\n  border-color: var(--vamo-pink, #ec4899);\n  box-shadow: 0 4px 14px rgba(236, 72, 153, 0.08);\n  transform: translateY(-2px);\n}\n\n.ob-intent-icon {\n  width: 48px;\n  height: 48px;\n  border-radius: 12px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  flex-shrink: 0;\n}\n\n.ob-intent-icon--browse {\n  background: rgba(59, 130, 246, 0.1);\n  color: #2563eb;\n}\n\n.ob-intent-icon--business {\n  background: rgba(236, 72, 153, 0.1);\n  color: var(--vamo-pink, #ec4899);\n}\n\n.ob-intent-text {\n  flex: 1;\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n\n.ob-intent-text strong {\n  font-size: 0.98rem;\n  font-weight: 700;\n  color: #0f172a;\n}\n\n.ob-intent-text span {\n  font-size: 0.84rem;\n  color: #64748b;\n  line-height: 1.35;\n}\n\n.ob-intent-arrow {\n  color: #94a3b8;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: transform 0.15s ease, color 0.15s ease;\n}\n\n.ob-intent-card:hover .ob-intent-arrow {\n  color: var(--vamo-pink, #ec4899);\n  transform: translateX(3px);\n}\n\n/* ── Forms & Inputs ────────────────────────────────────────────────────── */\n.ob-form {\n  display: flex;\n  flex-direction: column;\n  gap: 16px;\n}\n\n.form-row {\n  display: flex;\n  gap: 12px;\n}\n\n.flex-1 {\n  flex: 1;\n}\n\n.form-group {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n\n.form-label {\n  font-size: 0.84rem;\n  font-weight: 600;\n  color: #1e293b;\n}\n\n.field-error {\n  font-size: 0.76rem;\n  color: #dc2626;\n  margin: 2px 0 0;\n  font-weight: 500;\n}\n\n.form-input {\n  width: 100%;\n  height: 42px;\n  padding: 8px 12px;\n  background: #f8fafc;\n  border: 1.5px solid #cbd5e1;\n  border-radius: 8px;\n  color: #0f172a;\n  font-size: 0.9rem;\n  transition: all 0.15s ease;\n  box-sizing: border-box;\n  font-family: inherit;\n}\n\n.form-input:focus {\n  background: #ffffff;\n  outline: none;\n  border-color: var(--vamo-pink, #ec4899);\n  box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.15);\n}\n\n.form-input::placeholder {\n  color: #94a3b8;\n}\n\n.form-input:disabled {\n  opacity: 0.6;\n  cursor: not-allowed;\n  background: #f1f5f9;\n}\n\n.form-select {\n  appearance: auto;\n  cursor: pointer;\n}\n\n.form-textarea {\n  height: auto;\n  min-height: 80px;\n  resize: vertical;\n  line-height: 1.45;\n}\n\n.password-wrapper {\n  position: relative;\n  display: flex;\n  align-items: center;\n}\n\n.password-input {\n  padding-right: 44px;\n}\n\n.password-toggle {\n  position: absolute;\n  right: 12px;\n  background: transparent;\n  border: none;\n  color: #64748b;\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  padding: 4px;\n}\n\n.password-toggle:hover {\n  color: #0f172a;\n}\n\n/* Toggles & Checkboxes */\n.toggle-group {\n  margin-top: 4px;\n}\n\n.toggle-label,\n.checkbox-label {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  cursor: pointer;\n  font-size: 0.86rem;\n  color: #334155;\n  user-select: none;\n}\n\n.toggle-label input[type=\"checkbox\"],\n.checkbox-label input[type=\"checkbox\"] {\n  width: 18px;\n  height: 18px;\n  accent-color: var(--vamo-pink, #ec4899);\n  cursor: pointer;\n}\n\n.terms-text a {\n  color: var(--vamo-pink, #ec4899);\n  text-decoration: underline;\n  font-weight: 600;\n}\n\n/* ── Pitch Slides ──────────────────────────────────────────────────────── */\n.pitch-slide {\n  display: flex;\n  flex-direction: column;\n  gap: 20px;\n}\n\n.pitch-badge {\n  display: inline-block;\n  font-size: 0.74rem;\n  font-weight: 700;\n  text-transform: uppercase;\n  letter-spacing: 0.08em;\n  color: var(--vamo-pink, #ec4899);\n  margin-bottom: 6px;\n}\n\n.pitch-title {\n  font-size: 1.6rem;\n  font-weight: 800;\n  line-height: 1.25;\n  color: #0f172a;\n  letter-spacing: -0.025em;\n  margin: 0 0 8px 0;\n}\n\n.pitch-highlight {\n  color: var(--vamo-pink, #ec4899);\n}\n\n.pitch-sub {\n  font-size: 0.92rem;\n  color: #475569;\n  line-height: 1.5;\n  margin: 0;\n}\n\n.pitch-visual {\n  background: #f8fafc;\n  border: 1px solid #e2e8f0;\n  border-radius: 14px;\n  padding: 24px;\n  text-align: center;\n}\n\n.visual-stat {\n  display: block;\n  font-size: 2.2rem;\n  font-weight: 900;\n  color: #0f172a;\n}\n\n.visual-label {\n  font-size: 0.85rem;\n  color: #64748b;\n  font-weight: 500;\n}\n\n.pitch-features {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}\n\n.pitch-feature {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  background: #f8fafc;\n  padding: 12px 14px;\n  border-radius: 10px;\n  border: 1px solid #e2e8f0;\n}\n\n.pitch-feature-icon {\n  width: 32px;\n  height: 32px;\n  border-radius: 8px;\n  background: rgba(236, 72, 153, 0.1);\n  color: var(--vamo-pink, #ec4899);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  flex-shrink: 0;\n}\n\n.pitch-feature-text strong {\n  font-size: 0.9rem;\n  font-weight: 600;\n  color: #0f172a;\n}\n\n.pitch-mockup {\n  background: #ffffff;\n  border: 1.5px solid #e2e8f0;\n  border-radius: 12px;\n  overflow: hidden;\n}\n\n.mockup-header {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  padding: 10px 14px;\n  background: #f8fafc;\n  border-bottom: 1px solid #e2e8f0;\n}\n\n.mockup-dot {\n  width: 8px;\n  height: 8px;\n  border-radius: 50%;\n}\n\n.mockup-dot.red { background: #ef4444; }\n.mockup-dot.yellow { background: #f59e0b; }\n.mockup-dot.green { background: #10b981; }\n\n.mockup-title {\n  font-size: 0.78rem;\n  font-weight: 600;\n  color: #64748b;\n  margin-left: 8px;\n}\n\n.mockup-body {\n  padding: 16px;\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n}\n\n.mockup-event-title {\n  font-weight: 700;\n  font-size: 0.95rem;\n  color: #0f172a;\n}\n\n.mockup-field {\n  height: 12px;\n  background: #e2e8f0;\n  border-radius: 4px;\n  width: 85%;\n}\n\n.mockup-field.sm {\n  width: 60%;\n}\n\n.pitch-footer {\n  display: flex;\n  flex-direction: column;\n  gap: 16px;\n  margin-top: 6px;\n}\n\n.pitch-dots {\n  display: flex;\n  justify-content: center;\n  gap: 6px;\n}\n\n.pitch-dot {\n  width: 8px;\n  height: 8px;\n  border-radius: 50%;\n  background: #e2e8f0;\n  transition: all 0.2s ease;\n}\n\n.pitch-dot--active {\n  background: var(--vamo-pink, #ec4899);\n  width: 22px;\n  border-radius: 4px;\n}\n\n/* ── Footers & Actions ─────────────────────────────────────────────────── */\n.ob-footer {\n  margin-top: 24px;\n}\n\n.ob-footer--stack {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}\n\n.ob-btn-full {\n  width: 100%;\n  height: 44px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n\n.ob-skip-btn {\n  width: 100%;\n  height: 38px;\n  color: #64748b;\n  background: transparent;\n  border: 1px solid #e2e8f0;\n  border-radius: 8px;\n  font-weight: 600;\n  font-size: 0.88rem;\n  cursor: pointer;\n  transition: all 0.15s ease;\n}\n\n.ob-skip-btn:hover {\n  background: #f1f5f9;\n  color: #0f172a;\n}\n\n.ob-login-link-wrap {\n  text-align: center;\n  font-size: 0.86rem;\n  color: #64748b;\n  margin-top: 6px;\n  display: flex;\n  justify-content: center;\n  gap: 6px;\n}\n\n.ob-login-link {\n  color: var(--vamo-pink, #ec4899);\n  font-weight: 600;\n  text-decoration: underline;\n}\n\n.ob-social-divider {\n  display: flex;\n  align-items: center;\n  text-align: center;\n  color: #94a3b8;\n  font-size: 0.72rem;\n  font-weight: 700;\n  letter-spacing: 0.08em;\n  margin: 4px 0;\n}\n\n.ob-social-divider::before,\n.ob-social-divider::after {\n  content: '';\n  flex: 1;\n  border-bottom: 1px solid #e2e8f0;\n}\n\n.ob-social-divider span {\n  padding: 0 10px;\n}\n\n.ob-social-row {\n  display: flex;\n  justify-content: center;\n}\n\n.ob-social-btn {\n  width: 100%;\n  height: 42px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 10px;\n  background: #ffffff;\n  border: 1.5px solid #cbd5e1;\n  border-radius: 8px;\n  color: #0f172a;\n  font-size: 0.9rem;\n  font-weight: 600;\n  cursor: pointer;\n  transition: all 0.15s ease;\n}\n\n.ob-social-btn:hover:not(:disabled) {\n  background: #f8fafc;\n  border-color: #94a3b8;\n}\n\n/* ── Primary Button Token ──────────────────────────────────────────────── */\n.btn-primary {\n  background: linear-gradient(135deg, var(--vamo-pink, #ec4899), #db2777);\n  color: #ffffff;\n  font-weight: 700;\n  font-size: 0.92rem;\n  border: none;\n  border-radius: 8px;\n  cursor: pointer;\n  transition: all 0.15s ease;\n  box-shadow: 0 2px 8px rgba(236, 72, 153, 0.25);\n}\n\n.btn-primary:hover:not(:disabled) {\n  opacity: 0.95;\n  box-shadow: 0 4px 12px rgba(236, 72, 153, 0.35);\n  transform: translateY(-1px);\n}\n\n.btn-primary:disabled {\n  opacity: 0.55;\n  cursor: not-allowed;\n  box-shadow: none;\n}\n\n.spinner-row {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n.spinner {\n  width: 16px;\n  height: 16px;\n  border: 2px solid rgba(255, 255, 255, 0.3);\n  border-top-color: #ffffff;\n  border-radius: 50%;\n  animation: spin 0.8s linear infinite;\n  display: inline-block;\n}\n\n@keyframes spin {\n  to { transform: rotate(360deg); }\n}\n\n@media (max-width: 560px) {\n  .ob-container {\n    padding: 24px 20px;\n    border-radius: 16px;\n  }\n\n  .ob-area-grid {\n    grid-template-columns: 1fr;\n  }\n\n  .form-row {\n    flex-direction: column;\n    gap: 16px;\n  }\n}\n"],
})
export class OnboardingComponent implements OnInit {
  private authService = inject(AuthService);
  private businessService = inject(BusinessService);
  private customerErrorService = inject(CustomerErrorService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  readonly i18n = inject(I18nService);

  readonly businessTypes = this.i18n.businessTypes;

  // Flow State
  currentStep = signal<OnboardingStep>('location-permission');
  isLoggedInUser = signal<boolean>(false);
  pitchSlide = signal<number>(0);

  // Area & Location State
  areas = signal<Area[]>([]);
  areasLoading = signal<boolean>(true);
  locationLoading = signal<boolean>(false);
  nearestArea = signal<Area | null>(null);
  notInDR = signal<boolean>(false);
  selectedArea = signal<Area | null>(null);

  // Intent
  intent = signal<'browse' | 'business' | null>(null);

  // User Form
  firstName = '';
  lastName = '';
  email = '';
  password = '';
  confirmPassword = '';
  agreedToTerms = true;
  showPassword = false;
  showConfirmPassword = false;

  // Business Details Form
  businessName = '';
  businessType = '';
  businessDescription = '';
  businessPhone = '';
  waNumberSameAsPhone = false;
  businessWhatsapp = '';
  businessAddress = '';
  businessLocation: GeoJsonPoint | null = null;

  // Status
  loading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  emailTaken = signal<boolean>(false);

  touched = {
    firstName: false,
    lastName: false,
    email: false,
    password: false,
    confirmPassword: false,
    agreedToTerms: false,
    businessName: false,
    businessType: false,
    businessDescription: false,
    businessPhone: false,
    businessWhatsapp: false,
    businessAddress: false,
  };

  readonly isValidPhone = isValidPhone;

  async ngOnInit(): Promise<void> {
    const stepParam = this.route.snapshot.queryParamMap.get('step') as OnboardingStep | null;
    const validSteps: OnboardingStep[] = [
      'location-permission',
      'area',
      'intent',
      'browse-account',
      'business-pitch',
      'business-register',
      'business-details',
    ];
    if (stepParam && validSteps.includes(stepParam)) {
      this.currentStep.set(stepParam);
    }

    const mode = this.route.snapshot.queryParamMap.get('mode');
    const social = this.route.snapshot.queryParamMap.get('social');
    let currentUser = this.authService.currentUser;

    if (!currentUser && (social === 'business' || mode === 'business')) {
      try {
        currentUser = await this.authService.waitForInitialAuth();
      } catch {
        // Fallback
      }
    }

    // Returning from Google OAuth in business onboarding path
    if (social === 'business' && currentUser) {
      this.intent.set('business');
      this.firstName = currentUser.first_name ?? '';
      this.lastName = currentUser.last_name ?? '';
      this.email = currentUser.email ?? '';
      let areaRaw: string | null = null;
      try {
        if (typeof sessionStorage !== 'undefined') {
          areaRaw = sessionStorage.getItem('ob_area');
          sessionStorage.removeItem('ob_area');
        }
      } catch {}
      if (areaRaw) {
        try {
          const area = JSON.parse(areaRaw) as Area;
          this.selectedArea.set(area);
        } catch {}
      }
      this.currentStep.set('business-details');
    }
    // Already-authenticated user entering via "List your business" CTA
    else if (mode === 'business' && currentUser) {
      this.isLoggedInUser.set(true);
      this.intent.set('business');
      this.firstName = currentUser.first_name ?? '';
      this.lastName = currentUser.last_name ?? '';
      this.email = currentUser.email ?? '';
    }

    try {
      const areasList = await this.businessService.getAreas();
      this.areas.set(areasList || []);
      if (this.selectedArea()) {
        const matched = (areasList || []).find((a: Area) => a.id === this.selectedArea()?.id);
        if (matched) this.selectedArea.set(matched);
      }
    } catch {
      this.areas.set([]);
    } finally {
      this.areasLoading.set(false);
    }
  }

  touch(field: keyof typeof this.touched): void {
    this.touched[field] = true;
    if (field === 'email') {
      this.emailTaken.set(false);
    }
  }

  // ─── Location Detection ─────────────────────────────────

  async requestLocation(): Promise<void> {
    this.locationLoading.set(true);
    try {
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 })
        );
        const { latitude, longitude } = pos.coords;
        const areasList = this.areas();

        let nearest: Area | null = null;
        let minDist = Infinity;
        for (const area of areasList) {
          const d = this.haversineKm(latitude, longitude, area.latitude, area.longitude);
          if (d < minDist) {
            minDist = d;
            nearest = area;
          }
        }

        // Dominican Republic threshold: 300km max radius
        if (nearest && minDist <= 300) {
          this.nearestArea.set(nearest);
          this.selectedArea.set(nearest);
          this.notInDR.set(false);
        } else {
          this.notInDR.set(true);
        }
      }
    } catch {
      // Location denied or timed out; proceed to manual selection
    } finally {
      this.locationLoading.set(false);
      this.currentStep.set('area');
    }
  }

  skipLocation(): void {
    this.currentStep.set('area');
  }

  private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ─── Area Step ──────────────────────────────────────────

  selectArea(area: Area): void {
    this.selectedArea.set(area);
  }

  goToIntent(): void {
    if (!this.selectedArea()) return;
    if (this.isLoggedInUser()) {
      this.currentStep.set('business-details');
    } else {
      this.currentStep.set('intent');
    }
  }

  // ─── Intent Step ────────────────────────────────────────

  selectIntent(intent: 'browse' | 'business'): void {
    this.intent.set(intent);
    if (intent === 'browse') {
      this.currentStep.set('browse-account');
    } else {
      this.pitchSlide.set(0);
      this.currentStep.set('business-pitch');
    }
  }

  // ─── Pitch Slides ───────────────────────────────────────

  nextPitchSlide(): void {
    if (this.pitchSlide() < 2) {
      this.pitchSlide.update((s) => s + 1);
    } else {
      this.currentStep.set('business-register');
    }
  }

  // ─── User Registration Form ─────────────────────────────

  isEmailValid(): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim());
  }

  isUserFormValid(): boolean {
    return !!(
      this.firstName.trim() &&
      this.lastName.trim() &&
      this.email.trim() &&
      this.isEmailValid() &&
      this.password.length >= 6 &&
      this.password === this.confirmPassword &&
      this.agreedToTerms
    );
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  async registerBrowseUser(): Promise<void> {
    this.markAllUserFieldsTouched();
    if (!this.isUserFormValid() || this.loading()) return;

    this.loading.set(true);
    this.errorMessage.set(null);
    this.emailTaken.set(false);

    try {
      await this.authService.register({
        first_name: this.firstName.trim(),
        last_name: this.lastName.trim(),
        email: this.email.trim(),
        password: this.password,
      });
      const user = await this.authService.login(this.email.trim(), this.password);
      if (user?.provider_link?.id) {
        await this.router.navigateByUrl('/app/overview');
      } else {
        await this.router.navigate(['/no-business']);
      }
    } catch (err: any) {
      if (this.isEmailTakenError(err)) {
        this.emailTaken.set(true);
      } else {
        this.errorMessage.set(this.customerErrorService.toCustomerMessage(err, 'auth'));
      }
    } finally {
      this.loading.set(false);
    }
  }

  async registerBusinessUser(): Promise<void> {
    this.markAllUserFieldsTouched();
    if (!this.isUserFormValid() || this.loading()) return;

    this.loading.set(true);
    this.errorMessage.set(null);
    this.emailTaken.set(false);

    try {
      await this.authService.register({
        first_name: this.firstName.trim(),
        last_name: this.lastName.trim(),
        email: this.email.trim(),
        password: this.password,
      });
      await this.authService.login(this.email.trim(), this.password);
      this.currentStep.set('business-details');
    } catch (err: any) {
      if (this.isEmailTakenError(err)) {
        this.emailTaken.set(true);
      } else {
        this.errorMessage.set(this.customerErrorService.toCustomerMessage(err, 'auth'));
      }
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Business Details Form ──────────────────────────────

  isBusinessFormValid(): boolean {
    const phoneOk = isValidPhone(this.businessPhone);
    const waOk =
      this.waNumberSameAsPhone ||
      !this.businessWhatsapp.trim() ||
      isValidPhone(this.businessWhatsapp);

    return !!(
      this.businessName.trim() &&
      this.businessType &&
      this.businessDescription.trim().length >= 20 &&
      phoneOk &&
      waOk &&
      this.businessAddress.trim() &&
      this.selectedArea()
    );
  }

  async submitBusinessDetails(): Promise<void> {
    this.markAllBusinessFieldsTouched();
    if (!this.isBusinessFormValid() || this.loading()) return;

    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      const area = this.selectedArea()!;
      const waNumber =
        (this.waNumberSameAsPhone ? this.businessPhone : this.businessWhatsapp).trim() || null;

      const providerPayload: Record<string, any> = {
        name: this.businessName.trim(),
        business_type: this.businessType,
        description: this.businessDescription.trim(),
        phone: this.businessPhone.trim(),
        wa_number: waNumber,
        email: (this.email.trim() || this.authService.currentUser?.email) ?? null,
        address: this.businessAddress.trim(),
        city: area.name,
        area: area.id,
        location: this.businessLocation ?? {
          type: 'Point',
          coordinates: [area.longitude, area.latitude],
        },
        status: 'published',
      };

      await this.authService.createProviderAndLink(providerPayload);

      // Downstream route directly to first event creation on business portal
      await this.router.navigate(['/app/listings/create'], { replaceUrl: true });
    } catch (err: any) {
      this.errorMessage.set(this.customerErrorService.toCustomerMessage(err, 'save'));
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Navigation & Back ──────────────────────────────────

  goBack(): void {
    this.errorMessage.set(null);
    const step = this.currentStep();

    if (step === 'area') {
      if (this.isLoggedInUser()) {
        this.router.navigate(['/app/overview'], { replaceUrl: true });
      } else {
        this.currentStep.set('location-permission');
      }
    } else if (step === 'intent') {
      this.currentStep.set('area');
    } else if (step === 'browse-account') {
      this.currentStep.set('intent');
    } else if (step === 'business-pitch') {
      if (this.pitchSlide() > 0) {
        this.pitchSlide.update((s) => s - 1);
      } else {
        this.currentStep.set('intent');
      }
    } else if (step === 'business-register') {
      this.pitchSlide.set(2);
      this.currentStep.set('business-pitch');
    } else if (step === 'business-details') {
      this.currentStep.set(this.isLoggedInUser() ? 'area' : 'business-register');
    }
  }

  async cancelOnboarding(): Promise<void> {
    this.errorMessage.set(null);
    const target = this.isLoggedInUser() ? ['/app/overview'] : ['/login'];
    await this.router.navigate(target, { replaceUrl: true });
  }

  // ─── Social Authentication ──────────────────────────────

  onGoogleSignUp(): void {
    this.errorMessage.set(null);
    const isBusiness = this.intent() === 'business' || this.currentStep() === 'business-register';
    if (isBusiness) {
      if (this.selectedArea()) {
        try {
          sessionStorage.setItem('ob_area', JSON.stringify(this.selectedArea()));
        } catch {
          // Ignore storage restrictions
        }
      }
      this.authService.loginWithProvider('google', '/onboarding?social=business', 'business');
    } else {
      this.authService.loginWithProvider('google', '/no-business', 'browse');
    }
  }

  onAppleSignUp(): void {
    this.errorMessage.set(null);
    this.authService.loginWithProvider('apple', '/app/listings/create');
  }

  // ─── Helpers ─────────────────────────────────────────────

  private markAllUserFieldsTouched(): void {
    this.touched.firstName = true;
    this.touched.lastName = true;
    this.touched.email = true;
    this.touched.password = true;
    this.touched.confirmPassword = true;
    this.touched.agreedToTerms = true;
  }

  private markAllBusinessFieldsTouched(): void {
    this.touched.businessName = true;
    this.touched.businessType = true;
    this.touched.businessDescription = true;
    this.touched.businessPhone = true;
    this.touched.businessWhatsapp = true;
    this.touched.businessAddress = true;
  }

  private isEmailTakenError(err: any): boolean {
    const code = err?.errors?.[0]?.extensions?.code ?? '';
    const msg = (err?.errors?.[0]?.message ?? err?.message ?? '').toLowerCase();
    return (
      code === 'RECORD_NOT_UNIQUE' ||
      msg.includes('unique') ||
      msg.includes('already exist') ||
      msg.includes('already registered') ||
      msg.includes('email already taken')
    );
  }

  get progressDots(): { active: boolean }[] {
    const step = this.currentStep();
    const isBusiness = this.intent() === 'business';

    if (this.isLoggedInUser()) {
      const total = 2;
      const map: Record<OnboardingStep, number> = {
        'location-permission': 1,
        area: 1,
        intent: 1,
        'browse-account': 1,
        'business-pitch': 1,
        'business-register': 1,
        'business-details': 2,
      };
      const current = map[step] ?? 1;
      return Array.from({ length: total }, (_, i) => ({ active: i < current }));
    }

    const total = isBusiness ? 5 : 4;
    const map: Record<OnboardingStep, number> = {
      'location-permission': 1,
      area: 2,
      intent: 3,
      'browse-account': 4,
      'business-pitch': 3,
      'business-register': 4,
      'business-details': 5,
    };
    const current = map[step] ?? 1;
    return Array.from({ length: total }, (_, i) => ({ active: i < current }));
  }
}
