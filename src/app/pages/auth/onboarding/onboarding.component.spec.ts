import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OnboardingComponent } from './onboarding.component';
import { AuthService } from '../../../core/services/auth.service';
import { GoogleAuthService } from '../../../core/services/google-auth.service';
import { BusinessService } from '../../../core/services/business.service';
import { CustomerErrorService } from '../../../core/services/customer-error.service';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { Area } from '../../../core/models/event.model';

describe('OnboardingComponent (Canonical Source Parity)', () => {
  let component: OnboardingComponent;
  let fixture: ComponentFixture<OnboardingComponent>;
  let authServiceSpy: any;
  let businessServiceSpy: any;
  let routerSpy: any;
  let userSubject: BehaviorSubject<any>;

  const mockAreas: Area[] = [
    {
      id: 'area-lt',
      name: 'Las Terrenas/Samana',
      slug: 'las_terrenas',
      emoji: '🏖️',
      latitude: 19.31,
      longitude: -69.5444,
    },
    {
      id: 'area-pc',
      name: 'Punta Cana',
      slug: 'punta_cana',
      emoji: '🌴',
      latitude: 18.5622,
      longitude: -68.4044,
    },
  ];

  beforeEach(async () => {
    userSubject = new BehaviorSubject<any>(null);

    authServiceSpy = {
      userSubject,
      get currentUser() {
        return userSubject.getValue();
      },
      register: vi.fn().mockResolvedValue(undefined),
      login: vi.fn(),
      createProviderAndLink: vi.fn().mockResolvedValue(undefined),
      loginWithProvider: vi.fn(),
      loginWithGoogle: vi.fn().mockResolvedValue({ id: 'google-user', first_name: 'Mateo', last_name: 'Peralta', email: 'mateo@google.com', provider_link: null }),
      loginWithGoogleCredential: vi.fn().mockResolvedValue({ id: 'google-user', first_name: 'Mateo', last_name: 'Peralta', email: 'mateo@google.com', provider_link: null }),
    };

    businessServiceSpy = {
      getAreas: vi.fn().mockResolvedValue(mockAreas),
    };

    routerSpy = {
      navigate: vi.fn().mockResolvedValue(true),
      navigateByUrl: vi.fn().mockResolvedValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [OnboardingComponent],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: GoogleAuthService, useValue: { loadGoogleScript: vi.fn().mockRejectedValue(new Error('GOOGLE_SDK_UNAVAILABLE')), renderButton: vi.fn() } },
        { provide: BusinessService, useValue: businessServiceSpy },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: vi.fn().mockReturnValue(null),
              },
            },
          },
        },
        CustomerErrorService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OnboardingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('1. starts directly on the first business pitch with loaded areas', () => {
    expect(component).toBeTruthy();
    expect(component.currentStep()).toBe('business-pitch');
    expect(component.areas().length).toBe(2);
    expect(businessServiceSpy.getAreas).toHaveBeenCalled();
  });

  it('2. requestLocation detects nearest area within Dominican Republic radius (<=300km)', async () => {
    // Mock navigator.geolocation in Las Terrenas
    const mockGeolocation = {
      getCurrentPosition: vi.fn().mockImplementation((success) =>
        success({
          coords: {
            latitude: 19.32,
            longitude: -69.54,
          },
        })
      ),
    };
    vi.stubGlobal('navigator', { geolocation: mockGeolocation });

    await component.requestLocation();

    expect(component.nearestArea()?.id).toBe('area-lt');
    expect(component.selectedArea()?.id).toBe('area-lt');
    expect(component.notInDR()).toBe(false);
    expect(component.currentStep()).toBe('area');

    vi.unstubAllGlobals();
  });

  it('3. requestLocation sets notInDR = true when location is > 300km from any DR area', async () => {
    // Mock navigator.geolocation in New York (lat: 40.71, lon: -74.00)
    const mockGeolocation = {
      getCurrentPosition: vi.fn().mockImplementation((success) =>
        success({
          coords: {
            latitude: 40.7128,
            longitude: -74.006,
          },
        })
      ),
    };
    vi.stubGlobal('navigator', { geolocation: mockGeolocation });

    await component.requestLocation();

    expect(component.notInDR()).toBe(true);
    expect(component.nearestArea()).toBeNull();
    expect(component.currentStep()).toBe('area');

    vi.unstubAllGlobals();
  });

  it('4. does not allow business details until an area is selected', () => {
    component.currentStep.set('area');
    component.isLoggedInUser.set(true);
    component.continueFromArea();
    expect(component.currentStep()).toBe('area');
    expect(component.isBusinessFormValid()).toBe(false);
  });

  it('5. area selection continues directly to business details for an authenticated new user', () => {
    component.isLoggedInUser.set(true);
    component.selectArea(mockAreas[1]);
    component.continueFromArea();
    expect(component.selectedArea()?.id).toBe('area-pc');
    expect(component.currentStep()).toBe('business-details');
  });

  it('6. presents the business pitch without an explore or consumer registration choice', () => {
    expect(component.pitchSlide()).toBe(0);
    expect(fixture.nativeElement.querySelector('.ob-step--pitch')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.ob-step--intent')).toBeNull();
    expect(fixture.nativeElement.querySelector('.ob-step--location')).toBeNull();
    expect(fixture.nativeElement.querySelector('.ob-step--browse')).toBeNull();
  });

  it('7. pitch slides advance sequentially (0 -> 1 -> 2 -> business-register)', () => {
    component.currentStep.set('business-pitch');
    component.pitchSlide.set(0);

    component.nextPitchSlide();
    expect(component.pitchSlide()).toBe(1);

    component.nextPitchSlide();
    expect(component.pitchSlide()).toBe(2);

    component.nextPitchSlide();
    expect(component.currentStep()).toBe('business-register');
  });

  it('8. back navigation stays within the business flow and exits to login from the first pitch', () => {
    component.currentStep.set('business-register');
    component.goBack();
    expect(component.currentStep()).toBe('business-pitch');
    expect(component.pitchSlide()).toBe(2);
    component.goBack();
    expect(component.pitchSlide()).toBe(1);
    component.goBack();
    expect(component.pitchSlide()).toBe(0);
    component.goBack();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login'], { replaceUrl: true });
    component.currentStep.set('business-details');
    component.goBack();
    expect(component.currentStep()).toBe('area');
    component.goBack();
    expect(component.currentStep()).toBe('business-pitch');
    expect(component.pitchSlide()).toBe(2);
  });

  it('9. cancelOnboarding redirects to /login for guest user', async () => {
    await component.cancelOnboarding();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login'], { replaceUrl: true });
  });

  it('10. user form validation validates names, email format, password minlength 6, confirmation match, and terms', () => {
    component.firstName = '';
    component.lastName = '';
    component.email = 'not-an-email';
    component.password = '123';
    component.confirmPassword = '456';
    component.agreedToTerms = false;
    expect(component.isUserFormValid()).toBe(false);

    component.firstName = 'Elena';
    component.lastName = 'Gomez';
    component.email = 'elena@vamo.do';
    component.password = 'pass123';
    component.confirmPassword = 'pass123';
    component.agreedToTerms = true;
    expect(component.isUserFormValid()).toBe(true);
  });

  it('11. email registration collects an area before proceeding to business details', async () => {
    authServiceSpy.login.mockResolvedValueOnce({
      id: 'usr-browse',
      provider_link: null,
    });

    component.firstName = 'Elena';
    component.lastName = 'Gomez';
    component.email = 'elena@consumer.do';
    component.password = 'pass123';
    component.confirmPassword = 'pass123';
    component.agreedToTerms = true;

    await component.registerBusinessUser();

    expect(authServiceSpy.register).toHaveBeenCalledWith({
      first_name: 'Elena',
      last_name: 'Gomez',
      email: 'elena@consumer.do',
      password: 'pass123',
    });
    expect(authServiceSpy.login).toHaveBeenCalledWith('elena@consumer.do', 'pass123');
    expect(component.currentStep()).toBe('area');
    expect(component.isLoggedInUser()).toBe(true);
    expect(routerSpy.navigate).not.toHaveBeenCalled();
    expect(authServiceSpy.createProviderAndLink).not.toHaveBeenCalled();
  });

  it('12. registerBusinessUser registers, logs in, and advances to business-details', async () => {
    authServiceSpy.login.mockResolvedValueOnce({
      id: 'usr-biz',
      email: 'owner@resort.do',
    });

    component.firstName = 'Marco';
    component.lastName = 'Diaz';
    component.email = 'owner@resort.do';
    component.password = 'secret123';
    component.confirmPassword = 'secret123';
    component.agreedToTerms = true;

    component.selectedArea.set(mockAreas[0]);
    await component.registerBusinessUser();

    expect(authServiceSpy.register).toHaveBeenCalled();
    expect(authServiceSpy.login).toHaveBeenCalledWith('owner@resort.do', 'secret123');
    expect(component.currentStep()).toBe('business-details');
  });

  it('13. business form validation requires name, type, >=20 char description, valid phone, and address', () => {
    component.selectedArea.set(mockAreas[0]);
    component.businessName = 'Playa Grill';
    component.businessType = 'restaurant';
    component.businessDescription = 'Too short'; // < 20 chars
    component.businessPhone = '123'; // invalid
    component.businessAddress = 'Playa Bonita';
    expect(component.isBusinessFormValid()).toBe(false);

    component.businessDescription = 'Authentic Caribbean seafood right on the beachfront.';
    component.businessPhone = '+1 809-555-0199';
    expect(component.isBusinessFormValid()).toBe(true);
  });

  it('14. submitBusinessDetails builds canonical provider payload and routes to /app/listings/create', async () => {
    component.selectedArea.set(mockAreas[0]);
    component.email = 'owner@playagrill.do';
    component.businessName = 'Playa Grill';
    component.businessType = 'restaurant_and_bar';
    component.businessDescription = 'Authentic Caribbean seafood and fresh cocktails on the beach.';
    component.businessPhone = '+1 809-555-0199';
    component.waNumberSameAsPhone = true;
    component.businessAddress = 'Playa Bonita #42';

    await component.submitBusinessDetails();

    expect(authServiceSpy.createProviderAndLink).toHaveBeenCalledWith({
      name: 'Playa Grill',
      business_type: 'restaurant_and_bar',
      description: 'Authentic Caribbean seafood and fresh cocktails on the beach.',
      phone: '+1 809-555-0199',
      wa_number: '+1 809-555-0199',
      email: 'owner@playagrill.do',
      address: 'Playa Bonita #42',
      city: 'Las Terrenas/Samana',
      area: 'area-lt',
      location: {
        type: 'Point',
        coordinates: [-69.5444, 19.31],
      },
      status: 'published',
    });

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/app/listings/create'], { replaceUrl: true });
  });

  it('15. Google signup avoids hosted OAuth and keeps Apple hidden in business registration', async () => {
    component.currentStep.set('business-register');
    fixture.detectChanges();
    await component.onGoogleSignUp();
    expect(authServiceSpy.loginWithGoogle).toHaveBeenCalledOnce();
    expect(authServiceSpy.loginWithProvider).not.toHaveBeenCalled();
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('.ob-social-row button')) as HTMLButtonElement[];
    expect(buttons.some((b) => b.textContent?.includes('Apple'))).toBe(false);
    expect(buttons.some((b) => b.textContent?.includes('Google'))).toBe(true);
    component.onAppleSignUp();
    expect(authServiceSpy.loginWithProvider).toHaveBeenCalledWith('apple', '/app/listings/create');
  });

  it('16. progress dots match pitch, account, area, and business details', () => {
    expect(component.progressDots.length).toBe(4);
    expect(component.progressDots.filter((d) => d.active).length).toBe(1);
    component.currentStep.set('business-register');
    expect(component.progressDots.filter((d) => d.active).length).toBe(2);
    component.currentStep.set('area');
    expect(component.progressDots.filter((d) => d.active).length).toBe(3);
    component.currentStep.set('business-details');
    expect(component.progressDots.every((d) => d.active)).toBe(true);
  });

  it('17. Google popup resumes business details with the selected area and authenticated profile', async () => {
    component.selectedArea.set(mockAreas[1]);
    component.businessName = 'Existing form value';
    component.currentStep.set('business-register');
    await component.onGoogleCredentialSuccess('mock-google-credential');
    expect(authServiceSpy.loginWithGoogleCredential).toHaveBeenCalledWith('mock-google-credential');
    expect(authServiceSpy.loginWithProvider).not.toHaveBeenCalled();
    expect(component.currentStep()).toBe('business-details');
    expect(component.selectedArea()).toEqual(mockAreas[1]);
    expect(component.businessName).toBe('Existing form value');
    expect(component.email).toBe('mateo@google.com');
    expect(component.isLoggedInUser()).toBe(true);
    expect(authServiceSpy.createProviderAndLink).not.toHaveBeenCalled();
    expect(routerSpy.navigate).not.toHaveBeenCalled();
    expect(component.loading()).toBe(false);
  });

  it('Google signup routes a linked business to overview without creating another business', async () => {
    authServiceSpy.loginWithGoogleCredential.mockResolvedValue({ id: 'owner', provider_link: { id: 'provider' } });
    await component.onGoogleCredentialSuccess('credential');
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/app/overview');
    expect(authServiceSpy.createProviderAndLink).not.toHaveBeenCalled();
  });

  it('Google signup asks for an area when a new business user has not chosen one', async () => {
    component.currentStep.set('business-register');
    await component.onGoogleCredentialSuccess('credential');
    expect(component.currentStep()).toBe('area');
    expect(component.isLoggedInUser()).toBe(true);
    component.selectArea(mockAreas[0]);
    component.continueFromArea();
    expect(component.currentStep()).toBe('business-details');
    expect(authServiceSpy.createProviderAndLink).not.toHaveBeenCalled();
    expect(routerSpy.navigate).not.toHaveBeenCalled();
  });

  it.each(['GOOGLE_POPUP_CLOSED', 'GOOGLE_SDK_UNAVAILABLE', 'GOOGLE_FLOW_FAILED_500'])('Google %s failure preserves the onboarding step and area', async (message) => {
    component.currentStep.set('business-register');
    component.selectedArea.set(mockAreas[0]);
    authServiceSpy.loginWithGoogleCredential.mockRejectedValue(new Error(message));
    await component.onGoogleCredentialSuccess('credential');
    expect(component.currentStep()).toBe('business-register');
    expect(component.selectedArea()).toEqual(mockAreas[0]);
    expect(component.loading()).toBe(false);
    expect(component.errorMessage()).toBeTruthy();
    expect(component.errorMessage()).not.toContain(message);
    expect(routerSpy.navigate).not.toHaveBeenCalled();
    expect(authServiceSpy.createProviderAndLink).not.toHaveBeenCalled();
  });

  it('ignores a repeated Google credential while authentication is in progress', async () => {
    let resolve!: (user: any) => void;
    authServiceSpy.loginWithGoogleCredential.mockImplementation(() => new Promise((r) => { resolve = r; }));
    const first = component.onGoogleCredentialSuccess('first');
    await component.onGoogleCredentialSuccess('second');
    expect(authServiceSpy.loginWithGoogleCredential).toHaveBeenCalledOnce();
    resolve({ id: 'user', provider_link: null });
    await first;
    expect(component.loading()).toBe(false);
  });

  it('18. ngOnInit resumes business onboarding at business-details step when social=business query param is present', async () => {
    const route = TestBed.inject(ActivatedRoute);
    (route.snapshot as any).queryParamMap = {
      get: (key: string) => (key === 'social' ? 'business' : null),
    };
    const mockGoogleUser = {
      id: 'usr-google',
      first_name: 'Mateo',
      last_name: 'Peralta',
      email: 'mateo@google.com',
      provider_link: null,
    };
    userSubject.next(mockGoogleUser);
    authServiceSpy.waitForInitialAuth = vi.fn().mockResolvedValue(mockGoogleUser);
    sessionStorage.setItem('ob_area', JSON.stringify({
      id: 'area-lt',
      name: 'Las Terrenas/Samana',
      emoji: '🌴',
      latitude: 19.31,
      longitude: -69.5444,
    }));

    const fixtureNew = TestBed.createComponent(OnboardingComponent);
    const compNew = fixtureNew.componentInstance;
    await compNew.ngOnInit();

    expect(compNew.currentStep()).toBe('business-details');
    expect(compNew.firstName).toBe('Mateo');
    expect(compNew.lastName).toBe('Peralta');
    expect(compNew.email).toBe('mateo@google.com');
    expect(compNew.selectedArea()?.id).toBe('area-lt');
  });
  it('an authenticated user without a business resumes at area selection without another account form', async () => {
    userSubject.next({ id: 'existing-user', email: 'existing@vamo.do', provider_link: null });
    const resumed = TestBed.createComponent(OnboardingComponent).componentInstance;
    await resumed.ngOnInit();
    expect(resumed.currentStep()).toBe('area');
    expect(resumed.email).toBe('existing@vamo.do');
    expect(authServiceSpy.register).not.toHaveBeenCalled();
  });

  it('an authenticated business user goes to overview instead of creating another business', async () => {
    userSubject.next({ id: 'owner', provider_link: { id: 'provider' } });
    const resumed = TestBed.createComponent(OnboardingComponent).componentInstance;
    await resumed.ngOnInit();
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/app/overview');
    expect(authServiceSpy.createProviderAndLink).not.toHaveBeenCalled();
  });

  it('an authenticated user going back from area can return without being asked to register again', () => {
    component.isLoggedInUser.set(true);
    component.currentStep.set('area');
    component.goBack();
    component.nextPitchSlide();
    expect(component.currentStep()).toBe('area');
    expect(authServiceSpy.register).not.toHaveBeenCalled();
  });

  it('opens business-register step directly when route is /register', async () => {
    const route = TestBed.inject(ActivatedRoute);
    (route.snapshot as any).routeConfig = { path: 'register' };
    (route.snapshot as any).queryParamMap = { get: () => null };

    const regComp = TestBed.createComponent(OnboardingComponent).componentInstance;
    await regComp.ngOnInit();

    expect(regComp.currentStep()).toBe('business-register');
    expect(regComp.isDirectEntry()).toBe(true);
  });

  it('opens business-register step directly when step=register query param is present', async () => {
    const route = TestBed.inject(ActivatedRoute);
    (route.snapshot as any).routeConfig = { path: 'onboarding' };
    (route.snapshot as any).queryParamMap = {
      get: (key: string) => (key === 'step' ? 'register' : null),
    };

    const regComp = TestBed.createComponent(OnboardingComponent).componentInstance;
    await regComp.ngOnInit();

    expect(regComp.currentStep()).toBe('business-register');
    expect(regComp.isDirectEntry()).toBe(true);
  });

  it('navigates to /login when clicking goBack on business-register if entered directly', async () => {
    const route = TestBed.inject(ActivatedRoute);
    (route.snapshot as any).routeConfig = { path: 'register' };
    (route.snapshot as any).queryParamMap = { get: () => null };

    const regComp = TestBed.createComponent(OnboardingComponent).componentInstance;
    await regComp.ngOnInit();

    regComp.goBack();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login'], { replaceUrl: true });
  });

  it('navigates to /login when clicking cancelOnboarding on business-register', async () => {
    const route = TestBed.inject(ActivatedRoute);
    (route.snapshot as any).routeConfig = { path: 'register' };
    (route.snapshot as any).queryParamMap = { get: () => null };

    const regComp = TestBed.createComponent(OnboardingComponent).componentInstance;
    await regComp.ngOnInit();

    await regComp.cancelOnboarding();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login'], { replaceUrl: true });
  });

});
