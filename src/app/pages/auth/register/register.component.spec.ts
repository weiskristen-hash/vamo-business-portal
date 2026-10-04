import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RegisterComponent } from './register.component';
import { AuthService } from '../../../core/services/auth.service';
import { CustomerErrorService } from '../../../core/services/customer-error.service';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../../environments/environment';

describe('RegisterComponent (Canonical Source Parity)', () => {
  let component: RegisterComponent;
  let fixture: ComponentFixture<RegisterComponent>;
  let authServiceSpy: any;
  let routerSpy: any;

  beforeEach(async () => {
    authServiceSpy = {
      register: vi.fn(),
      login: vi.fn(),
      loginWithProvider: vi.fn(),
    };

    routerSpy = {
      navigateByUrl: vi.fn().mockResolvedValue(true),
      navigate: vi.fn().mockResolvedValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [RegisterComponent, FormsModule],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParams: {} },
          },
        },
        CustomerErrorService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('1. should create the register component', () => {
    expect(component).toBeTruthy();
  });

  it('2. should initialize with empty fields, agreedToTerms true by default, and disabled submit button', () => {
    expect(component.firstName).toBe('');
    expect(component.lastName).toBe('');
    expect(component.email).toBe('');
    expect(component.password).toBe('');
    expect(component.confirmPassword).toBe('');
    expect(component.agreedToTerms).toBe(true);

    const submitBtn = fixture.nativeElement.querySelector('.submit-btn') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  it('3. should validate email format', () => {
    component.email = 'not-an-email';
    expect(component.isEmailValid()).toBe(false);

    component.email = 'valid.operator@domain.do';
    expect(component.isEmailValid()).toBe(true);
  });

  it('4. should require minimum password length of 6 and matching confirmation', () => {
    component.firstName = 'Maria';
    component.lastName = 'Gomez';
    component.email = 'maria@test.com';
    component.password = '12345';
    component.confirmPassword = '12345';
    expect(component.isFormValid()).toBe(false);

    component.password = '123456';
    component.confirmPassword = 'different';
    expect(component.isFormValid()).toBe(false);

    component.confirmPassword = '123456';
    expect(component.isFormValid()).toBe(true);
  });

  it('5. should require agreedToTerms = true', () => {
    component.firstName = 'Maria';
    component.lastName = 'Gomez';
    component.email = 'maria@test.com';
    component.password = '123456';
    component.confirmPassword = '123456';
    component.agreedToTerms = false;
    expect(component.isFormValid()).toBe(false);

    component.agreedToTerms = true;
    expect(component.isFormValid()).toBe(true);
  });

  it('6. should submit valid registration, log in, and route to /app/overview when user has linked business', async () => {
    authServiceSpy.register.mockResolvedValue(undefined);
    authServiceSpy.login.mockResolvedValue({
      id: 'usr-1',
      email: 'owner@resort.com',
      provider_link: { id: 'prov-1', name: 'Cabarete Surf Resort' },
    });

    component.firstName = 'Carlos';
    component.lastName = 'Mendoza';
    component.email = 'owner@resort.com';
    component.password = 'secret123';
    component.confirmPassword = 'secret123';
    component.agreedToTerms = true;

    await component.onSubmit();

    expect(authServiceSpy.register).toHaveBeenCalledWith({
      first_name: 'Carlos',
      last_name: 'Mendoza',
      email: 'owner@resort.com',
      password: 'secret123',
    });
    expect(authServiceSpy.login).toHaveBeenCalledWith('owner@resort.com', 'secret123');
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/app/overview');
    expect(component.loading).toBe(false);
  });

  it('7. should submit valid registration, log in, and route to /no-business when user has no linked business', async () => {
    authServiceSpy.register.mockResolvedValue(undefined);
    authServiceSpy.login.mockResolvedValue({
      id: 'usr-2',
      email: 'user@gmail.com',
      provider_link: null,
    });

    component.firstName = 'Ana';
    component.lastName = 'Reyes';
    component.email = 'user@gmail.com';
    component.password = 'secret123';
    component.confirmPassword = 'secret123';
    component.agreedToTerms = true;

    await component.onSubmit();

    expect(authServiceSpy.register).toHaveBeenCalled();
    expect(authServiceSpy.login).toHaveBeenCalled();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/no-business']);
  });

  it('8. should show duplicate email warning and login link when email is already taken', async () => {
    authServiceSpy.register.mockRejectedValue({
      errors: [{ extensions: { code: 'RECORD_NOT_UNIQUE' }, message: 'Email already taken' }],
    });

    component.firstName = 'Carlos';
    component.lastName = 'Mendoza';
    component.email = 'existing@resort.com';
    component.password = 'secret123';
    component.confirmPassword = 'secret123';

    await component.onSubmit();
    fixture.detectChanges();

    expect(component.emailTaken).toBe(true);
    const warning = fixture.nativeElement.querySelector('.alert-warning');
    expect(warning).toBeTruthy();
    expect(warning.textContent).toContain('This email address is already registered');
    expect(component.loading).toBe(false);
  });

  it('9. should display customer-safe error banner without technical Directus leaks on unexpected failure', async () => {
    authServiceSpy.register.mockRejectedValue(new Error('Directus database connection refused'));

    component.firstName = 'Carlos';
    component.lastName = 'Mendoza';
    component.email = 'carlos@test.com';
    component.password = 'secret123';
    component.confirmPassword = 'secret123';

    await component.onSubmit();
    fixture.detectChanges();

    expect(component.errorMessage).toBeTruthy();
    expect(component.errorMessage.toLowerCase()).not.toContain('directus');
    expect(component.errorMessage.toLowerCase()).not.toContain('database');
    expect(component.loading).toBe(false);
  });

  it('10. should trigger Google sign-up flow via authService.loginWithProvider', () => {
    component.onGoogleSignUp();
    expect(authServiceSpy.loginWithProvider).toHaveBeenCalledWith('google', '/app/overview');
  });

  it('11. should not render Apple action button while preserving component Apple sign-up method and Google action', () => {
    expect(fixture.nativeElement.querySelector('.apple-btn')).toBeNull();
    expect(fixture.nativeElement.querySelector('.google-btn')).toBeTruthy();

    component.onAppleSignUp();
    expect(authServiceSpy.loginWithProvider).toHaveBeenCalledWith('apple', '/app/overview');
  });

  it('12. should toggle password and confirmPassword visibility flags', () => {
    expect(component.showPassword).toBe(false);
    component.togglePasswordVisibility();
    expect(component.showPassword).toBe(true);
    component.togglePasswordVisibility();
    expect(component.showPassword).toBe(false);

    expect(component.showConfirmPassword).toBe(false);
    component.toggleConfirmPasswordVisibility();
    expect(component.showConfirmPassword).toBe(true);
    component.toggleConfirmPasswordVisibility();
    expect(component.showConfirmPassword).toBe(false);
  });
});
