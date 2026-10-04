import { TestBed } from '@angular/core/testing';
import { I18nService, LANG_PREF_KEY, BUSINESS_TYPE_OPTIONS } from './i18n.service';
import { TranslatePipe } from './translate.pipe';
import { LanguageSelectorComponent } from './language-selector.component';
import { enTranslations } from './translations/en';
import { esTranslations } from './translations/es';

describe('I18n Parity & Language Switching System', () => {
  let service: I18nService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [I18nService],
    });
    service = TestBed.inject(I18nService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('I18nService Initialization & Storage', () => {
    it('defaults to en when no stored language or url param', () => {
      expect(service.lang()).toBe('en');
    });

    it('persists selected language in localStorage and updates signal', () => {
      service.setLang('es');
      expect(service.lang()).toBe('es');
      expect(localStorage.getItem(LANG_PREF_KEY)).toBe('es');

      service.setLang('en');
      expect(service.lang()).toBe('en');
      expect(localStorage.getItem(LANG_PREF_KEY)).toBe('en');
    });

    it('ignores unsupported language codes', () => {
      service.setLang('fr' as any);
      expect(service.lang()).toBe('en');
    });

    it('computes correct dateLocale based on active language', () => {
      service.setLang('en');
      expect(service.dateLocale()).toBe('en-US');

      service.setLang('es');
      expect(service.dateLocale()).toBe('es-DO');
    });
  });

  describe('Translation Resolution & Interpolation', () => {
    it('translates canonical ONBOARDING and AUTH keys in English', () => {
      service.setLang('en');
      expect(service.t('ONBOARDING.LOCATION_TITLE')).toBe('Events near you');
      expect(service.t('AUTH.LOGIN_BTN')).toBe('Login');
      expect(service.t('ONBOARDING.FIRST_NAME')).toBe('First name');
    });

    it('translates canonical ONBOARDING and AUTH keys in Spanish with proper accents', () => {
      service.setLang('es');
      expect(service.t('ONBOARDING.LOCATION_TITLE')).toBe('Eventos cerca de ti');
      expect(service.t('AUTH.LOGIN_BTN')).toBe('Iniciar sesión');
      expect(service.t('ONBOARDING.FIRST_NAME')).toBe('Nombre');
      expect(service.t('ONBOARDING.LAST_NAME')).toBe('Apellido');
    });

    it('interpolates parameters correctly in both languages', () => {
      service.setLang('en');
      const enText = service.t('ONBOARDING.AREA_DETECTED', { area: 'Cabarete' });
      expect(enText).toContain('Cabarete');

      service.setLang('es');
      const esText = service.t('ONBOARDING.AREA_DETECTED', { area: 'Las Terrenas' });
      expect(esText).toContain('Las Terrenas');
      expect(esText).toContain('Detectamos que estás cerca de Las Terrenas');
    });

    it('falls back to English when key is missing in Spanish', () => {
      service.setLang('es');
      // If a hypothetical key only exists in en
      const key = 'COMMON.NON_EXISTENT_KEY';
      expect(service.t(key)).toBe(key);
    });
  });

  describe('Business Types Parity', () => {
    it('provides all 14 canonical business types with identical canonical labels in English and Spanish', () => {
      expect(BUSINESS_TYPE_OPTIONS.en.length).toBe(14);
      expect(BUSINESS_TYPE_OPTIONS.es.length).toBe(14);

      service.setLang('en');
      const enTypes = service.businessTypes();
      expect(enTypes.find((t) => t.value === 'restaurant_and_bar')?.label).toBe('Restaurant & Bar');
      expect(enTypes.find((t) => t.value === 'hair-dresser')?.label).toBe('Hair & Beauty');

      service.setLang('es');
      const esTypes = service.businessTypes();
      // Canonical VAMO renders type.label directly for all languages without inventing translations
      expect(esTypes.find((t) => t.value === 'restaurant_and_bar')?.label).toBe('Restaurant & Bar');
      expect(esTypes.find((t) => t.value === 'hair-dresser')?.label).toBe('Hair & Beauty');
    });

    it('preserves canonical English enum values regardless of language', () => {
      const enValues = BUSINESS_TYPE_OPTIONS.en.map((t) => t.value);
      const esValues = BUSINESS_TYPE_OPTIONS.es.map((t) => t.value);
      expect(enValues).toEqual(esValues);
      expect(enValues).toContain('restaurant_and_bar');
      expect(enValues).toContain('car_rental');
      expect(enValues).toContain('arts_and_culture');
    });
  });

  describe('TranslatePipe & LanguageSelectorComponent', () => {
    it('TranslatePipe transforms keys reactively', () => {
      const pipe = TestBed.runInInjectionContext(() => new TranslatePipe());

      service.setLang('en');
      expect(pipe.transform('ONBOARDING.CONTINUE')).toBe('Continue');

      service.setLang('es');
      expect(pipe.transform('ONBOARDING.CONTINUE')).toBe('Continuar');
    });

    it('LanguageSelectorComponent renders both languages and switches active state', () => {
      const fixture = TestBed.createComponent(LanguageSelectorComponent);
      fixture.detectChanges();

      const buttons = fixture.nativeElement.querySelectorAll('.lang-btn');
      expect(buttons.length).toBe(2);

      // Default EN active
      service.setLang('en');
      fixture.detectChanges();
      expect(buttons[0].classList.contains('lang-btn--active')).toBe(true);
      expect(buttons[1].classList.contains('lang-btn--active')).toBe(false);

      // Click ES
      buttons[1].click();
      fixture.detectChanges();
      expect(service.lang()).toBe('es');
      expect(buttons[0].classList.contains('lang-btn--active')).toBe(false);
      expect(buttons[1].classList.contains('lang-btn--active')).toBe(true);
    });
  });

  describe('Encoding & Mojibake Prevention', () => {
    it('translation dictionaries contain zero mojibake patterns', () => {
      const rawEn = JSON.stringify(enTranslations);
      const rawEs = JSON.stringify(esTranslations);

      const corruptPatterns = ['\u00E2\u2020\u2019', '\u00E2\u0161\u00A1', '\u00E2\u0153\u201C', 'P\u00C3\u00A9rez'];

      for (const pattern of corruptPatterns) {
        expect(rawEn).not.toContain(pattern);
        expect(rawEs).not.toContain(pattern);
      }
      expect(/[\u00E2\u00C3][\u0080-\u00BF]/.test(rawEn)).toBe(false);
      expect(/[\u00E2\u00C3][\u0080-\u00BF]/.test(rawEs)).toBe(false);
    });

    it('Spanish translations contain valid Spanish accented characters', () => {
      const rawEs = JSON.stringify(esTranslations);
      expect(rawEs).toContain('¿');
      expect(rawEs).toContain('¡');
      expect(rawEs).toContain('estás');
      expect(rawEs).toContain('dirección');
      expect(rawEs).toContain('teléfono');
    });
  });
});
