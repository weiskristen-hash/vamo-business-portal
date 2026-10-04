import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BusinessProfileComponent } from './business-profile.component';
import { AuthService } from '../../core/services/auth.service';
import { BusinessService } from '../../core/services/business.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { Provider } from '../../core/models/provider.model';
import { provideRouter } from '@angular/router';

describe('BusinessProfileComponent', () => {
  let component: BusinessProfileComponent;
  let fixture: ComponentFixture<BusinessProfileComponent>;
  let authServiceSpy: any;
  let businessServiceSpy: any;
  let i18nService: I18nService;

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
        I18nService,
        { provide: AuthService, useValue: authServiceSpy },
        { provide: BusinessService, useValue: businessServiceSpy },
      ],
    }).compileComponents();

    i18nService = TestBed.inject(I18nService);
    i18nService.setLang('en');

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

  it('should display customer-safe error message when profile loading fails', async () => {
    businessServiceSpy.getProviderById.mockRejectedValueOnce(
      new Error("You don't have permission to access field 'website' in collection 'providers' or it does not exist.")
    );

    await component.loadProfile();

    expect(component.loadError()).not.toContain('Directus');
    expect(component.loadError()).not.toContain('collection');
    expect(component.loadError()).not.toContain('providers');
    expect(component.loadError()).not.toContain('website');
    expect(component.loadError()).toBe("We couldn't load your business profile. Please refresh the page.");
    expect(component.loading()).toBe(false);
  });

  describe('Phase 2C.2: Localization Parity and Form Independence', () => {
    it('renders localized headings, breadcrumbs, action buttons, and labels in English by default', async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;

      const breadcrumb = compiled.querySelector('.header-breadcrumbs');
      expect(breadcrumb?.textContent).toContain('Manage');
      expect(breadcrumb?.textContent).toContain('Business Profile');

      const subtitle = compiled.querySelector('.header-subtitle');
      expect(subtitle?.textContent).toContain('Manage your business identity, verified contact details');

      const saveBtn = compiled.querySelector('.btn-save');
      expect(saveBtn?.textContent).toContain('Save Changes');

      const identityTitle = compiled.querySelector('#section-identity .card-title');
      expect(identityTitle?.textContent).toContain('Business Identity');

      const identityRequired = compiled.querySelector('#section-identity .section-tag');
      expect(identityRequired?.textContent).toContain('Required');
    });

    it('renders localized headings, breadcrumbs, action buttons, and labels in Spanish when language is es', async () => {
      await fixture.whenStable();
      i18nService.setLang('es');
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;

      const breadcrumb = compiled.querySelector('.header-breadcrumbs');
      expect(breadcrumb?.textContent).toContain('Gestionar');
      expect(breadcrumb?.textContent).toContain('Perfil del negocio');

      const subtitle = compiled.querySelector('.header-subtitle');
      expect(subtitle?.textContent).toContain('Gestiona la identidad de tu negocio, datos de contacto verificados');

      const saveBtn = compiled.querySelector('.btn-save');
      expect(saveBtn?.textContent).toContain('Guardar cambios');

      const identityTitle = compiled.querySelector('#section-identity .card-title');
      expect(identityTitle?.textContent).toContain('Identidad del negocio');

      const identityRequired = compiled.querySelector('#section-identity .section-tag');
      expect(identityRequired?.textContent).toContain('Obligatorio');

      i18nService.setLang('en');
    });

    it('displays canonical English category value and options in both EN and ES while remaining disabled', async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;

      const select = compiled.querySelector('#field-type') as HTMLSelectElement;
      expect(select).toBeTruthy();
      expect(select.disabled).toBe(true);

      // Verify the selected value displays canonical English label
      expect(component.getBusinessTypeLabel(component.form().business_type)).toBe('Sports & Outdoor');

      // Switch language to ES
      i18nService.setLang('es');
      fixture.detectChanges();

      // Category options must still use canonical English labels
      const sportsOption = Array.from(select.options).find((o) => o.value === 'sports');
      expect(sportsOption?.text.trim()).toBe('Sports & Outdoor');
      expect(component.getBusinessTypeLabel(component.form().business_type)).toBe('Sports & Outdoor');

      i18nService.setLang('en');
    });

    it('localizes operating hour day names dynamically without altering stored lowercase day values', async () => {
      await fixture.whenStable();

      i18nService.setLang('en');
      expect(component.getDayLabel('monday')).toBe('Monday');
      expect(component.getDayLabel('friday')).toBe('Friday');
      expect(component.getDayLabel('sunday')).toBe('Sunday');

      i18nService.setLang('es');
      expect(component.getDayLabel('monday')).toBe('Lunes');
      expect(component.getDayLabel('friday')).toBe('Viernes');
      expect(component.getDayLabel('sunday')).toBe('Domingo');

      // The stored form values must remain lowercase canonical keys
      expect(component.form().opening_times[0].day).toBe('monday');
      expect(component.form().opening_times[6].day).toBe('sunday');

      i18nService.setLang('en');
    });

    it('enforces canonical offering display labels in both EN and ES while preserving stored offering values', async () => {
      await fixture.whenStable();
      component.form.update((f) => ({ ...f, business_type: 'restaurant_and_bar' }));

      // English renders exact canonical labels
      i18nService.setLang('en');
      const enChoices = component.currentOfferingChoices;
      expect(enChoices.find((c) => c.value === 'breakfast')?.label).toBe('Breakfast');
      expect(enChoices.find((c) => c.value === 'cocktails')?.label).toBe('Cocktails');

      // Spanish ALSO renders exact canonical English labels (matching canonical VAMO offeringMap)
      i18nService.setLang('es');
      const esChoices = component.currentOfferingChoices;
      expect(esChoices.find((c) => c.value === 'breakfast')?.label).toBe('Breakfast');
      expect(esChoices.find((c) => c.value === 'cocktails')?.label).toBe('Cocktails');
      // Verify no invented Spanish labels are used
      expect(esChoices.find((c) => c.value === 'breakfast')?.label).not.toBe('Desayuno');
      expect(esChoices.find((c) => c.value === 'cocktails')?.label).not.toBe('Cócteles');

      // Select an offering - stored value remains canonical identifier
      component.toggleOffering('breakfast');
      expect(component.form().offerings).toContain('breakfast');

      i18nService.setLang('en');
    });

    it('localizes missing completeness items dynamically', async () => {
      await fixture.whenStable();
      component.form.update((f) => ({ ...f, logo: null, wa_number: '' }));

      i18nService.setLang('en');
      expect(component.missingItems()).toContain('Upload a brand logo');
      expect(component.missingItems()).toContain('Add WhatsApp number for inquiries');

      i18nService.setLang('es');
      expect(component.missingItems()).toContain('Sube un logotipo de tu marca');
      expect(component.missingItems()).toContain('Añade número de WhatsApp para consultas');

      i18nService.setLang('en');
    });

    it('preserves unsaved form edits, dirty state, and untouched fields when switching language', async () => {
      await fixture.whenStable();

      const userDraftName = 'Mi Kitesurf Exclusivo en Las Terrenas';
      const userDraftDesc = 'Una experiencia inolvidable en las playas de Samaná con instructores certificados.';

      component.form.update((f) => ({
        ...f,
        name: userDraftName,
        description: userDraftDesc,
      }));
      component.markDirty();

      expect(component.isDirty()).toBe(true);
      expect(component.form().name).toBe(userDraftName);
      expect(component.form().description).toBe(userDraftDesc);

      // Switch language to ES
      i18nService.setLang('es');
      fixture.detectChanges();

      // Form state and dirty flag must remain completely intact
      expect(component.isDirty()).toBe(true);
      expect(component.form().name).toBe(userDraftName);
      expect(component.form().description).toBe(userDraftDesc);

      // Switch language back to EN
      i18nService.setLang('en');
      fixture.detectChanges();

      expect(component.isDirty()).toBe(true);
      expect(component.form().name).toBe(userDraftName);
      expect(component.form().description).toBe(userDraftDesc);
    });

    it('displays localized validation error banner when submitting an invalid form', async () => {
      await fixture.whenStable();
      component.form.update((f) => ({ ...f, name: '' }));

      i18nService.setLang('en');
      await component.saveProfile();
      expect(component.saveError()).toBe('Please correct the highlighted fields before saving.');

      i18nService.setLang('es');
      await component.saveProfile();
      expect(component.saveError()).toBe('Por favor corrige los campos resaltados antes de guardar.');

      i18nService.setLang('en');
    });

    it('never includes business_type, images, translations, or translation_status in updateProvider payload', async () => {
      await fixture.whenStable();

      component.form.update((f) => ({
        ...f,
        name: 'Parity Verified Name',
        business_type: 'restaurant',
      }));
      component.markDirty();

      await component.saveProfile();

      expect(businessServiceSpy.updateProvider).toHaveBeenCalledWith(
        'prov-101',
        expect.not.objectContaining({
          business_type: expect.anything(),
          images: expect.anything(),
          translations: expect.anything(),
          translation_status: expect.anything(),
        }),
        expect.anything()
      );
    });
  });
});
