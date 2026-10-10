import { TestBed } from '@angular/core/testing';
import { TableService } from './table.service';
import { Firestore } from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { OrderService } from './order.service';
import { ToastService } from './toast.service';
import { RestaurantTable } from '../models/table.model';
import { Order } from '../models/order.model';
import { signal } from '@angular/core';

describe('TableService (Floor Plan & Table Lifecycle Engine)', () => {
  let service: TableService;
  let mockOrdersSignal: ReturnType<typeof signal<Order[]>>;

  const initialTables: RestaurantTable[] = [
    { id: 'tbl-1', restaurantId: 'rest-1', number: 'Stolik 1', zone: 'Sala Główna', seats: 4, status: 'free' },
    { id: 'tbl-2', restaurantId: 'rest-1', number: 'Stolik 2', zone: 'Sala Główna', seats: 2, status: 'occupied', occupiedSince: '2026-10-10T15:00:00Z' },
    { id: 'tbl-3', restaurantId: 'rest-1', number: 'Stolik 3', zone: 'Antresola', seats: 6, status: 'bill_requested', occupiedSince: '2026-10-10T14:30:00Z' },
    { id: 'tbl-4', restaurantId: 'rest-1', number: 'Stolik 4', zone: 'Ogródek', seats: 4, status: 'dirty' }
  ];

  beforeEach(() => {
    mockOrdersSignal = signal<Order[]>([]);

    const mockFirestore = {};
    const mockAuthService = {
      currentUser: signal(null),
      currentUserId: 'rest-1'
    };
    const mockOrderService = {
      orders: mockOrdersSignal,
      getElapsedTime: jasmine.createSpy('getElapsedTime').and.returnValue('25 min temu')
    };
    const mockToastService = {
      success: jasmine.createSpy('success'),
      info: jasmine.createSpy('info'),
      warning: jasmine.createSpy('warning'),
      danger: jasmine.createSpy('danger')
    };

    TestBed.configureTestingModule({
      providers: [
        TableService,
        { provide: Firestore, useValue: mockFirestore },
        { provide: AuthService, useValue: mockAuthService },
        { provide: OrderService, useValue: mockOrderService },
        { provide: ToastService, useValue: mockToastService }
      ]
    });

    service = TestBed.inject(TableService);
    service.tables.set(initialTables);
  });

  describe('Obliczanie wskaźników KPI sali (Floor Analytics)', () => {
    it('powinien poprawnie zliczyć łączną liczbę stolików i miejsc siedzących', () => {
      expect(service.totalTablesCount()).toBe(4);
      // 4 + 2 + 6 + 4 = 16 miejsc
      expect(service.totalSeatsCount()).toBe(16);
    });

    it('powinien poprawnie podzielić stoliki wg statusów', () => {
      expect(service.freeTablesCount()).toBe(1);          // Stolik 1
      expect(service.occupiedTablesCount()).toBe(1);      // Stolik 2
      expect(service.billRequestedCount()).toBe(1);       // Stolik 3
      expect(service.dirtyTablesCount()).toBe(1);          // Stolik 4
    });

    it('powinien wyliczyć wskaźnik obłożenia sali (occupancyRate)', () => {
      // 2 stoliki zajęte/rachunek z 4 łącznie = 50%
      expect(service.occupancyRate()).toBe(50);
    });
  });

  describe('Live Order Binding & Wieloetapowe bony wizyty', () => {
    it('stolik ze statusem free lub dirty nie powinien posiadać aktywnego rachunku', () => {
      const liveTables = service.tablesWithLiveStatus();
      const freeTable = liveTables.find(t => t.id === 'tbl-1');
      const dirtyTable = liveTables.find(t => t.id === 'tbl-4');

      expect(freeTable?.currentOrderTotal).toBeUndefined();
      expect(freeTable?.ordersCount).toBe(0);

      expect(dirtyTable?.currentOrderTotal).toBeUndefined();
      expect(dirtyTable?.ordersCount).toBe(0);
    });

    it('powinien zsumować kwoty i pozycje ze wszystkich bonów zamówionych przy danym stoliku', () => {
      // Przy Stoliku 2 goście najpierw zamówili pizzę, a później domówili desery i kawę
      mockOrdersSignal.set([
        {
          id: 'ord-1',
          restaurantId: 'rest-1',
          orderNumber: 101,
          tableNumber: 'Stolik 2',
          items: [
            { recipeId: 'r1', recipeName: 'Pizza Margherita', quantity: 2, unitPrice: 35 } // 70 zł, 2 szt
          ],
          totalPrice: 70,
          status: 'in_progress',
          stockDeducted: false,
          createdAt: '2026-10-10T15:05:00Z',
          updatedAt: '2026-10-10T15:05:00Z'
        },
        {
          id: 'ord-2',
          restaurantId: 'rest-1',
          orderNumber: 105,
          tableNumber: 'Stolik 2',
          items: [
            { recipeId: 'r2', recipeName: 'Tiramisu', quantity: 2, unitPrice: 22 }, // 44 zł, 2 szt
            { recipeId: 'r3', recipeName: 'Espresso', quantity: 2, unitPrice: 9 }   // 18 zł, 2 szt
          ],
          totalPrice: 62,
          status: 'ready',
          stockDeducted: false,
          createdAt: '2026-10-10T15:35:00Z',
          updatedAt: '2026-10-10T15:35:00Z'
        }
      ]);

      const liveTables = service.tablesWithLiveStatus();
      const table2 = liveTables.find(t => t.id === 'tbl-2');

      expect(table2).toBeDefined();
      // Łączna kwota = 70 + 62 = 132 zł
      expect(table2?.currentOrderTotal).toBe(132);
      // Łączna liczba dań = 2 + 2 + 2 = 6 pozycji
      expect(table2?.currentOrderItemsCount).toBe(6);
      expect(table2?.ordersCount).toBe(2);
      // Ponieważ drugie zamówienie ma status 'ready', cały stolik powinien mieć priorytet 'ready' (do wydania)
      expect(table2?.kitchenOrderStatus).toBe('ready');
    });

    it('powinien poprawnie wyliczyć gotowość do wydania (readyToServeTablesCount)', () => {
      // Stolik 2 ma gotowe danie w kuchni
      mockOrdersSignal.set([
        {
          id: 'ord-ready',
          restaurantId: 'rest-1',
          orderNumber: 101,
          tableNumber: 'Stolik 2',
          items: [{ recipeId: 'r1', recipeName: 'Pizza', quantity: 1, unitPrice: 30 }],
          totalPrice: 30,
          status: 'ready',
          stockDeducted: false,
          createdAt: '2026-10-10T15:05:00Z',
          updatedAt: '2026-10-10T15:05:00Z'
        }
      ]);

      expect(service.readyToServeTablesCount()).toBe(1);
    });

    it('powinien poprawnie zwrócić listę wszystkich aktywnych bonów dla danego stolika', () => {
      const orderA: Order = {
        id: 'ord-a',
        restaurantId: 'rest-1',
        orderNumber: 101,
        tableNumber: 'Stolik 2',
        items: [],
        totalPrice: 50,
        status: 'in_progress',
        stockDeducted: false,
        createdAt: '2026-10-10T15:05:00Z',
        updatedAt: '2026-10-10T15:05:00Z'
      };
      mockOrdersSignal.set([orderA]);

      const activeOrders = service.getActiveOrdersForTable(initialTables[1]);
      expect(activeOrders.length).toBe(1);
      expect(activeOrders[0].id).toBe('ord-a');
    });

    it('nie powinien wliczać anulowanych zamówień (status: cancelled) do rachunku stolika', () => {
      mockOrdersSignal.set([
        {
          id: 'ord-active',
          restaurantId: 'rest-1',
          orderNumber: 101,
          tableNumber: 'Stolik 2',
          items: [{ recipeId: 'r1', recipeName: 'Pizza', quantity: 1, unitPrice: 40 }],
          totalPrice: 40,
          status: 'ready',
          stockDeducted: false,
          createdAt: '2026-10-10T15:05:00Z',
          updatedAt: '2026-10-10T15:05:00Z'
        },
        {
          id: 'ord-cancelled',
          restaurantId: 'rest-1',
          orderNumber: 102,
          tableNumber: 'Stolik 2',
          items: [{ recipeId: 'r2', recipeName: 'Wino', quantity: 1, unitPrice: 90 }],
          totalPrice: 90,
          status: 'cancelled', // Anulowane zamówienie!
          stockDeducted: false,
          createdAt: '2026-10-10T15:10:00Z',
          updatedAt: '2026-10-10T15:10:00Z'
        }
      ]);

      const liveTables = service.tablesWithLiveStatus();
      const table2 = liveTables.find(t => t.id === 'tbl-2');

      // Tylko 40 zł z aktywnego zamówienia, anulowane 90 zł musi być zignorowane!
      expect(table2?.currentOrderTotal).toBe(40);
      expect(table2?.ordersCount).toBe(1);
    });

    it('powinien poprawnie dopasować zamówienia niezależnie od wielkości liter i spacji w nazwie stolika', () => {
      mockOrdersSignal.set([
        {
          id: 'ord-case-test',
          restaurantId: 'rest-1',
          orderNumber: 103,
          tableNumber: '  stolik 2  ', // małe litery i dodatkowe spacje
          items: [{ recipeId: 'r1', recipeName: 'Calzone', quantity: 1, unitPrice: 38 }],
          totalPrice: 38,
          status: 'in_progress',
          stockDeducted: false,
          createdAt: '2026-10-10T15:05:00Z',
          updatedAt: '2026-10-10T15:05:00Z'
        }
      ]);

      const liveTables = service.tablesWithLiveStatus();
      const table2 = liveTables.find(t => t.id === 'tbl-2');

      expect(table2?.currentOrderTotal).toBe(38);
      expect(table2?.ordersCount).toBe(1);
    });
  });
});
