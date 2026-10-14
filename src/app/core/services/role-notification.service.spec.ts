import { TestBed } from '@angular/core/testing';
import { RoleNotificationService } from './role-notification.service';
import { AuthService } from './auth.service';
import { OrderService } from './order.service';
import { InventoryService } from './inventory.service';
import { TableService } from './table.service';
import { RecipeService } from './recipe.service';
import { ToastService } from './toast.service';
import { signal } from '@angular/core';
import { Order } from '../models/order.model';
import { InventoryItem } from '../models/inventory-item.model';
import { RestaurantTable } from '../models/table.model';
import { Recipe, RecipeCapacityResult } from '../models/recipe.model';
import { UserRole } from '../models/staff.model';

describe('RoleNotificationService (Role-specific Toasts & Alerts)', () => {
  let service: RoleNotificationService;
  let mockRoleSignal: ReturnType<typeof signal<UserRole>>;
  let mockOrdersSignal: ReturnType<typeof signal<Order[]>>;
  let mockInventorySignal: ReturnType<typeof signal<InventoryItem[]>>;
  let mockTablesSignal: ReturnType<typeof signal<RestaurantTable[]>>;
  let mockRecipesSignal: ReturnType<typeof signal<Recipe[]>>;
  let mockCapacitiesSignal: ReturnType<typeof signal<Map<string, RecipeCapacityResult>>>;
  let mockTodaysRevenueSignal: ReturnType<typeof signal<number>>;
  let mockDailyRevenueTargetSignal: ReturnType<typeof signal<number>>;

  let mockToastService: {
    info: jasmine.Spy;
    success: jasmine.Spy;
    warning: jasmine.Spy;
    danger: jasmine.Spy;
  };

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
    }
  ];

  const initialTables: RestaurantTable[] = [
    { id: 'tbl-1', restaurantId: 'rest-1', number: 'Stolik 1', zone: 'Sala Główna', seats: 4, status: 'occupied' },
    { id: 'tbl-2', restaurantId: 'rest-1', number: 'Stolik 2', zone: 'Sala Główna', seats: 2, status: 'free' }
  ];

  const initialRecipes: Recipe[] = [
    {
      id: 'rec-1',
      restaurantId: 'rest-1',
      name: 'Pizza Margherita',
      category: 'Pizza',
      sellingPrice: 32,
      ingredients: [],
      isAvailable: true,
      updatedAt: new Date().toISOString()
    },
    {
      id: 'rec-2',
      restaurantId: 'rest-1',
      name: 'Panna Cotta',
      category: 'Desery',
      sellingPrice: 18,
      ingredients: [],
      isAvailable: true,
      updatedAt: new Date().toISOString()
    }
  ];

  const initialCapacities = new Map<string, RecipeCapacityResult>([
    ['rec-1', { maxPortions: 10, status: 'available', ingredientDetails: [] }],
    ['rec-2', { maxPortions: 8, status: 'available', ingredientDetails: [] }]
  ]);

  const initialInventory: InventoryItem[] = [
    {
      id: 'inv-1',
      restaurantId: 'rest-1',
      name: 'Mąka Typ 00',
      category: 'Suche',
      unit: 'g',
      amount: 0,
      minAmount: 1000
    }
  ];

  beforeEach(() => {
    mockRoleSignal = signal<UserRole>('kitchen');
    mockOrdersSignal = signal<Order[]>(initialOrders);
    mockInventorySignal = signal<InventoryItem[]>(initialInventory);
    mockTablesSignal = signal<RestaurantTable[]>(initialTables);
    mockRecipesSignal = signal<Recipe[]>(initialRecipes);
    mockCapacitiesSignal = signal<Map<string, RecipeCapacityResult>>(new Map(initialCapacities));
    mockTodaysRevenueSignal = signal<number>(1200);
    mockDailyRevenueTargetSignal = signal<number>(3000);

    const mockAuthService = {
      currentUserRole: mockRoleSignal
    };

    const mockOrderService = {
      orders: mockOrdersSignal,
      todaysRevenue: mockTodaysRevenueSignal,
      dailyRevenueTarget: mockDailyRevenueTargetSignal,
      getElapsedTime: jasmine.createSpy('getElapsedTime').and.returnValue('3 min temu')
    };

    const mockInventoryService = {
      items: mockInventorySignal,
      outOfStockItems: () => mockInventorySignal().filter(i => i.amount <= 0)
    };

    const mockTableService = {
      tables: mockTablesSignal
    };

    const mockRecipeService = {
      recipes: mockRecipesSignal,
      capacitiesMap: mockCapacitiesSignal
    };

    mockToastService = {
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
        { provide: TableService, useValue: mockTableService },
        { provide: RecipeService, useValue: mockRecipeService },
        { provide: ToastService, useValue: mockToastService }
      ]
    });

    service = TestBed.inject(RoleNotificationService);
    // Wywołaj pierwszy cykl efektów dla inicjalizacji istniejącego stanu bez alertów powitalnych
    TestBed.flushEffects();
  });

  describe('1. Kucharz (kitchen)', () => {
    it('powinien wyświetlić Toast info o nowym bonie w kolejce', () => {
      mockRoleSignal.set('kitchen');

      const newOrder: Order = {
        id: 'ord-new',
        restaurantId: 'rest-1',
        orderNumber: 105,
        tableNumber: 'Stolik 4',
        items: [{ recipeId: 'rec-1', recipeName: 'Margherita', quantity: 1, unitPrice: 32 }],
        totalPrice: 32,
        status: 'pending',
        notes: 'Bez cebuli',
        stockDeducted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      mockOrdersSignal.set([...initialOrders, newOrder]);
      TestBed.flushEffects();

      expect(mockToastService.info).toHaveBeenCalledWith(
        jasmine.stringMatching(/Bon #105 dla Stolik 4.*Bez cebuli/),
        '🔔 Nowe zamówienie w kolejce'
      );
    });

    it('powinien poprawnie zliczać unreadCount dla kucharza (tylko pending)', () => {
      mockRoleSignal.set('kitchen');
      expect(service.unreadCount()).toBe(1); // ord-1
      expect(service.tooltipLabel()).toContain('1 zamówienie czeka w kolejce');
    });
  });

  describe('2. Kasjer / Kelner (waiter)', () => {
    beforeEach(() => {
      mockRoleSignal.set('waiter');
      TestBed.flushEffects();
    });

    it('powinien wyświetlić Toast success gdy danie jest gotowe na wydawce', () => {
      const updatedOrders = initialOrders.map(o =>
        o.id === 'ord-1' ? { ...o, status: 'ready' as const } : o
      );

      mockOrdersSignal.set(updatedOrders);
      TestBed.flushEffects();

      expect(mockToastService.success).toHaveBeenCalledWith(
        jasmine.stringMatching(/Bon #101 \(Stolik 1\) czeka na odbiór z wydawki!/),
        '🍽️ Danie gotowe do wydania'
      );
    });

    it('powinien wyświetlić Toast info gdy gość prosi o rachunek', () => {
      const updatedTables = initialTables.map(t =>
        t.id === 'tbl-1' ? { ...t, status: 'bill_requested' as const } : t
      );

      mockTablesSignal.set(updatedTables);
      TestBed.flushEffects();

      expect(mockToastService.info).toHaveBeenCalledWith(
        jasmine.stringMatching(/Stolik Stolik 1 prosi o rachunek/),
        '🧾 Prośba o rachunek'
      );
    });

    it('powinien wyświetlić Toast warning gdy pozostaną tylko 3 porcje potrawy (końcówka porcji)', () => {
      const updatedCapacities = new Map(mockCapacitiesSignal());
      updatedCapacities.set('rec-1', { maxPortions: 3, status: 'low', ingredientDetails: [] });

      mockCapacitiesSignal.set(updatedCapacities);
      TestBed.flushEffects();

      expect(mockToastService.warning).toHaveBeenCalledWith(
        jasmine.stringMatching(/Pozostały już tylko 3 porcje.*Pizza Margherita/),
        '⚠️ Końcówka porcji'
      );
    });

    it('powinien wyświetlić Toast danger gdy danie zostanie całkowicie wyprzedane (0 porcji)', () => {
      const updatedCapacities = new Map(mockCapacitiesSignal());
      updatedCapacities.set('rec-2', { maxPortions: 0, status: 'blocked', ingredientDetails: [] });

      mockCapacitiesSignal.set(updatedCapacities);
      TestBed.flushEffects();

      expect(mockToastService.danger).toHaveBeenCalledWith(
        jasmine.stringMatching(/Danie "Panna Cotta" zostało wyprzedane/),
        '🚫 Danie wyprzedane'
      );
    });

    it('powinien poprawnie zliczać unreadCount dla kelnera (gotowe dania + stoliki z rachunkiem)', () => {
      expect(service.unreadCount()).toBe(1); // ord-2 (ready)

      // Dodaj stolik z rachunkiem
      const updatedTables = initialTables.map(t =>
        t.id === 'tbl-1' ? { ...t, status: 'bill_requested' as const } : t
      );
      mockTablesSignal.set(updatedTables);
      TestBed.flushEffects();

      expect(service.unreadCount()).toBe(2);
    });
  });

  describe('3. Menedżer (manager)', () => {
    beforeEach(() => {
      mockRoleSignal.set('manager');
      TestBed.flushEffects();
    });

    it('powinien wyświetlić Toast warning dla menedżera przy końcówce porcji (3 porcje)', () => {
      const updatedCapacities = new Map(mockCapacitiesSignal());
      updatedCapacities.set('rec-1', { maxPortions: 3, status: 'low', ingredientDetails: [] });

      mockCapacitiesSignal.set(updatedCapacities);
      TestBed.flushEffects();

      expect(mockToastService.warning).toHaveBeenCalledWith(
        jasmine.stringMatching(/Pozostały już tylko 3 porcje.*Pizza Margherita/),
        '⚠️ Końcówka porcji'
      );
    });

    it('powinien wyświetlić Toast danger dla menedżera przy wyprzedaniu dania', () => {
      const updatedCapacities = new Map(mockCapacitiesSignal());
      updatedCapacities.set('rec-1', { maxPortions: 0, status: 'blocked', ingredientDetails: [] });

      mockCapacitiesSignal.set(updatedCapacities);
      TestBed.flushEffects();

      expect(mockToastService.danger).toHaveBeenCalledWith(
        jasmine.stringMatching(/Danie "Pizza Margherita" zostało wyprzedane/),
        '🚫 Danie wyprzedane'
      );
    });
  });

  describe('4. Właściciel (owner)', () => {
    it('powinien wyświetlić Toast success gdy lokal osiągnie dzienny cel obrotu', () => {
      mockRoleSignal.set('owner');
      mockDailyRevenueTargetSignal.set(3000);

      // Obrót przekracza cel
      mockTodaysRevenueSignal.set(3250);
      TestBed.flushEffects();

      expect(mockToastService.success).toHaveBeenCalledWith(
        jasmine.stringMatching(/Lokal osiągnął dzienny cel obrotu \(3250 zł z planowanych 3000 zł\)/),
        '🎯 Cel dzienny osiągnięty'
      );
    });

    it('nie powinien wyświetlać powiadomienia celów obrotu dla kucharza lub kelnera', () => {
      mockRoleSignal.set('kitchen');
      mockDailyRevenueTargetSignal.set(3000);

      mockTodaysRevenueSignal.set(3500);
      TestBed.flushEffects();

      expect(mockToastService.success).not.toHaveBeenCalled();
    });
  });
});
