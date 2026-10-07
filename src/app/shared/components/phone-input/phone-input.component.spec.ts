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

  it('detects Canadian numbers when loaded, pasted and echoed by the form', () => {
    let emitted = '';
    component.registerOnChange(value => { emitted = value; component.writeValue(value); });
    component.writeValue('+1 416 555 0199');
    expect(component.selectedCountry.iso2).toBe('CA');
    component.onPaste({ preventDefault: vi.fn(), clipboardData: { getData: () => '+1 604 555 0199' } } as any);
    expect(component.selectedCountry.iso2).toBe('CA');
    expect(emitted).toBe('+16045550199');
    expect(component.nationalNumber).toBe('6045550199');
  });

  it('keeps a manual country choice through empty and ambiguous shared-code form echoes', () => {
    component.registerOnChange(value => component.writeValue(value));
    component.onCountryChange('CA');
    expect(component.selectedCountry.iso2).toBe('CA');
    component.onNationalNumberChange('8005550199');
    expect(component.selectedCountry.iso2).toBe('CA');
    component.writeValue('+34612345678');
    expect(component.selectedCountry.iso2).toBe('ES');
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

  it('updates country to Spain and emits +34612345678 when pasting +34 612 345 678 into empty DR-default field', () => {
    let emitted = '';
    component.valueChange.subscribe((val) => (emitted = val));

    const pasteEvent = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: vi.fn().mockReturnValue('+34 612 345 678'),
      },
    } as any;

    component.onPaste(pasteEvent);

    expect(pasteEvent.preventDefault).toHaveBeenCalled();
    expect(component.selectedCountry.iso2).toBe('ES');
    expect(component.nationalNumber).toBe('612345678');
    expect(emitted).toBe('+34612345678');
  });

  it('detects 00 international prefix when pasting 0034 612 345 678 and emits +34612345678', () => {
    let emitted = '';
    component.valueChange.subscribe((val) => (emitted = val));

    const pasteEvent = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: vi.fn().mockReturnValue('0034 612 345 678'),
      },
    } as any;

    component.onPaste(pasteEvent);

    expect(pasteEvent.preventDefault).toHaveBeenCalled();
    expect(component.selectedCountry.iso2).toBe('ES');
    expect(component.nationalNumber).toBe('612345678');
    expect(emitted).toBe('+34612345678');
  });

  it('selects OTHER and preserves raw international number without prepending +1 when pasting unsupported country (+81)', () => {
    let emitted = '';
    component.valueChange.subscribe((val) => (emitted = val));

    const pasteEvent = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: vi.fn().mockReturnValue('+81 90 1234 5678'),
      },
    } as any;

    component.onPaste(pasteEvent);

    expect(pasteEvent.preventDefault).toHaveBeenCalled();
    expect(component.selectedCountry.iso2).toBe('OTHER');
    expect(component.nationalNumber).toBe('819012345678');
    expect(emitted).toBe('+819012345678');
  });

  it('auto-detects international prefix when typed or changed directly via onNationalNumberChange', () => {
    let emitted = '';
    component.valueChange.subscribe((val) => (emitted = val));

    component.onNationalNumberChange('+34 612 345 678');

    expect(component.selectedCountry.iso2).toBe('ES');
    expect(component.nationalNumber).toBe('612345678');
    expect(emitted).toBe('+34612345678');
  });
});
