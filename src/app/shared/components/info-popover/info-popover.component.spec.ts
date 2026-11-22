import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InfoPopoverComponent } from './info-popover.component';

@Component({
  standalone: true,
  imports: [InfoPopoverComponent],
  template: `
    <div class="host-shell" (click)="parentClicks = parentClicks + 1">
      <app-info-popover
        class="first-pop"
        ariaLabel="First info"
        title="First Heading"
        [paragraphs]="['Paragraph one.', 'Paragraph two.']"
      ></app-info-popover>

      <app-info-popover
        class="second-pop"
        align="end"
        ariaLabel="Second info"
        title="Second Heading"
        [paragraphs]="['Second body.']"
      ></app-info-popover>
    </div>
  `,
})
class TestHostComponent {
  parentClicks = 0;
}

describe('InfoPopoverComponent', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('does not open on hover alone; opens on click/tap with accessible attributes and stops click propagation', () => {
    const firstTrigger = fixture.nativeElement.querySelector(
      '.first-pop .info-popover-trigger'
    ) as HTMLButtonElement;
    expect(firstTrigger).toBeTruthy();
    expect(firstTrigger.getAttribute('aria-label')).toBe('First info');
    expect(firstTrigger.getAttribute('aria-expanded')).toBe('false');

    // Hovering alone must not open popover
    firstTrigger.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.first-pop .info-popover-panel')).toBeNull();

    // Clicking opens popover without bubbling to parent container
    firstTrigger.click();
    fixture.detectChanges();

    expect(host.parentClicks).toBe(0);
    expect(firstTrigger.getAttribute('aria-expanded')).toBe('true');

    const panel = fixture.nativeElement.querySelector('.first-pop .info-popover-panel') as HTMLElement;
    expect(panel).toBeTruthy();
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.textContent).toContain('First Heading');
    expect(panel.textContent).toContain('Paragraph one.');
    expect(panel.textContent).toContain('Paragraph two.');
  });

  it('closes any previously open popover when another info button is activated, and dismisses on Escape and outside click', () => {
    const firstTrigger = fixture.nativeElement.querySelector(
      '.first-pop .info-popover-trigger'
    ) as HTMLButtonElement;
    const secondTrigger = fixture.nativeElement.querySelector(
      '.second-pop .info-popover-trigger'
    ) as HTMLButtonElement;

    firstTrigger.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.first-pop .info-popover-panel')).toBeTruthy();

    // Opening second closes first
    secondTrigger.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.first-pop .info-popover-panel')).toBeNull();
    expect(fixture.nativeElement.querySelector('.second-pop .info-popover-panel')).toBeTruthy();

    // Pressing Escape dismisses active popover and returns focus to trigger
    const focusSpy = vi.spyOn(secondTrigger, 'focus');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.second-pop .info-popover-panel')).toBeNull();
    expect(focusSpy).toHaveBeenCalled();

    // Reopen and dismiss via outside click
    firstTrigger.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.first-pop .info-popover-panel')).toBeTruthy();

    document.body.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.first-pop .info-popover-panel')).toBeNull();
  });
});
