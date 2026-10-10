import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { ToastService } from './core/services/toast.service';
import { provideRouter } from '@angular/router';

describe('App Root', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        ToastService,
        provideRouter([])
      ]
    }).compileComponents();
  });

  it('powinien poprawnie zainicjalizować główny komponent aplikacji', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
