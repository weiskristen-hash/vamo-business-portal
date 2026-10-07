import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PhoneInputComponent } from './phone-input.component';
import { I18nService } from '../../../core/i18n/i18n.service';

describe('PhoneInputComponent', () => {
  let component: PhoneInputComponent;
  let fixture: ComponentFixture<PhoneInputComponent>;
  let i18nService: I18nService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PhoneInputComponent],
      providers: [I18nService],
    }).compileComponents();

    fixture = TestBed.createComponent(PhoneInputComponent);
    component = fixture.componentInstance;
    i18nService = TestBed.inject(I18nService);
    fixture.detectChanges();
  });

  it('creates the phone input component and defaults to Dominican Republic (+1)', () => {
    expect(component).toBeTruthy();
    expect(component.selectedCountry.iso2).toBe('DO');
    expect(component.selectedCountry.dialCode).toBe('1');
    expect(component.nationalNumber).toBe('');
  });

  it('loads existing Dominican Republic number cleanly without mangling digits', () => {
    component.writeValue('+18095550123');
    fixture.detectChanges();

    expect(component.selectedCountry.iso2).toBe('DO');
    expect(component.nationalNumber).toBe('8095550123');
  });

  it('loads international numbers and selects the corresponding country', () => {
    component.writeValue('+34 612 345 678');
    fixture.detectChanges();

    expect(component.selectedCountry.iso2).toBe('ES');
    expect(component.nationalNumber).toBe('612345678');
  });

  it('emits standard E.164 string when user edits country or national digits', () => {
    let emitted = '';
    component.valueChange.subscribe((val) => (emitted = val));

    // Select Spain (+34) and type national digits
    component.onCountryChange('ES');
    component.onNationalNumberChange('612345678');

    expect(emitted).toBe('+34612345678');
  });

  it('renders country flag, dial code, and native select with translated options', () => {
    i18nService.setLang('es');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.country-flag')?.textContent).toBe('🇩🇴');
    expect(compiled.querySelector('.country-dial')?.textContent).toBe('+1');

    const select = compiled.querySelector('.country-select') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.options.length).toBeGreaterThan(5);
  });
});
