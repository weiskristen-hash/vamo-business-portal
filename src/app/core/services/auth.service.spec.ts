import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { Router } from '@angular/router';

describe('AuthService', () => {
  let service: AuthService;
  let routerSpy: any;

  beforeEach(() => {
    routerSpy = {
      navigate: vi.fn().mockResolvedValue(true),
    };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: Router, useValue: routerSpy },
      ],
    });

    service = TestBed.inject(AuthService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should clear session and navigate to /login on logout', async () => {
    await service.logout(true);

    expect(service.currentUser).toBeNull();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('should maintain an explicit sessionFields allowlist without wildcards', () => {
    const fields = service.sessionFields as readonly string[];
    expect(fields.includes('*')).toBe(false);
    expect(fields.includes('provider_link.*')).toBe(false);
    expect(fields.includes('provider_link.logo.*')).toBe(false);
    expect(fields.includes('provider_link.images.directus_files_id.*')).toBe(false);
    expect(fields.includes('id')).toBe(true);
    expect(fields.includes('first_name')).toBe(true);
    expect(fields.includes('last_name')).toBe(true);
    expect(fields.includes('email')).toBe(true);
    expect(fields.includes('provider_link.id')).toBe(true);
    expect(fields.includes('provider_link.name')).toBe(true);
    expect(fields.includes('provider_link.subscription_tier')).toBe(true);
  });

  it('should store returnUrl in sessionStorage and redirect to Directus auth endpoint in loginWithProvider', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    try {
      service.loginWithProvider('google', '/app/listings');
    } catch {
      // jsdom may throw on window.location.href assignment
    }

    expect(setItemSpy).toHaveBeenCalledWith('vamo_auth_return_url', '/app/listings');
    setItemSpy.mockRestore();
  });

  it('should ingest tokens, update user, and store session in handleSsoTokens', async () => {
    const mockUser = {
      id: 'usr-sso',
      first_name: 'Alex',
      last_name: 'Rivera',
      email: 'alex@vamo.com',
      provider_link: { id: 'prov-sso', name: 'SSO Bar', subscription_tier: 'free' },
    };

    vi.spyOn(service, 'loadCurrentUser').mockResolvedValue(mockUser as any);

    const user = await service.handleSsoTokens('mock_access_tok_123', 'mock_refresh_tok_456', 3600);

    expect(user.id).toBe('usr-sso');
    expect(service.currentUser?.email).toBe('alex@vamo.com');
  });
});
