import { TestBed } from '@angular/core/testing';
import { RoleNotificationService } from './role-notification.service';
import { AuthService } from './auth.service';
import { OrderService } from './order.service';
import { InventoryService } from './inventory.service';
import { ToastService } from './toast.service';
import { signal } from '@angular/core';
import { Order } from '../models/order.model';
import { InventoryItem } from '../models/inventory-item.model';
import { UserRole } from '../models/staff.model';

describe('RoleNotificationService (State-Driven Role Notifications)', () => {
  let service: RoleNotificationService;
  let mockRoleSignal: ReturnType<typeof signal<UserRole>>;
  let mockOrdersSignal: ReturnType<typeof signal<Order[]>>;
  let mockInventorySignal: ReturnType<typeof signal<InventoryItem[]>>;

  const initialOrders: Order[] = [
    {
      id: 'ord-1',
      restaurantId: 'rest-1',
      orderNumber: 101,
      tableNumber: 'Stolik 1',
      items: [{ recipeId: 'rec-1', recipeName: 'Margherita', quantity: 2, unitPrice: 32 }],
      totalPrice: 64,
      status: 'pending',
      stockDeducted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'ord-2',
      restaurantId: 'rest-1',
      orderNumber: 102,
      tableNumber: 'Stolik 2',
      items: [{ recipeId: 'rec-2', recipeName: 'Diavola', quantity: 1, unitPrice: 38 }],
      totalPrice: 38,
      status: 'ready',
      stockDeducted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'ord-3',
      restaurantId: 'rest-1',
      orderNumber: 103,
      tableNumber: 'Bar',
      items: [{ recipeId: 'rec-1', recipeName: 'Margherita', quantity: 1, unitPrice: 32 }],
      totalPrice: 32,
      status: 'in_progress',
      stockDeducted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  const initialInventory: InventoryItem[] = [
    {
      id: 'inv-1',
      restaurantId: 'rest-1',
      name: 'Mąka Typ 00',
      category: 'Suche',
      unit: 'g',
      amount: 0, // Brak surowca!
      minAmount: 1000
    },
    {
      id: 'inv-2',
      restaurantId: 'rest-1',
      name: 'Mozzarella fior di latte',
      category: 'Nabiał',
      unit: 'g',
      amount: 15000,
      minAmount: 5000
    }
  ];

  beforeEach(() => {
    mockRoleSignal = signal<UserRole>('kitchen');
    mockOrdersSignal = signal<Order[]>(initialOrders);
    mockInventorySignal = signal<InventoryItem[]>(initialInventory);

    const mockAuthService = {
      currentUserRole: mockRoleSignal
    };

    const mockOrderService = {
      orders: mockOrdersSignal,
      getElapsedTime: jasmine.createSpy('getElapsedTime').and.returnValue('3 min temu')
    };

    const mockInventoryService = {
      items: mockInventorySignal,
      outOfStockItems: () => mockInventorySignal().filter(i => i.amount <= 0)
    };

    const mockToastService = {
      info: jasmine.createSpy('info'),
      success: jasmine.createSpy('success'),
      warning: jasmine.createSpy('warning'),
      danger: jasmine.createSpy('danger')
    };

    TestBed.configureTestingModule({
      providers: [
        RoleNotificationService,
        { provide: AuthService, useValue: mockAuthService },
        { provide: OrderService, useValue: mockOrderService },
        { provide: InventoryService, useValue: mockInventoryService },
        { provide: ToastService, useValue: mockToastService }
      ]
    });

    service = TestBed.inject(RoleNotificationService);
  });

  describe('Obliczanie liczników dzwoneczka (State-Driven unreadCount)', () => {
    it('dla roli kucharza (kitchen) powinien zliczać tylko zamówienia w kolejce oczekujących (pending)', () => {
      mockRoleSignal.set('kitchen');
      expect(service.unreadCount()).toBe(1); // tylko ord-1
      expect(service.tooltipLabel()).toContain('1 zamówienie czeka w kolejce');
    });

    it('dla roli kucharza po kliknięciu „Do kuchni” (status -> in_progress) licznik powinien spaść do 0', () => {
      mockRoleSignal.set('kitchen');
      expect(service.unreadCount()).toBe(1);

      // Kucharz przesuwa bon ord-1 z pending do in_progress
      const updatedOrders = initialOrders.map(o => o.id === 'ord-1' ? { ...o, status: 'in_progress' as const } : o);
      mockOrdersSignal.set(updatedOrders);

      expect(service.unreadCount()).toBe(0);
      expect(service.tooltipLabel()).toBe('Brak oczekujących powiadomień');
    });

    it('dla roli kelnera (waiter) powinien zliczać zamówienia gotowe na wydawce (ready)', () => {
      mockRoleSignal.set('waiter');
      expect(service.unreadCount()).toBe(1); // tylko ord-2
      expect(service.tooltipLabel()).toContain('1 danie czeka gotowe do wydania');
    });

    it('dla roli kelnera po wydaniu dania (status -> completed) licznik powinien spaść do 0', () => {
      mockRoleSignal.set('waiter');
      expect(service.unreadCount()).toBe(1);

      // Kelner wydaje stolik ord-2
      const updatedOrders = initialOrders.map(o => o.id === 'ord-2' ? { ...o, status: 'completed' as const } : o);
      mockOrdersSignal.set(updatedOrders);

      expect(service.unreadCount()).toBe(0);
    });

    it('dla roli właściciela (owner) powinien zliczać braki magazynowe (stan <= 0)', () => {
      mockRoleSignal.set('owner');
      expect(service.unreadCount()).toBe(1); // Mąka ma currentStock: 0
      expect(service.tooltipLabel()).toContain('1 sprawa operacyjna wymaga uwagi');
    });

    it('powinien poprawnie zwrócić listę alertItems dla kucharza', () => {
      mockRoleSignal.set('kitchen');
      const alerts = service.activeAlertItems();
      expect(alerts.length).toBe(1);
      expect(alerts[0].title).toContain('#101');
      expect(alerts[0].route).toBe('/orders');
    });
  });
});
