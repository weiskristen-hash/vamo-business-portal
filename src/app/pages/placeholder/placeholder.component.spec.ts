import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { PlaceholderComponent } from './placeholder.component';
import { I18nService } from '../../core/i18n/i18n.service';

describe('PlaceholderComponent (Settings & Future Modules Localization)', () => {
  let component: PlaceholderComponent;
  let fixture: ComponentFixture<PlaceholderComponent>;
  let i18n: I18nService;

  const createComponentWithRoute = (moduleKey: string) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PlaceholderComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: { module: moduleKey },
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PlaceholderComponent);
    component = fixture.componentInstance;
    i18n = TestBed.inject(I18nService);
    fixture.detectChanges();
  };

  it('should initialize Settings placeholder and translate copy in EN and ES', () => {
    createComponentWithRoute('settings');
    i18n.setLang('en');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.module-title')?.textContent?.trim()).toBe('Account Settings');
    expect(compiled.querySelector('.phase-pill')?.textContent?.trim()).toBe('Phase 1B Roadmap');
    expect(compiled.querySelector('.preview-badge span')?.textContent?.trim()).toBe('Under Active Development');
    expect(compiled.querySelector('.btn-secondary')?.textContent?.trim()).toBe('← Return to Overview');

    i18n.setLang('es');
    fixture.detectChanges();

    expect(compiled.querySelector('.module-title')?.textContent?.trim()).toBe('Configuración de la cuenta');
    expect(compiled.querySelector('.phase-pill')?.textContent?.trim()).toBe('Hoja de ruta - Fase 1B');
    expect(compiled.querySelector('.preview-badge span')?.textContent?.trim()).toBe('En desarrollo activo');
    expect(compiled.querySelector('.btn-secondary')?.textContent?.trim()).toBe('← Volver al resumen');
  });

  it('should initialize Promotions placeholder in EN and ES', () => {
    createComponentWithRoute('promotions');
    i18n.setLang('en');
    fixture.detectChanges();

    let compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.module-title')?.textContent?.trim()).toBe('VAMO Promotions & Placements');

    i18n.setLang('es');
    fixture.detectChanges();

    compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.module-title')?.textContent?.trim()).toBe('Promociones y ubicaciones en VAMO');
  });

  it('no longer provides an Insights placeholder (Insights is a real page) and never promises untracked metrics', () => {
    createComponentWithRoute('insights');
    expect(component.moduleMap['insights']).toBeUndefined();

    for (const lang of ['en', 'es'] as const) {
      i18n.setLang(lang);
      fixture.detectChanges();
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).not.toMatch(/impression|impresion|geograph|geográf|retention|retención/i);
    }
  });
});
