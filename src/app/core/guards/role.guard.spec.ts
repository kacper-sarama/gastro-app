import { TestBed } from '@angular/core/testing';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { roleGuard } from './role.guard';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../models/staff.model';
import { signal } from '@angular/core';

describe('roleGuard (RBAC)', () => {
  let mockAuthService: {
    currentUserRole: ReturnType<typeof signal<UserRole>>;
    canAccessRoute: jasmine.Spy;
  };
  let router: Router;

  beforeEach(() => {
    mockAuthService = {
      currentUserRole: signal<UserRole>('owner'),
      canAccessRoute: jasmine.createSpy('canAccessRoute')
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuthService }
      ]
    });

    router = TestBed.inject(Router);
  });

  function executeGuard(url: string) {
    const routeSnapshot = {} as ActivatedRouteSnapshot;
    const stateSnapshot = { url } as RouterStateSnapshot;
    return TestBed.runInInjectionContext(() => roleGuard(routeSnapshot, stateSnapshot));
  }

  it('powinien zezwolić na przejście (zwrócić true), gdy canAccessRoute zwraca true', () => {
    mockAuthService.canAccessRoute.and.returnValue(true);

    const result = executeGuard('/dashboard');
    expect(result).toBeTrue();
    expect(mockAuthService.canAccessRoute).toHaveBeenCalledWith('/dashboard');
  });

  it('powinien przekierować kucharza (kitchen) na /orders (KDS), gdy próbuje wejść na niedozwoloną stronę', () => {
    mockAuthService.currentUserRole.set('kitchen');
    mockAuthService.canAccessRoute.and.returnValue(false);

    const result = executeGuard('/staff');
    expect(result instanceof UrlTree).toBeTrue();
    expect((result as UrlTree).toString()).toBe('/orders');
  });

  it('powinien przekierować kelnera (waiter) na /tables (Plan Sali), gdy próbuje wejść na stronę Zespołu', () => {
    mockAuthService.currentUserRole.set('waiter');
    mockAuthService.canAccessRoute.and.returnValue(false);

    const result = executeGuard('/staff');
    expect(result instanceof UrlTree).toBeTrue();
    expect((result as UrlTree).toString()).toBe('/tables');
  });

  it('powinien przekierować domyślnie na /dashboard, gdy rola to owner/manager i canAccessRoute zwróci false', () => {
    mockAuthService.currentUserRole.set('owner');
    mockAuthService.canAccessRoute.and.returnValue(false);

    const result = executeGuard('/unknown-route');
    expect(result instanceof UrlTree).toBeTrue();
    expect((result as UrlTree).toString()).toBe('/dashboard');
  });

  it('powinien poprawnie sprawdzić dostęp, gdy adres URL zawiera parametry zapytania (query params)', () => {
    mockAuthService.canAccessRoute.and.returnValue(true);

    const result = executeGuard('/tables?zone=ogrodek&status=free');
    expect(result).toBeTrue();
    expect(mockAuthService.canAccessRoute).toHaveBeenCalledWith('/tables?zone=ogrodek&status=free');
  });

  it('powinien przekierować menedżera (manager) na /dashboard, gdy próbuje wejść na niedozwoloną trasę', () => {
    mockAuthService.currentUserRole.set('manager');
    mockAuthService.canAccessRoute.and.returnValue(false);

    const result = executeGuard('/unauthorized-path');
    expect(result instanceof UrlTree).toBeTrue();
    expect((result as UrlTree).toString()).toBe('/dashboard');
  });
});
