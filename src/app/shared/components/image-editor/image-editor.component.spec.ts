import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImageEditorComponent, ImageEditorResult, CROP_OUTPUT_SIZE } from './image-editor.component';
import { I18nService } from '../../../core/i18n/i18n.service';

describe('ImageEditorComponent', () => {
  let fixture: ComponentFixture<ImageEditorComponent>;
  let component: ImageEditorComponent;
  let createObjectUrlSpy: ReturnType<typeof vi.spyOn>;
  let revokeObjectUrlSpy: ReturnType<typeof vi.spyOn>;
  let blobSeq = 0;

  const sampleFile = () => new File(['fake-image-bytes'], 'beach-flyer.png', { type: 'image/png' });

  beforeEach(async () => {
    blobSeq = 0;
    createObjectUrlSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation(() => `blob:http://localhost/test-${++blobSeq}`);
    revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    await TestBed.configureTestingModule({
      imports: [ImageEditorComponent],
      providers: [I18nService],
    }).compileComponents();

    fixture = TestBed.createComponent(ImageEditorComponent);
    component = fixture.componentInstance;
    component.file = sampleFile();
    fixture.detectChanges();
  });

  it('defaults to crop mode and configures 1200px output size without upscaling', () => {
    expect(component.mode()).toBe('crop');
    expect(component.outputSize).toBe(1200);
    expect(CROP_OUTPUT_SIZE).toBe(1200);
    expect(component.originalUrl).toMatch(/^blob:/);
  });

  it('defaults nearly square images (<2% aspect diff) to full mode when no initialMode is provided', () => {
    component.onImageLoaded({ original: { size: { width: 1000, height: 990 } } });
    expect(component.mode()).toBe('full');
  });

  it('stays in crop mode for clearly portrait or landscape images', () => {
    component.onImageLoaded({ original: { size: { width: 800, height: 1200 } } });
    expect(component.mode()).toBe('crop');

    component.onImageLoaded({ original: { size: { width: 1600, height: 900 } } });
    expect(component.mode()).toBe('crop');
  });

  it('respects explicit initialMode even for square images', () => {
    const f2 = TestBed.createComponent(ImageEditorComponent);
    f2.componentInstance.file = sampleFile();
    f2.componentInstance.initialMode = 'crop';
    f2.detectChanges();

    f2.componentInstance.onImageLoaded({ original: { size: { width: 1000, height: 1000 } } });
    expect(f2.componentInstance.mode()).toBe('crop');
  });

  it('keeps image-cropper mounted and preserves zoom/transform when switching between crop and full modes', () => {
    component.onZoomChange(2.2);
    component.setMode('full');
    fixture.detectChanges();

    // Cropper stage stays mounted in DOM (hidden via class) so crop frame is preserved
    const stageEl = fixture.nativeElement.querySelector('.ie-stage') as HTMLElement;
    expect(stageEl).toBeTruthy();
    expect(stageEl.classList.contains('ie-stage--hidden')).toBe(true);
    expect(component.zoom).toBe(2.2);
    expect(component.transform.scale).toBe(2.2);

    component.setMode('crop');
    fixture.detectChanges();
    expect(stageEl.classList.contains('ie-stage--hidden')).toBe(false);
    expect(component.zoom).toBe(2.2);
    expect(component.transform.scale).toBe(2.2);
  });

  it('supports zoom slider, +/- step buttons, and pinch transform clamped between 1x and 3x', () => {
    component.stepZoom(0.2);
    expect(component.zoom).toBe(1.2);
    expect(component.transform.scale).toBe(1.2);

    component.stepZoom(-0.5);
    expect(component.zoom).toBe(1);

    component.onZoomChange(4.5);
    expect(component.zoom).toBe(3);

    component.onTransformChange({ scale: 1.75 });
    expect(component.zoom).toBe(1.75);
    expect(component.transform.scale).toBe(1.75);
  });

  it('emits a JPEG -square.jpg file when applied in crop mode and revokes superseded cropped URLs', () => {
    const results: ImageEditorResult[] = [];
    component.applied.subscribe((r) => results.push(r));

    const blob1 = new Blob(['crop-1'], { type: 'image/jpeg' });
    const blob2 = new Blob(['crop-2'], { type: 'image/jpeg' });

    component.onImageCropped({ blob: blob1 } as any);
    const firstUrl = component.croppedUrl();
    expect(firstUrl).toMatch(/^blob:/);

    component.onImageCropped({ blob: blob2 } as any);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith(firstUrl);
    expect(component.previewUrl).toBe(component.croppedUrl());

    component.apply();

    expect(results.length).toBe(1);
    expect(results[0].mode).toBe('crop');
    expect(results[0].file.name).toBe('beach-flyer-square.jpg');
    expect(results[0].file.type).toBe('image/jpeg');
  });

  it('preserves the original file untouched when Keep Full Image is selected', () => {
    const results: ImageEditorResult[] = [];
    component.applied.subscribe((r) => results.push(r));

    component.onImageCropped({ blob: new Blob(['crop'], { type: 'image/jpeg' }) } as any);
    component.setMode('full');
    expect(component.previewUrl).toBe(component.originalUrl);

    component.apply();

    expect(results.length).toBe(1);
    expect(results[0].mode).toBe('full');
    expect(results[0].file).toBe(component.file);
    expect(results[0].file.name).toBe('beach-flyer.png');
  });

  it('falls back to original file in full mode when cropper fails to load an unsupported format', () => {
    const results: ImageEditorResult[] = [];
    component.applied.subscribe((r) => results.push(r));

    component.onLoadFailed();

    expect(results.length).toBe(1);
    expect(results[0]).toEqual({ file: component.file, mode: 'full' });
  });

  it('emits cancelled on Cancel button click and Escape key', () => {
    let cancelCount = 0;
    component.cancelled.subscribe(() => cancelCount++);

    component.cancel();
    component.onEscapeKey();

    expect(cancelCount).toBe(2);
  });

  it('revokes original and cropped object URLs on destroy', () => {
    component.onImageCropped({ blob: new Blob(['crop'], { type: 'image/jpeg' }) } as any);
    const origUrl = component.originalUrl;
    const cropUrl = component.croppedUrl();

    fixture.destroy();

    expect(revokeObjectUrlSpy).toHaveBeenCalledWith(origUrl);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith(cropUrl);
  });
});
