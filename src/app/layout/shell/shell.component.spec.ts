import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShellComponent } from './shell.component';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BusinessService } from '../../core/services/business.service';
import { I18nService, LANG_PREF_KEY } from '../../core/i18n/i18n.service';

describe('ShellComponent', () => {
  let component: ShellComponent;
  let fixture: ComponentFixture<ShellComponent>;

  const mockUser = {
    id: 'usr-1',
    first_name: 'Elena',
    last_name: 'Gomez',
    email: 'elena@casabonaire.com',
    provider_link: {
      id: 'prov-1',
      name: 'Casa Bonaire Suites',
      subscription_tier: 'starter',
    },
  };

  beforeEach(async () => {
    const authServiceSpy = {
      currentUser: mockUser,
      logout: vi.fn(),
    };

    const businessServiceSpy = {
      getAssetUrl: vi.fn().mockReturnValue(''),
    };

    await TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [
        provideRouter([]),
        I18nService,
        { provide: AuthService, useValue: authServiceSpy },
        { provide: BusinessService, useValue: businessServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ShellComponent);
    component = fixture.componentInstance;
  });

  it('should create the shell component', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should render sidebar and topbar elements', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-sidebar')).toBeTruthy();
    expect(compiled.querySelector('app-topbar')).toBeTruthy();
  });

  it('should toggle mobile navigation drawer and close on escape', () => {
    fixture.detectChanges();
    expect(component.mobileNavOpen).toBe(false);

    component.mobileNavOpen = true;
    expect(component.mobileNavOpen).toBe(true);

    component.onEscape();
    expect(component.mobileNavOpen).toBe(false);
  });

  describe('Authenticated Shell Localization', () => {
    it('should render authenticated LanguageSelectorComponent inside topbar', () => {
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      const langSelector = compiled.querySelector('app-topbar app-language-selector');
      expect(langSelector).toBeTruthy();
    });

    it('should immediately switch shell labels between EN and ES without reload', () => {
      const i18n = TestBed.inject(I18nService);
      i18n.setLang('en');
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const sidebar = compiled.querySelector('app-sidebar')!;

      // English labels
      expect(sidebar.textContent).toContain('Overview');
      expect(sidebar.textContent).toContain('Business Profile');
      expect(sidebar.textContent).toContain('Listings');
      expect(sidebar.textContent).toContain('Sign Out');

      // Switch to ES
      i18n.setLang('es');
      fixture.detectChanges();

      expect(sidebar.textContent).toContain('Visión general');
      expect(sidebar.textContent).toContain('Perfil del negocio');
      expect(sidebar.textContent).toContain('Publicaciones');
      expect(sidebar.textContent).toContain('Cerrar sesión');

      // Switch back to EN
      i18n.setLang('en');
      fixture.detectChanges();

      expect(sidebar.textContent).toContain('Overview');
      expect(sidebar.textContent).toContain('Sign Out');
    });

    it('should persist language preference and sync documentElement lang', () => {
      const i18n = TestBed.inject(I18nService);

      i18n.setLang('es');
      expect(localStorage.getItem(LANG_PREF_KEY)).toBe('es');
      expect(document.documentElement.lang).toBe('es');

      i18n.setLang('en');
      expect(localStorage.getItem(LANG_PREF_KEY)).toBe('en');
      expect(document.documentElement.lang).toBe('en');
    });

    it('should keep language selector accessible on mobile viewport', () => {
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      const selector = compiled.querySelector('app-topbar app-language-selector');
      expect(selector).toBeTruthy();
      // Ensure it is not nested inside hidden-on-mobile containers (.business-meta)
      const hiddenContainer = compiled.querySelector('.business-meta app-language-selector');
      expect(hiddenContainer).toBeFalsy();
    });
  });
});
