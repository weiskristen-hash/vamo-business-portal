import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OnboardingComponent } from './onboarding.component';
import { AuthService } from '../../../core/services/auth.service';
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

  it('1. should create and initialize on step location-permission with loaded areas', () => {
    expect(component).toBeTruthy();
    expect(component.currentStep()).toBe('location-permission');
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

  it('4. skipLocation moves directly from location-permission to area step', () => {
    component.skipLocation();
    expect(component.currentStep()).toBe('area');
  });

  it('5. area selection: selectArea sets selectedArea, goToIntent advances to intent', () => {
    component.selectArea(mockAreas[1]);
    expect(component.selectedArea()?.id).toBe('area-pc');

    component.goToIntent();
    expect(component.currentStep()).toBe('intent');
  });

  it('6. intent selection: browse moves to browse-account, business starts pitch slides at 0', () => {
    component.selectIntent('browse');
    expect(component.currentStep()).toBe('browse-account');

    component.selectIntent('business');
    expect(component.currentStep()).toBe('business-pitch');
    expect(component.pitchSlide()).toBe(0);
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

  it('8. goBack moves backwards through every onboarding step', () => {
    component.currentStep.set('business-register');
    component.goBack();
    expect(component.currentStep()).toBe('business-pitch');
    expect(component.pitchSlide()).toBe(2);

    component.goBack();
    expect(component.pitchSlide()).toBe(1);

    component.goBack();
    expect(component.pitchSlide()).toBe(0);

    component.goBack();
    expect(component.currentStep()).toBe('intent');

    component.goBack();
    expect(component.currentStep()).toBe('area');

    component.goBack();
    expect(component.currentStep()).toBe('location-permission');
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

  it('11. registerBrowseUser registers, logs in, and routes to /no-business when consumer has no business', async () => {
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

    await component.registerBrowseUser();

    expect(authServiceSpy.register).toHaveBeenCalledWith({
      first_name: 'Elena',
      last_name: 'Gomez',
      email: 'elena@consumer.do',
      password: 'pass123',
    });
    expect(authServiceSpy.login).toHaveBeenCalledWith('elena@consumer.do', 'pass123');
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/no-business']);
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

  it('15. social registration preserves loginWithProvider methods, does not route unlinked user to listings create, and hides Apple action from UI', () => {
    component.intent.set('business');
    component.currentStep.set('business-register');

    component.onGoogleSignUp();
    expect(authServiceSpy.loginWithProvider).not.toHaveBeenCalledWith(expect.anything(), '/app/listings/create');
    expect(authServiceSpy.loginWithProvider).toHaveBeenCalledWith('google', '/onboarding?social=business', 'business');

    component.onAppleSignUp();
    expect(authServiceSpy.loginWithProvider).toHaveBeenCalledWith('apple', '/app/listings/create');

    // Verify UI rendering in browse-account step
    component.currentStep.set('browse-account');
    fixture.detectChanges();
    const browseButtons = Array.from(fixture.nativeElement.querySelectorAll('.ob-social-row button')) as HTMLButtonElement[];
    expect(browseButtons.some((b) => b.textContent?.includes('Apple'))).toBe(false);
    expect(browseButtons.some((b) => b.textContent?.includes('Google'))).toBe(true);

    // Verify UI rendering in business-register step
    component.currentStep.set('business-register');
    fixture.detectChanges();
    const bizButtons = Array.from(fixture.nativeElement.querySelectorAll('.ob-social-row button')) as HTMLButtonElement[];
    expect(bizButtons.some((b) => b.textContent?.includes('Apple'))).toBe(false);
    expect(bizButtons.some((b) => b.textContent?.includes('Google'))).toBe(true);
  });

  it('16. progress dots return correct total and active states', () => {
    component.currentStep.set('location-permission');
    expect(component.progressDots.length).toBe(4);
    expect(component.progressDots[0].active).toBe(true);
    expect(component.progressDots[1].active).toBe(false);

    component.intent.set('business');
    component.currentStep.set('business-details');
    expect(component.progressDots.length).toBe(5);
    expect(component.progressDots.every((d) => d.active)).toBe(true);
  });

  it('17. Google business signup initiates OAuth targeting /onboarding?social=business with business intent and saves ob_area', () => {
    const area = {
      id: 'area-st',
      name: 'Santo Domingo',
      emoji: '🏙️',
      latitude: 18.4861,
      longitude: -69.9312,
    };
    component.selectedArea.set(area as any);
    component.intent.set('business');
    component.currentStep.set('business-register');

    component.onGoogleSignUp();

    expect(authServiceSpy.loginWithProvider).not.toHaveBeenCalledWith(expect.anything(), '/app/listings/create');
    expect(authServiceSpy.loginWithProvider).toHaveBeenCalledWith('google', '/onboarding?social=business', 'business');

    const storedArea = sessionStorage.getItem('ob_area');
    expect(storedArea).toBeTruthy();
    expect(JSON.parse(storedArea!).id).toBe('area-st');
    sessionStorage.removeItem('ob_area');
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

    expect(compNew.intent()).toBe('business');
    expect(compNew.currentStep()).toBe('business-details');
    expect(compNew.firstName).toBe('Mateo');
    expect(compNew.lastName).toBe('Peralta');
    expect(compNew.email).toBe('mateo@google.com');
    expect(compNew.selectedArea()?.id).toBe('area-lt');
  });
});
