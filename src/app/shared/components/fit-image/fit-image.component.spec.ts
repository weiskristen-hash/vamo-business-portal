import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { FitImageComponent } from './fit-image.component';

describe('FitImageComponent', () => {
  let fixture: ComponentFixture<FitImageComponent>;
  let component: FitImageComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FitImageComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(FitImageComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('src', 'https://example.com/photo.jpg');
    fixture.detectChanges();
  });

  function triggerLoad(boxW: number, boxH: number, natW: number, natH: number): HTMLElement {
    const hostEl = fixture.nativeElement as HTMLElement;
    const mainImg = hostEl.querySelector('img.fit-image-main') as HTMLImageElement;
    Object.defineProperty(hostEl, 'clientWidth', { value: boxW, configurable: true });
    Object.defineProperty(hostEl, 'clientHeight', { value: boxH, configurable: true });
    Object.defineProperty(mainImg, 'naturalWidth', { value: natW, configurable: true });
    Object.defineProperty(mainImg, 'naturalHeight', { value: natH, configurable: true });
    mainImg.dispatchEvent(new Event('load'));
    fixture.detectChanges();
    return hostEl;
  }

  it('uses cover for a 1:1 square image in a square container', () => {
    const hostEl = triggerLoad(330, 330, 1200, 1200);
    expect(component.contain()).toBe(false);
    expect(hostEl.classList.contains('fit-image--contain')).toBe(false);
    expect(hostEl.querySelector('.fit-image-backdrop')).toBeNull();
  });

  it('uses cover when image fits within the 15% crop tolerance', () => {
    // 1100 x 1000 (ratio 1.1) in 1:1 square -> 1.1 * 0.85 = 0.935 <= 1 -> cover
    const hostEl = triggerLoad(330, 330, 1100, 1000);
    expect(component.contain()).toBe(false);
    expect(hostEl.querySelector('.fit-image-backdrop')).toBeNull();
  });

  it('uses contain with blurred backdrop for a portrait flyer (>15% height would be cropped)', () => {
    const hostEl = triggerLoad(330, 330, 800, 1200);
    expect(component.contain()).toBe(true);
    expect(hostEl.classList.contains('fit-image--contain')).toBe(true);
    const backdrop = hostEl.querySelector('.fit-image-backdrop') as HTMLImageElement;
    expect(backdrop).toBeTruthy();
    expect(backdrop.getAttribute('src')).toBe('https://example.com/photo.jpg');
    expect(backdrop.getAttribute('aria-hidden')).toBe('true');
  });

  it('uses contain with blurred backdrop for a wide landscape image (>15% width would be cropped)', () => {
    // 1600 x 900 (ratio 1.78) in 1:1 square -> 1.78 * 0.85 = 1.51 > 1 -> contain
    const hostEl = triggerLoad(330, 330, 1600, 900);
    expect(component.contain()).toBe(true);
    expect(hostEl.classList.contains('fit-image--contain')).toBe(true);
    expect(hostEl.querySelector('.fit-image-backdrop')).toBeTruthy();
  });

  it('defaults box ratio to 1:1 when host dimensions are not laid out yet', () => {
    const hostEl = triggerLoad(0, 0, 1600, 900);
    expect(component.contain()).toBe(true);
    expect(hostEl.querySelector('.fit-image-backdrop')).toBeTruthy();
  });

  it('falls back to fallbackSrc on image error and resets contain', () => {
    triggerLoad(330, 330, 800, 1200);
    expect(component.contain()).toBe(true);

    component.onError();
    fixture.detectChanges();

    expect(component.contain()).toBe(false);
    expect(component.resolvedSrc()).toBe('/assets/placeholder.png');
  });
});
