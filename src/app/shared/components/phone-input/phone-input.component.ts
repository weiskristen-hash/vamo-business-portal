import {
  Component,
  Input,
  Output,
  EventEmitter,
  forwardRef,
  inject,
  OnInit,
  OnChanges,
  SimpleChanges,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { COUNTRIES, CountryInfo, DEFAULT_COUNTRY, INTERNATIONAL_COUNTRY, parsePhone, formatE164 } from '../../../core/utils/phone';
import { I18nService } from '../../../core/i18n/i18n.service';

@Component({
  selector: 'app-phone-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PhoneInputComponent),
      multi: true,
    },
  ],
  template: `
    <div class="phone-input-container" [class.is-invalid]="isInvalid" [class.is-disabled]="disabled">
      <!-- Country Code Dropdown -->
      <div class="country-picker-wrap">
        <select
          [id]="id + '-country'"
          class="country-select"
          [disabled]="disabled"
          [ngModel]="selectedCountry.iso2"
          (ngModelChange)="onCountryChange($event)"
          [attr.aria-label]="isSpanish ? 'Código de país' : 'Country calling code'"
        >
          <option *ngFor="let c of countries" [value]="c.iso2">
            {{ c.flag }} {{ isSpanish ? c.nameEs : c.nameEn }} {{ c.dialCode ? '(+' + c.dialCode + ')' : '' }}
          </option>
        </select>
        <span class="country-display" aria-hidden="true">
          <span class="country-flag">{{ selectedCountry.flag }}</span>
          <span class="country-dial">{{ selectedCountry.dialCode ? '+' + selectedCountry.dialCode : '+' }}</span>
          <span class="dropdown-chevron">▼</span>
        </span>
      </div>

      <!-- National Phone Number Input -->
      <input
        type="tel"
        [id]="id"
        [name]="name"
        class="phone-national-input"
        [placeholder]="placeholder || selectedCountry.placeholder"
        [disabled]="disabled"
        [required]="required"
        [(ngModel)]="nationalNumber"
        (ngModelChange)="onNationalNumberChange($event)"
        (paste)="onPaste($event)"
        (blur)="onBlur()"
        autocomplete="tel-national"
      />
    </div>
  `,
  styles: [
    `
      .phone-input-container {
        display: flex;
        align-items: stretch;
        width: 100%;
        background: var(--vamo-surface, #ffffff);
        border: 1.5px solid var(--vamo-border, #cbd5e1);
        border-radius: var(--vamo-radius-md, 8px);
        overflow: hidden;
        transition: all 0.15s ease;
      }

      .phone-input-container:focus-within {
        border-color: var(--vamo-pink, #F93CAD);
        box-shadow: 0 0 0 3px rgba(249, 60, 173, 0.15);
      }

      .phone-input-container.is-invalid {
        border-color: #ef4444;
      }

      .phone-input-container.is-disabled {
        opacity: 0.6;
        cursor: not-allowed;
        background: #f1f5f9;
      }

      .country-picker-wrap {
        position: relative;
        display: flex;
        align-items: center;
        background: #f8fafc;
        border-right: 1.5px solid var(--vamo-border, #cbd5e1);
        flex-shrink: 0;
      }

      .country-select {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        opacity: 0;
        cursor: pointer;
        z-index: 2;
        font-size: 16px; /* Prevents auto-zoom on iOS */
      }

      .country-select:disabled {
        cursor: not-allowed;
      }

      .country-display {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 12px;
        height: 100%;
        font-size: 0.9rem;
        font-weight: 600;
        color: #334155;
        user-select: none;
        pointer-events: none;
      }

      .country-flag {
        font-size: 1.15rem;
        line-height: 1;
      }

      .country-dial {
        font-size: 0.88rem;
        color: #0f172a;
      }

      .dropdown-chevron {
        font-size: 0.6rem;
        color: #94a3b8;
        margin-left: 2px;
      }

      .phone-national-input {
        flex: 1;
        min-width: 0;
        border: none;
        outline: none;
        padding: 10px 14px;
        font-size: 0.95rem;
        color: var(--vamo-text, #0f172a);
        background: transparent;
        font-family: inherit;
      }

      .phone-national-input:disabled {
        cursor: not-allowed;
        color: #94a3b8;
      }

      .phone-national-input::placeholder {
        color: #94a3b8;
      }
    `,
  ],
})
export class PhoneInputComponent implements ControlValueAccessor, OnInit, OnChanges {
  private i18n = inject(I18nService);
  private cdr = inject(ChangeDetectorRef);

  @Input() id = 'phone-input';
  @Input() name = 'phone';
  @Input() placeholder = '';
  @Input() disabled = false;
  @Input() required = false;
  @Input() isInvalid = false;

  @Output() blurred = new EventEmitter<void>();
  @Output() valueChange = new EventEmitter<string>();

  countries: CountryInfo[] = [...COUNTRIES, INTERNATIONAL_COUNTRY];
  selectedCountry: CountryInfo = DEFAULT_COUNTRY;
  nationalNumber = '';

  private rawValue = '';
  private isUserEdited = false;

  get isSpanish(): boolean {
    return this.i18n.lang() === 'es';
  }

  private onChange: (val: string) => void = () => {};
  private onTouched: () => void = () => {};

  ngOnInit(): void {
    if (!this.rawValue) {
      this.selectedCountry = DEFAULT_COUNTRY;
      this.nationalNumber = '';
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['disabled']) {
      this.cdr.markForCheck();
    }
  }

  private lastEmittedValue: string | null = null;

  writeValue(value: string | null | undefined): void {
    this.rawValue = value ?? '';
    this.isUserEdited = false;
    // A form echo must preserve a manually chosen country with a shared dial code.
    if (this.lastEmittedValue !== null && value === this.lastEmittedValue) {
      this.cdr.markForCheck();
      return;
    }
    this.lastEmittedValue = null;

    if (!value || !value.trim()) {
      this.selectedCountry = DEFAULT_COUNTRY;
      this.nationalNumber = '';
      this.cdr.markForCheck();
      return;
    }

    const parsed = parsePhone(value);
    this.selectedCountry = parsed.country;
    this.nationalNumber = parsed.nationalNumber;
    this.cdr.markForCheck();
  }

  registerOnChange(fn: (val: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.cdr.markForCheck();
  }

  onCountryChange(iso2: string): void {
    const found = this.countries.find((c) => c.iso2 === iso2);
    if (!found) return;

    this.selectedCountry = found;
    this.isUserEdited = true;
    this.emitValue();
  }

  onNationalNumberChange(val: string): void {
    const trimmed = (val || '').trim();
    if (trimmed.startsWith('+') || trimmed.startsWith('00')) {
      const parsed = parsePhone(trimmed);
      this.selectedCountry = parsed.country;
      this.nationalNumber = parsed.nationalNumber;
      this.isUserEdited = true;
      this.emitValue();
      this.cdr.markForCheck();
      return;
    }

    this.nationalNumber = val;
    this.isUserEdited = true;
    this.emitValue();
  }

  onPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') || '';
    const trimmed = text.trim();
    if (trimmed.startsWith('+') || trimmed.startsWith('00')) {
      event.preventDefault();
      const parsed = parsePhone(trimmed);
      this.selectedCountry = parsed.country;
      this.nationalNumber = parsed.nationalNumber;
      this.isUserEdited = true;
      this.emitValue();
      this.cdr.markForCheck();
    }
  }

  onBlur(): void {
    this.onTouched();
    this.blurred.emit();
  }

  private emitValue(): void {
    if (!this.isUserEdited && this.rawValue) {
      // Preserve untouched legacy value
      return;
    }

    const digits = this.nationalNumber.replace(/\D/g, '');
    if (!digits) {
      this.lastEmittedValue = '';
      this.onChange('');
      this.valueChange.emit('');
      return;
    }

    const e164 = formatE164(this.selectedCountry, digits);
    this.lastEmittedValue = e164;
    this.onChange(e164);
    this.valueChange.emit(e164);
  }
}
