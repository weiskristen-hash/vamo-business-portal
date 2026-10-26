import { TestBed } from '@angular/core/testing';
import { CustomerErrorService, VAMO_SUPPORT_EMAIL } from './customer-error.service';
import { I18nService } from '../i18n/i18n.service';

describe('CustomerErrorService', () => {
  let service: CustomerErrorService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CustomerErrorService, I18nService],
    });
    service = TestBed.inject(CustomerErrorService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Customer Error Categories', () => {
    it('should map save errors to customer-friendly text without internal details', () => {
      const err = new Error('Database transaction aborted at line 42');
      const msg = service.toCustomerMessage(err, 'save');

      expect(msg).toBe("We couldn't save your changes. Please try again.");
      expect(msg).not.toContain('Database');
      expect(msg).not.toContain('transaction');
      expect(msg).not.toContain('42');
    });

    it('should map load errors to customer-friendly refresh prompt', () => {
      const err = new Error('Failed to read collection events');
      const msg = service.toCustomerMessage(err, 'load');

      expect(msg).toBe("We couldn't load this information. Please refresh the page.");
      expect(msg).not.toContain('collection');
      expect(msg).not.toContain('events');
    });

    it('should map regular load errors to load category', () => {
      const err = new Error('Generic failure');
      const msg = service.toCustomerMessage(err, 'load');

      expect(msg).toBe("We couldn't load this information. Please refresh the page.");
    });

    it('should map upload errors to customer-friendly image upload message', () => {
      const err = new Error('S3 bucket write failed');
      const msg = service.toCustomerMessage(err, 'upload');

      expect(msg).toBe("We couldn't upload that image. Please try again.");
      expect(msg).not.toContain('S3');
    });

    it('should map delete errors to customer-friendly item removal message', () => {
      const err = new Error('Foreign key constraint violation');
      const msg = service.toCustomerMessage(err, 'delete');

      expect(msg).toBe("We couldn't remove this item. Please try again.");
      expect(msg).not.toContain('Foreign key');
    });

    it('should map network errors when OFFLINE or network failure occurs', () => {
      const err = new Error('OFFLINE');
      const msg = service.toCustomerMessage(err, 'save');

      expect(msg).toBe("We're having trouble connecting. Check your connection and try again.");
    });
  });

  describe('Automatic Category Detection from Directus Codes', () => {
    it('should detect TOKEN_EXPIRED and map to session expiry message', () => {
      const err = {
        errors: [{ extensions: { code: 'TOKEN_EXPIRED' } }],
      };
      const msg = service.toCustomerMessage(err, 'save');

      expect(msg).toBe('Your session has expired. Please sign in again.');
    });

    it('should detect FORBIDDEN code and map to safe permission message', () => {
      const err = {
        errors: [{ extensions: { code: 'FORBIDDEN' } }],
      };
      const msg = service.toCustomerMessage(err, 'save');

      expect(msg).toBe("We couldn't make that change. This action is not available for your account.");
    });

    it('should detect 401 HTTP status and map to auth session expiry', () => {
      const err = { status: 401, message: 'Unauthorized' };
      const msg = service.toCustomerMessage(err, 'save');

      expect(msg).toBe('Your session has expired. Please sign in again.');
    });
  });

  describe('Information Disclosure Prevention', () => {
    it('should NEVER leak Directus collection or field permission error text on save', () => {
      const directusRawError = new Error(
        "You don't have permission to access fields 'boost_expires_at', 'website' in collection 'events' or they do not exist. Queried in root."
      );

      const msg = service.toCustomerMessage(directusRawError, 'save');

      expect(msg).not.toContain('Directus');
      expect(msg).not.toContain('collection');
      expect(msg).not.toContain('events');
      expect(msg).not.toContain('boost_expires_at');
      expect(msg).not.toContain('website');
      expect(msg).not.toContain('Queried in root');
      expect(msg).not.toContain('permission');

      expect(msg).toBe("We couldn't make that change. This action is not available for your account.");
    });

    it('should return safe load message when permission or non-existent field error occurs during load', () => {
      const directusRawError = new Error(
        "You don't have permission to access field 'website' in collection 'providers' or it does not exist. Queried in root."
      );

      const msg = service.toCustomerMessage(directusRawError, 'load');

      expect(msg).not.toContain('Directus');
      expect(msg).not.toContain('collection');
      expect(msg).not.toContain('providers');
      expect(msg).not.toContain('website');
      expect(msg).not.toContain('Queried in root');
      expect(msg).not.toContain('permission');
      expect(msg).toBe("We couldn't load your business profile. Please refresh the page.");
    });

    it('should handle validation category with default message when no customValidationMessage is provided', () => {
      const detail = service.toCustomerError(null, 'validation');

      expect(detail.headline).toBe('Please check your information');
      expect(detail.message).toBe('Please fix the validation errors before saving.');
      expect(detail.actionText).toBe('Try Again');
      expect(detail.headline).not.toBe('Save failed');
      expect(detail.message).not.toBe("We couldn't save your changes. Please try again.");
    });

    it('should return localized validation message in Spanish when UI language is es', () => {
      const i18n = TestBed.inject(I18nService);
      i18n.setLang('es');

      const detail = service.toCustomerError(null, 'validation');
      expect(detail.headline).toBe('Por favor revisa tu información');
      expect(detail.message).toBe('Por favor corrige los errores antes de guardar.');
      expect(detail.actionText).toBe('Intentar de nuevo');

      i18n.setLang('en');
    });

    it('should sanitize technical leaks in custom validation messages and fallback to validation error message', () => {
      const leakyValidation = "Validation failed: collection 'providers' has invalid schema";
      const detail = service.toCustomerError(null, 'validation', leakyValidation);

      expect(detail.message).not.toContain('collection');
      expect(detail.message).not.toContain('schema');
      expect(detail.headline).toBe('Please check your information');
      expect(detail.message).toBe('Please fix the validation errors before saving.');
    });

    it('should allow legitimate user-facing validation messages', () => {
      const safeValidation = 'Please choose at least one photo before publishing.';
      const msg = service.toCustomerMessage(null, 'validation', safeValidation);

      expect(msg).toBe('Please choose at least one photo before publishing.');
    });

    it('should provide secondary support information with verified email', () => {
      const detail = service.toCustomerError(new Error('Network error'), 'network');

      expect(detail.secondaryMessage).toContain(VAMO_SUPPORT_EMAIL);
      expect(detail.actionText).toBe('Try Again');
    });

    it('should sanitize Stripe internals such as client_secret, payment_intent, and setup_intent', () => {
      const stripeLeak = new Error('Stripe error on client_secret seti_12345_secret_abcde with setup_intent failed');
      const detail = service.toCustomerError(stripeLeak, 'save');

      expect(detail.message).not.toContain('client_secret');
      expect(detail.message).not.toContain('setup_intent');
      expect(detail.message).not.toContain('seti_12345');
      expect(detail.message).toBe("We couldn't save your changes. Please try again.");
    });
  });

  describe('Localized Customer Error Messages', () => {
    it('returns Spanish customer-safe messages when UI language is es', () => {
      const i18n = TestBed.inject(I18nService);
      i18n.setLang('es');
      const err = new Error('Directus Network Error');
      const msg = service.toCustomerMessage(err, 'save');

      expect(msg).toBe('Tenemos problemas para conectar. Revisa tu conexión e intenta de nuevo.');
      expect(msg).not.toContain('Directus');
      expect(msg).not.toContain('Network');
      i18n.setLang('en');
    });

    it('returns Spanish load error message when UI language is es', () => {
      const i18n = TestBed.inject(I18nService);
      i18n.setLang('es');
      const err = new Error('SQL query failure');
      const msg = service.toCustomerMessage(err, 'load');

      expect(msg).toBe('No pudimos cargar esta información. Por favor actualiza la página.');
      expect(msg).not.toContain('SQL');
      i18n.setLang('en');
    });

    it('changes error messages dynamically when switching between languages', () => {
      const i18n = TestBed.inject(I18nService);
      const err = new Error('Save failure');

      i18n.setLang('en');
      expect(service.toCustomerMessage(err, 'save')).toBe("We couldn't save your changes. Please try again.");

      i18n.setLang('es');
      expect(service.toCustomerMessage(err, 'save')).toBe('No pudimos guardar tus cambios. Por favor intenta de nuevo.');

      i18n.setLang('en');
      expect(service.toCustomerMessage(err, 'save')).toBe("We couldn't save your changes. Please try again.");
    });
  });

  describe('Registration Error Classification', () => {
    it('should NOT return session expired message when HTTP 401 or INVALID_CREDENTIALS occurs during registration', () => {
      const i18n = TestBed.inject(I18nService);
      i18n.setLang('en');

      const err401 = { status: 401, message: 'Invalid user credentials.' };
      const msg401 = service.toCustomerMessage(err401, 'register');
      expect(msg401).toBe(
        "We couldn't complete registration with this email. If you already have a VAMO account, sign in or reset your password."
      );
      expect(msg401).not.toContain('session has expired');

      const errInvalidCreds = {
        errors: [{ extensions: { code: 'INVALID_CREDENTIALS' }, message: 'Invalid user credentials.' }],
      };
      const msgInvalidCreds = service.toCustomerMessage(errInvalidCreds, 'register');
      expect(msgInvalidCreds).toBe(
        "We couldn't complete registration with this email. If you already have a VAMO account, sign in or reset your password."
      );
      expect(msgInvalidCreds).not.toContain('session has expired');
    });

    it('should still return session expired message for genuine TOKEN_EXPIRED or 401 on authenticated actions', () => {
      const i18n = TestBed.inject(I18nService);
      i18n.setLang('en');

      const tokenExpired = { errors: [{ extensions: { code: 'TOKEN_EXPIRED' } }] };
      expect(service.toCustomerMessage(tokenExpired, 'save')).toBe('Your session has expired. Please sign in again.');
      expect(service.toCustomerMessage({ status: 401 }, 'save')).toBe('Your session has expired. Please sign in again.');
    });

    it('should classify RECORD_NOT_UNIQUE and duplicate email errors into duplicate-email message', () => {
      const i18n = TestBed.inject(I18nService);
      i18n.setLang('en');

      const err = {
        errors: [{ extensions: { code: 'RECORD_NOT_UNIQUE' }, message: 'Field "email" has to be unique.' }],
      };
      const detail = service.toCustomerError(err, 'register');
      expect(detail.headline).toBe('This email address is already registered.');
      expect(detail.message).toBe(
        'This email address is already registered. Already have a VAMO account? Sign in or reset your password.'
      );
      expect(detail.message).not.toContain('session has expired');
    });

    it('should classify registration validation errors (INVALID_PAYLOAD / HTTP 400) into register-validation message', () => {
      const i18n = TestBed.inject(I18nService);
      i18n.setLang('en');

      const err = {
        status: 400,
        errors: [{ extensions: { code: 'INVALID_PAYLOAD' }, message: 'Invalid payload.' }],
      };
      const msg = service.toCustomerMessage(err, 'register');
      expect(msg).toBe('Please check your registration details and try again.');
      expect(msg).not.toContain('session has expired');
    });

    it('should classify rejected verification_url INVALID_PAYLOAD into register-config message without leaking URL or Directus internals in EN and ES', () => {
      const i18n = TestBed.inject(I18nService);
      const err = {
        status: 400,
        errors: [
          {
            message: 'Invalid payload. URL "https://vamo-app.com/verify.html" can\'t be used to verify registered users.',
            extensions: {
              reason: 'URL "https://vamo-app.com/verify.html" can\'t be used to verify registered users',
              code: 'INVALID_PAYLOAD',
            },
          },
        ],
      };

      i18n.setLang('en');
      const enMsg = service.toCustomerMessage(err, 'register');
      expect(enMsg).toBe(
        'Account registration is temporarily unavailable due to a configuration issue. Please try again later.'
      );
      expect(enMsg).not.toContain('verify.html');
      expect(enMsg).not.toContain('Please check your registration details');

      i18n.setLang('es');
      const esMsg = service.toCustomerMessage(err, 'register');
      expect(esMsg).toBe(
        'El registro de cuentas no está disponible temporalmente debido a un problema de configuración. Por favor inténtalo más tarde.'
      );
      expect(esMsg).not.toContain('verify.html');
      i18n.setLang('en');
    });

    it('should classify post-registration login failures and email-verification required errors into clear EN and ES messages', () => {
      const i18n = TestBed.inject(I18nService);

      const postRegLoginErr = {
        message: 'Login timed out',
        isPostRegistrationLoginFailure: true,
      };
      const verifyEmailErr = {
        errors: [{ extensions: { code: 'UNVERIFIED_USER' }, message: 'Email not verified' }],
      };

      i18n.setLang('en');
      expect(service.toCustomerMessage(postRegLoginErr, 'register')).toBe(
        "Your account was created, but we couldn't sign you in automatically. Please sign in to continue."
      );
      expect(service.toCustomerMessage(verifyEmailErr, 'register')).toBe(
        'Your account has been created. Please check your inbox and verify your email address before signing in.'
      );

      i18n.setLang('es');
      expect(service.toCustomerMessage(postRegLoginErr, 'register')).toBe(
        'Tu cuenta fue creada, pero no pudimos iniciar sesión automáticamente. Por favor inicia sesión para continuar.'
      );
      expect(service.toCustomerMessage(verifyEmailErr, 'register')).toBe(
        'Tu cuenta ha sido creada. Por favor revisa tu bandeja de entrada y verifica tu correo electrónico antes de iniciar sesión.'
      );
      i18n.setLang('en');
    });

    it('should map unexpected Directus registration failure to safe registration error in EN and ES', () => {
      const i18n = TestBed.inject(I18nService);
      const err = new Error('Unexpected 500 server error during registration');

      i18n.setLang('en');
      expect(service.toCustomerMessage(err, 'register')).toBe(
        "We couldn't create your account right now. Please try again."
      );

      i18n.setLang('es');
      expect(service.toCustomerMessage(err, 'register')).toBe(
        'No pudimos crear tu cuenta en este momento. Por favor inténtalo de nuevo.'
      );
      expect(
        service.toCustomerMessage({ status: 401, message: 'Invalid user credentials.' }, 'register')
      ).toBe(
        'No pudimos completar el registro con este correo electrónico. Si ya tienes una cuenta de VAMO, inicia sesión o restablece tu contraseña.'
      );
      i18n.setLang('en');
    });
  });
});

