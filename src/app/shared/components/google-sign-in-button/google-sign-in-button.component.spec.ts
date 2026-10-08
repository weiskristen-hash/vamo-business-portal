import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GoogleSignInButtonComponent } from './google-sign-in-button.component';
import { GoogleAuthService } from '../../../core/services/google-auth.service';
import { I18nService } from '../../../core/i18n/i18n.service';

describe('GoogleSignInButtonComponent', () => {
  let fixture: ComponentFixture<GoogleSignInButtonComponent>;
  let google: { loadGoogleScript: ReturnType<typeof vi.fn>; renderButton: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    google = { loadGoogleScript: vi.fn().mockResolvedValue(undefined), renderButton: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [GoogleSignInButtonComponent],
      providers: [{ provide: GoogleAuthService, useValue: google }],
    }).compileComponents();
    TestBed.inject(I18nService).setLang('en');
    fixture = TestBed.createComponent(GoogleSignInButtonComponent);
  });

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('renders the explicit Google button and forwards a credential', async () => {
    const received = vi.fn();
    fixture.componentInstance.credential.subscribe(received);
    await render();
    expect(google.renderButton).toHaveBeenCalled();
    const [, onCredential, , options] = google.renderButton.mock.calls.at(-1)!;
    expect(options).toMatchObject({ locale: 'en', text: 'continue_with' });
    onCredential('mock-google-credential');
    expect(received).toHaveBeenCalledWith('mock-google-credential');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('re-renders Google with the selected Spanish locale', async () => {
    await render();
    TestBed.inject(I18nService).setLang('es');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(google.renderButton.mock.calls.at(-1)![3].locale).toBe('es');
  });

  it('blocks further Google credentials while the parent is busy', async () => {
    const received = vi.fn();
    fixture.componentInstance.credential.subscribe(received);
    await render();
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    google.renderButton.mock.calls.at(-1)![1]('second-credential');
    expect(received).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[inert]')).toBeTruthy();
  });

  it('keeps a localized fallback when the Google script cannot load', async () => {
    google.loadGoogleScript.mockRejectedValue(new Error('GOOGLE_SDK_UNAVAILABLE'));
    const clicked = vi.fn();
    fixture.componentInstance.fallback.subscribe(clicked);
    await render();
    fixture.nativeElement.querySelector('button').click();
    expect(clicked).toHaveBeenCalledOnce();
    expect(google.renderButton).not.toHaveBeenCalled();
  });

  it('does not render or emit credentials after its onboarding step is destroyed', async () => {
    await render();
    const onCredential = google.renderButton.mock.calls.at(-1)![1];
    const received = vi.fn();
    fixture.componentInstance.credential.subscribe(received);
    fixture.destroy();
    onCredential('late-credential');
    expect(received).not.toHaveBeenCalled();
  });

  it('ignores a late script load after its onboarding step is destroyed', async () => {
    let resolve!: () => void;
    google.loadGoogleScript.mockImplementation(() => new Promise<void>((r) => { resolve = r; }));
    fixture.detectChanges();
    fixture.destroy();
    resolve();
    await Promise.resolve();
    expect(google.renderButton).not.toHaveBeenCalled();
  });
});
