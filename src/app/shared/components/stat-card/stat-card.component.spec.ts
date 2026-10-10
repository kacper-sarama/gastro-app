import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatCardComponent } from './stat-card.component';

describe('StatCardComponent', () => {
  let component: StatCardComponent;
  let fixture: ComponentFixture<StatCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatCardComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(StatCardComponent);
    component = fixture.componentInstance;
    component.title = 'Przychód Dzisiaj';
    component.count = '2 450 zł';
    component.icon = 'payments';
    component.color = 'emerald';
    fixture.detectChanges();
  });

  it('powinien poprawnie utworzyć komponent', () => {
    expect(component).toBeTruthy();
  });

  it('powinien wyrenderować przekazany tytuł i wartość licznika', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Przychód Dzisiaj');
    expect(el.textContent).toContain('2 450 zł');
  });

  it('powinien wyrenderować podtytuł, jeśli został przekazany', () => {
    component.subtitle = '+18% w porównaniu do wczoraj';
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('+18% w porównaniu do wczoraj');
  });

  it('powinien emitować cardClick przy kliknięciu, gdy isClickable jest ustawione na true', () => {
    component.isClickable = true;
    fixture.detectChanges();

    let clicked = false;
    component.cardClick.subscribe(() => {
      clicked = true;
    });

    component.onClick();
    expect(clicked).toBeTrue();
  });

  it('nie powinien emitować cardClick przy kliknięciu, gdy isClickable jest false', () => {
    component.isClickable = false;
    fixture.detectChanges();

    let clicked = false;
    component.cardClick.subscribe(() => {
      clicked = true;
    });

    component.onClick();
    expect(clicked).toBeFalse();
  });
});
