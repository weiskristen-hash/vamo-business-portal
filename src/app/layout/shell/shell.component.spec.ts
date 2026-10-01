import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShellComponent } from './shell.component';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BusinessService } from '../../core/services/business.service';

describe('ShellComponent', () => {
  let component: ShellComponent;
  let fixture: ComponentFixture<ShellComponent>;

  const mockUser = {
    id: 'usr-1',
    first_name: 'Elena',
    last_name: 'Gomez',
    email: 'elena@casabonaire.com',
    provider_link: {
      id: 'prov-1',
      name: 'Casa Bonaire Suites',
      subscription_tier: 'starter',
    },
  };

  beforeEach(async () => {
    const authServiceSpy = {
      currentUser: mockUser,
      logout: vi.fn(),
    };

    const businessServiceSpy = {
      getAssetUrl: vi.fn().mockReturnValue(''),
    };

    await TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authServiceSpy },
        { provide: BusinessService, useValue: businessServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ShellComponent);
    component = fixture.componentInstance;
  });

  it('should create the shell component', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should render sidebar and topbar elements', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-sidebar')).toBeTruthy();
    expect(compiled.querySelector('app-topbar')).toBeTruthy();
  });

  it('should toggle mobile navigation drawer and close on escape', () => {
    fixture.detectChanges();
    expect(component.mobileNavOpen).toBe(false);

    component.mobileNavOpen = true;
    expect(component.mobileNavOpen).toBe(true);

    component.onEscape();
    expect(component.mobileNavOpen).toBe(false);
  });
});
