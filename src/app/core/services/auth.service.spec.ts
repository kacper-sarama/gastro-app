import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { Auth } from '@angular/fire/auth';
import { Firestore } from '@angular/fire/firestore';
import { ToastService } from './toast.service';
import { of } from 'rxjs';
import { UserRole } from '../models/staff.model';

describe('AuthService (Authentication & RBAC Roles)', () => {
  let service: AuthService;

  const mockToastService = {
    success: jasmine.createSpy('success'),
    info: jasmine.createSpy('info'),
    warning: jasmine.createSpy('warning'),
    danger: jasmine.createSpy('danger')
  };

  const mockUser = {
    uid: 'user-owner-1',
    email: 'owner@napoli.pl',
    displayName: 'Pizzeria Bella Napoli'
  };

  let mockAuth: any;
  let mockFirestore: any;

  beforeEach(() => {
    mockAuth = {
      currentUser: mockUser,
      onIdTokenChanged: (callback: (u: any) => void) => {
        callback(mockUser);
        return () => {};
      },
      onAuthStateChanged: (callback: (u: any) => void) => {
        callback(mockUser);
        return () => {};
      }
    };

    mockFirestore = {};

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: Auth, useValue: mockAuth },
        { provide: Firestore, useValue: mockFirestore },
        { provide: ToastService, useValue: mockToastService }
      ]
    });

    service = TestBed.inject(AuthService);
    mockToastService.info.calls.reset();
  });

  describe('Stan zalogowania i metadane użytkownika', () => {
    it('powinien poprawnie zwrócić ID aktualnego użytkownika', () => {
      expect(service.currentUserId).toBe('user-owner-1');
    });

    it('isDemoAccount powinien zwrócić false dla standardowego konta restauratora', () => {
      expect(service.isDemoAccount()).toBeFalse();
    });
  });

  describe('Obsługa ról i uprawnień (RBAC)', () => {
    it('domyślna rola użytkownika bez symulacji powinna być "owner" (Właściciel)', () => {
      expect(service.currentUserRole()).toBe('owner');
      expect(service.currentRoleDefinition().label).toBe('Właściciel');
    });

    it('setSimulatedRole("waiter") powinien przełączyć rolę na kelnera i wyemitować toast informacyjny', () => {
      service.setSimulatedRole('waiter');

      expect(service.currentUserRole()).toBe('waiter');
      expect(service.currentRoleDefinition().label).toBe('Kelner / Kasjer');
      expect(mockToastService.info).toHaveBeenCalledWith(
        jasmine.stringContaining('Kelner / Kasjer'),
        'Role & Uprawnienia'
      );
    });

    it('setSimulatedRole("kitchen") powinien przełączyć rolę na kucharza', () => {
      service.setSimulatedRole('kitchen');

      expect(service.currentUserRole()).toBe('kitchen');
      expect(service.currentRoleDefinition().label).toBe('Kucharz / Pizzer');
    });

    it('setSimulatedRole(null) powinien zresetować symulację z powrotem do roli właściciela', () => {
      service.setSimulatedRole('waiter');
      expect(service.currentUserRole()).toBe('waiter');

      service.setSimulatedRole(null);
      expect(service.currentUserRole()).toBe('owner');
    });
  });

  describe('Weryfikacja dostępu do tras (canAccessRoute)', () => {
    it('Właściciel (owner) powinien mieć dostęp do wszystkich modułów', () => {
      service.setSimulatedRole('owner');

      expect(service.canAccessRoute('/dashboard')).toBeTrue();
      expect(service.canAccessRoute('/tables')).toBeTrue();
      expect(service.canAccessRoute('/orders')).toBeTrue();
      expect(service.canAccessRoute('/inventory')).toBeTrue();
      expect(service.canAccessRoute('/recipes')).toBeTrue();
      expect(service.canAccessRoute('/staff')).toBeTrue();
      expect(service.canAccessRoute('/promotions')).toBeTrue();
      expect(service.canAccessRoute('/dishes')).toBeTrue();
    });

    it('Kelner (waiter) powinien mieć dostęp tylko do Sali, Zamówień i Dań', () => {
      service.setSimulatedRole('waiter');

      expect(service.canAccessRoute('/tables')).toBeTrue();
      expect(service.canAccessRoute('/orders')).toBeTrue();
      expect(service.canAccessRoute('/dishes')).toBeTrue();

      // Zablokowane dla kelnera:
      expect(service.canAccessRoute('/dashboard')).toBeFalse();
      expect(service.canAccessRoute('/inventory')).toBeFalse();
      expect(service.canAccessRoute('/recipes')).toBeFalse();
      expect(service.canAccessRoute('/staff')).toBeFalse();
    });

    it('Kucharz (kitchen) powinien mieć dostęp tylko do KDS i Receptur', () => {
      service.setSimulatedRole('kitchen');

      expect(service.canAccessRoute('/orders')).toBeTrue();
      expect(service.canAccessRoute('/recipes')).toBeTrue();

      // Zablokowane dla kucharza:
      expect(service.canAccessRoute('/dashboard')).toBeFalse();
      expect(service.canAccessRoute('/tables')).toBeFalse();
      expect(service.canAccessRoute('/staff')).toBeFalse();
      expect(service.canAccessRoute('/promotions')).toBeFalse();
    });

    it('canAccessRoute powinien poprawnie obsługiwać parametry zapytania (query parameters)', () => {
      service.setSimulatedRole('kitchen');

      expect(service.canAccessRoute('/orders?filter=active')).toBeTrue();
      expect(service.canAccessRoute('/dashboard?period=today')).toBeFalse();
    });
  });

  describe('Czyszczenie pamięci podręcznej (purgeLegacyStorage)', () => {
    it('powinien usunąć przestarzałe klucze fallback z localStorage', () => {
      localStorage.setItem('gastro_inventory_items_fallback', 'test');
      localStorage.setItem('gastro_orders_fallback', 'test');

      service.purgeLegacyStorage();

      expect(localStorage.getItem('gastro_inventory_items_fallback')).toBeNull();
      expect(localStorage.getItem('gastro_orders_fallback')).toBeNull();
    });
  });
});
