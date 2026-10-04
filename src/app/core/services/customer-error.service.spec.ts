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

    it('should sanitize technical leaks in custom validation messages', () => {
      const leakyValidation = "Validation failed: collection 'providers' has invalid schema";
      const detail = service.toCustomerError(null, 'validation', leakyValidation);

      expect(detail.message).not.toContain('collection');
      expect(detail.message).not.toContain('schema');
      expect(detail.message).toBe("We couldn't save your changes. Please try again.");
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
});
