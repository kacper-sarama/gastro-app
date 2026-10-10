import { TestBed } from '@angular/core/testing';
import { StaffService } from './staff.service';
import { Firestore } from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';
import { StaffMember } from '../models/staff.model';
import { signal } from '@angular/core';

describe('StaffService (Team & Roles Management)', () => {
  let service: StaffService;

  const mockStaffMembers: StaffMember[] = [
    {
      id: 'staff-1',
      restaurantId: 'rest-1',
      name: 'Anna Nowak',
      email: 'anna@gastro.pl',
      role: 'waiter',
      active: true,
      createdAt: '2026-10-10T10:00:00Z'
    },
    {
      id: 'staff-2',
      restaurantId: 'rest-1',
      name: 'Tomasz Lis',
      email: 'tomasz@gastro.pl',
      role: 'waiter',
      active: true,
      createdAt: '2026-10-10T10:00:00Z'
    },
    {
      id: 'staff-3',
      restaurantId: 'rest-1',
      name: 'Piotr Kucharz',
      email: 'piotr@gastro.pl',
      role: 'kitchen',
      active: true,
      createdAt: '2026-10-10T10:00:00Z'
    },
    {
      id: 'staff-4',
      restaurantId: 'rest-1',
      name: 'Marek Szef',
      email: 'marek@gastro.pl',
      role: 'manager',
      active: false, // nieaktywny
      createdAt: '2026-10-10T10:00:00Z'
    }
  ];

  beforeEach(() => {
    const mockFirestore = {};
    const mockAuthService = {
      currentUser: signal(null),
      currentUserId: 'rest-1',
      isDemoAccount: signal(false)
    };
    const mockToastService = {
      success: jasmine.createSpy('success'),
      info: jasmine.createSpy('info'),
      warning: jasmine.createSpy('warning'),
      danger: jasmine.createSpy('danger')
    };

    TestBed.configureTestingModule({
      providers: [
        StaffService,
        { provide: Firestore, useValue: mockFirestore },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ToastService, useValue: mockToastService }
      ]
    });

    service = TestBed.inject(StaffService);
    service.staff.set(mockStaffMembers);
  });

  it('powinien poprawnie zliczyć wszystkich pracowników (totalStaffCount)', () => {
    expect(service.totalStaffCount()).toBe(4);
  });

  it('powinien poprawnie odfiltrować wyłącznie aktywnych pracowników (activeStaffCount)', () => {
    // 3 aktywnych, 1 nieaktywny
    expect(service.activeStaffCount()).toBe(3);
  });

  it('powinien zliczyć kelnerów (waitersCount)', () => {
    // Anna Nowak i Tomasz Lis = 2
    expect(service.waitersCount()).toBe(2);
  });

  it('powinien zliczyć kucharzy (kitchenCount)', () => {
    // Piotr Kucharz = 1
    expect(service.kitchenCount()).toBe(1);
  });

  it('powinien zliczyć kadrę zarządzającą (managersCount)', () => {
    // Marek Szef (manager) = 1
    expect(service.managersCount()).toBe(1);
  });
});
