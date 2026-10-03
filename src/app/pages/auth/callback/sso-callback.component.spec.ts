import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { SsoCallbackComponent } from './sso-callback.component';
import { AuthService } from '../../../core/services/auth.service';
import { ActivatedRoute, Router } from '@angular/router';

describe('SsoCallbackComponent', () => {
  let component: SsoCallbackComponent;
  let fixture: ComponentFixture<SsoCallbackComponent>;
  let authServiceSpy: any;
  let routerSpy: any;
  let queryParamsMock: Record<string, string>;

  beforeEach(async () => {
    queryParamsMock = {};

    authServiceSpy = {
      handleSsoTokens: vi.fn(),
      restoreSession: vi.fn(),
    };

    routerSpy = {
      navigate: vi.fn().mockResolvedValue(true),
      navigateByUrl: vi.fn().mockResolvedValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [SsoCallbackComponent],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParams: queryParamsMock,
            },
          },
        },
      ],
    }).compileComponents();
  });

  const createComponent = () => {
    fixture = TestBed.createComponent(SsoCallbackComponent);
    component = fixture.componentInstance;
  };

  it('should create the sso callback component', () => {
    createComponent();
    expect(component).toBeTruthy();
  });

  it('should redirect to /login with error param if error parameter is present', async () => {
    queryParamsMock['error'] = 'access_denied';
    createComponent();

    await component.ngOnInit();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { error: 'access_denied' },
    });
    expect(authServiceSpy.handleSsoTokens).not.toHaveBeenCalled();
    expect(authServiceSpy.restoreSession).not.toHaveBeenCalled();
  });

  it('should ingest tokens from query params and route linked provider to /app/overview', async () => {
    queryParamsMock['access_token'] = 'test_access_token_123';
    queryParamsMock['refresh_token'] = 'test_refresh_token_456';
    queryParamsMock['expires'] = '3600';

    authServiceSpy.handleSsoTokens.mockResolvedValue({
      id: 'usr-1',
      email: 'owner@beachbar.com',
      provider_link: { id: 'prov-1', name: 'Las Terrenas Beach Bar' },
    });

    createComponent();
    await component.ngOnInit();

    expect(authServiceSpy.handleSsoTokens).toHaveBeenCalledWith('test_access_token_123', 'test_refresh_token_456', 3600);
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/app/overview');
  });

  it('should ingest tokens and route linked provider to preserved returnUrl from sessionStorage', async () => {
    queryParamsMock['access_token'] = 'test_access_token_123';

    authServiceSpy.handleSsoTokens.mockResolvedValue({
      id: 'usr-1',
      email: 'owner@beachbar.com',
      provider_link: { id: 'prov-1', name: 'Las Terrenas Beach Bar' },
    });

    sessionStorage.setItem('vamo_auth_return_url', '/app/listings/create');

    createComponent();
    await component.ngOnInit();

    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/app/listings/create');
    expect(sessionStorage.getItem('vamo_auth_return_url')).toBeNull();
  });

  it('should ingest tokens and route unlinked account to /no-business', async () => {
    queryParamsMock['access_token'] = 'test_access_token_no_biz';

    authServiceSpy.handleSsoTokens.mockResolvedValue({
      id: 'usr-consumer',
      email: 'traveler@gmail.com',
      provider_link: null,
    });

    createComponent();
    await component.ngOnInit();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/no-business']);
  });

  it('should redirect to /login with sso_failed if no session is returned', async () => {
    queryParamsMock['access_token'] = 'invalid_tok';
    authServiceSpy.handleSsoTokens.mockResolvedValue(null);

    createComponent();
    await component.ngOnInit();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { error: 'sso_failed' },
    });
  });

  it('should show error banner when handleSsoTokens throws an exception', async () => {
    queryParamsMock['access_token'] = 'error_tok';
    authServiceSpy.handleSsoTokens.mockRejectedValue(new Error('Network error during callback'));

    createComponent();
    await component.ngOnInit();
    fixture.detectChanges();

    expect(component.errorMessage).toContain('Could not verify your authentication session');
    const errorEl = fixture.nativeElement.querySelector('.error-msg');
    expect(errorEl).toBeTruthy();
    expect(errorEl.textContent).toContain('Could not verify your authentication session');
  });

  it('should allow user to return to login if callback fails', async () => {
    createComponent();
    component.errorMessage = 'Some failure';
    fixture.detectChanges();

    const returnBtn = fixture.nativeElement.querySelector('.btn-return') as HTMLButtonElement;
    expect(returnBtn).toBeTruthy();

    await component.returnToLogin();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
  });
});
