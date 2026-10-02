import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BusinessProfileComponent } from './business-profile.component';
import { AuthService } from '../../core/services/auth.service';
import { BusinessService } from '../../core/services/business.service';
import { Provider } from '../../core/models/provider.model';
import { provideRouter } from '@angular/router';

describe('BusinessProfileComponent', () => {
  let component: BusinessProfileComponent;
  let fixture: ComponentFixture<BusinessProfileComponent>;
  let authServiceSpy: any;
  let businessServiceSpy: any;

  const mockProvider: Provider = {
    id: 'prov-101',
    name: 'Las Terrenas Kitesurf Oasis',
    business_type: 'sports',
    description: 'Premier kitesurfing school and watersports rental on Playa Bonita.',
    address: 'Playa Bonita, Calle Principal #12',
    city: 'Las Terrenas',
    phone: '+18095551234',
    wa_number: '+18095551234',
    email: 'info@kitesurfoasis.com',
    website: 'https://kitesurfoasis.com',
    facebook: 'kitesurfoasis',
    instagram: '@kitesurfoasis',
    google_business_link: 'https://maps.google.com/?cid=123',
    location: { type: 'Point', coordinates: [-69.5422, 19.3175] },
    offerings: [],
    opening_times: [
      { day: 'monday', opens_at: '09:00', closes_at: '18:00', closed: false },
      { day: 'tuesday', opens_at: '09:00', closes_at: '18:00', closed: false },
      { day: 'wednesday', opens_at: '09:00', closes_at: '18:00', closed: false },
      { day: 'thursday', opens_at: '09:00', closes_at: '18:00', closed: false },
      { day: 'friday', opens_at: '09:00', closes_at: '18:00', closed: false },
      { day: 'saturday', opens_at: '10:00', closes_at: '16:00', closed: false },
      { day: 'sunday', opens_at: '', closes_at: '', closed: true },
    ],
    logo: { id: 'file-logo-101' } as any,
    images: [{ directus_files_id: { id: 'file-gallery-1' } } as any],
    subscription_tier: 'advanced',
  };

  const mockUser = {
    id: 'user-test',
    email: 'carlos@kitesurfoasis.com',
    first_name: 'Carlos',
    last_name: 'Mendez',
    provider_link: mockProvider,
  };

  beforeEach(async () => {
    authServiceSpy = {
      waitForInitialAuth: vi.fn().mockResolvedValue(mockUser),
      currentUser: mockUser,
      restoreSession: vi.fn().mockResolvedValue(mockUser),
    };

    businessServiceSpy = {
      getProviderById: vi.fn().mockResolvedValue(mockProvider),
      updateProvider: vi.fn().mockResolvedValue(mockProvider),
      getAssetUrl: vi.fn((fileIdOrObj: any) => {
        const id = typeof fileIdOrObj === 'object' ? fileIdOrObj?.id : fileIdOrObj;
        return id ? `https://api.vamo-app.com/assets/${id}` : '';
      }),
      updateProviderLogo: vi.fn().mockResolvedValue('new-logo-id'),
      uploadProviderImage: vi.fn().mockResolvedValue('new-img-id'),
      removeProviderImage: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [BusinessProfileComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authServiceSpy },
        { provide: BusinessService, useValue: businessServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BusinessProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load the business profile', async () => {
    expect(component).toBeTruthy();
    await fixture.whenStable();

    expect(businessServiceSpy.getProviderById).toHaveBeenCalledWith('prov-101');
    expect(component.provider()).toEqual(mockProvider);
    expect(component.form().name).toBe('Las Terrenas Kitesurf Oasis');
    expect(component.form().city).toBe('Las Terrenas');
  });

  it('should calculate high completeness for fully filled profile', async () => {
    await fixture.whenStable();
    expect(component.completeness()).toBe(100);
    expect(component.missingItems().length).toBe(0);
  });

  it('should correctly evaluate form validity', async () => {
    await fixture.whenStable();
    expect(component.isFormValid()).toBe(true);

    // Empty name should make form invalid
    component.form.update((f) => ({ ...f, name: '  ' }));
    expect(component.isFormValid()).toBe(false);

    // Restore name
    component.form.update((f) => ({ ...f, name: 'Valid Name' }));
    expect(component.isFormValid()).toBe(true);

    // Invalid email should make form invalid
    component.form.update((f) => ({ ...f, email: 'invalid-email-format' }));
    expect(component.isFormValid()).toBe(false);
  });

  it('should toggle offerings for supported business types', async () => {
    await fixture.whenStable();
    component.form.update((f) => ({ ...f, business_type: 'restaurant' }));

    expect(component.currentOfferingChoices.length).toBeGreaterThan(0);
    expect(component.isOfferingSelected('breakfast')).toBe(false);

    component.toggleOffering('breakfast');
    expect(component.isOfferingSelected('breakfast')).toBe(true);
    expect(component.isDirty()).toBe(true);

    component.toggleOffering('breakfast');
    expect(component.isOfferingSelected('breakfast')).toBe(false);
  });

  it('should update operating hours correctly with weekday standard preset', async () => {
    await fixture.whenStable();
    component.setWeekdaysStandard();

    const times = component.form().opening_times;
    const mon = times.find((h) => h.day === 'monday');
    expect(mon?.opens_at).toBe('09:00');
    expect(mon?.closes_at).toBe('18:00');
    expect(mon?.closed).toBe(false);
    expect(component.isDirty()).toBe(true);
  });

  it('should save profile changes and call businessService.updateProvider', async () => {
    await fixture.whenStable();

    component.form.update((f) => ({ ...f, name: 'Updated Oasis Name' }));
    component.markDirty();

    await component.saveProfile();

    expect(businessServiceSpy.updateProvider).toHaveBeenCalledWith(
      'prov-101',
      expect.objectContaining({
        name: 'Updated Oasis Name',
        city: 'Las Terrenas',
      }),
      expect.anything()
    );
    expect(component.saveSuccess()).toBe(true);
    expect(component.isDirty()).toBe(false);
  });

  it('should display customer-safe error message and retain unsaved form state when updateProvider throws', async () => {
    await fixture.whenStable();
    businessServiceSpy.updateProvider.mockRejectedValueOnce(
      new Error("You don't have permission to update collection providers")
    );

    component.form.update((f) => ({ ...f, name: 'Failed Save Test' }));
    component.markDirty();

    await component.saveProfile();

    // Verify technical details are NEVER leaked
    expect(component.saveError()).not.toContain('Directus');
    expect(component.saveError()).not.toContain('collection');
    expect(component.saveError()).not.toContain('providers');
    expect(component.saveError()).toBe("We couldn't make that change. This action is not available for your account.");

    // Verify unsaved state is retained for retry
    expect(component.form().name).toBe('Failed Save Test');
    expect(component.saveSuccess()).toBe(false);
  });
});
