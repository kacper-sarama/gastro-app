import { TestBed } from '@angular/core/testing';
import { NewOrderModalComponent } from './new-order-modal.component';
import { RecipeService } from '../../core/services/recipe.service';
import { OrderService } from '../../core/services/order.service';
import { TableService } from '../../core/services/table.service';
import { PromotionService } from '../../core/services/promotion.service';
import { signal } from '@angular/core';
import { Recipe, RecipeCapacityResult } from '../../core/models/recipe.model';
import { Order } from '../../core/models/order.model';
import { RestaurantTable } from '../../core/models/table.model';

describe('NewOrderModalComponent (Order Creation & Table/Takeout Flow)', () => {
  let component: NewOrderModalComponent;

  let mockRecipesSignal: ReturnType<typeof signal<Recipe[]>>;
  let mockCapacitiesMapSignal: ReturnType<typeof signal<Map<string, RecipeCapacityResult>>>;
  let mockOrdersSignal: ReturnType<typeof signal<Order[]>>;
  let mockTablesSignal: ReturnType<typeof signal<RestaurantTable[]>>;
  let mockActivePromotionsSignal: ReturnType<typeof signal<any[]>>;

  let mockOrderService: {
    orders: typeof mockOrdersSignal;
    createOrder: jasmine.Spy;
  };

  let mockTableService: {
    tables: typeof mockTablesSignal;
    tablesWithLiveStatus: typeof mockTablesSignal;
    totalTablesCount: ReturnType<typeof signal<number>>;
    availableZones: ReturnType<typeof signal<string[]>>;
    occupyTableByNumber: jasmine.Spy;
  };

  const testRecipes: Recipe[] = [
    {
      id: 'rec-1',
      restaurantId: 'rest-1',
      name: 'Pizza Margherita',
      category: 'Pizza',
      sellingPrice: 35,
      ingredients: [],
      isAvailable: true,
      updatedAt: '2026-10-10T12:00:00Z'
    },
    {
      id: 'rec-2',
      restaurantId: 'rest-1',
      name: 'Coca-Cola 0.33l',
      category: 'Napoje',
      sellingPrice: 10,
      ingredients: [],
      isAvailable: true,
      updatedAt: '2026-10-10T12:00:00Z'
    }
  ];

  const testTables: RestaurantTable[] = [
    {
      id: 'tbl-1',
      restaurantId: 'rest-1',
      number: 'Stolik 1',
      zone: 'Sala Główna',
      seats: 4,
      status: 'free',
      createdAt: '2026-10-10T12:00:00Z',
      updatedAt: '2026-10-10T12:00:00Z'
    },
    {
      id: 'tbl-2',
      restaurantId: 'rest-1',
      number: 'Stolik 2',
      zone: 'Sala Główna',
      seats: 2,
      status: 'occupied',
      createdAt: '2026-10-10T12:00:00Z',
      updatedAt: '2026-10-10T12:00:00Z'
    },
    {
      id: 'tbl-bar-1',
      restaurantId: 'rest-1',
      number: 'Bar 1',
      zone: 'Bar',
      seats: 2,
      status: 'free',
      createdAt: '2026-10-10T12:00:00Z',
      updatedAt: '2026-10-10T12:00:00Z'
    }
  ];

  const testOrders: Order[] = [
    {
      id: 'ord-100',
      restaurantId: 'rest-1',
      orderNumber: 100,
      tableNumber: 'Stolik 1',
      items: [],
      totalPrice: 35,
      status: 'completed',
      stockDeducted: true,
      createdAt: '2026-10-10T12:00:00Z',
      updatedAt: '2026-10-10T12:00:00Z'
    },
    {
      id: 'ord-101',
      restaurantId: 'rest-1',
      orderNumber: 101,
      tableNumber: 'Stolik 2',
      items: [],
      totalPrice: 70,
      status: 'in_progress',
      stockDeducted: false,
      createdAt: '2026-10-10T12:00:00Z',
      updatedAt: '2026-10-10T12:00:00Z'
    }
  ];

  beforeEach(() => {
    mockRecipesSignal = signal<Recipe[]>([...testRecipes]);
    mockCapacitiesMapSignal = signal<Map<string, RecipeCapacityResult>>(
      new Map([
        ['rec-1', { maxPortions: 10, status: 'available', ingredientDetails: [] }],
        ['rec-2', { maxPortions: 2, status: 'low', ingredientDetails: [] }] // Limit 2 sztuki
      ])
    );
    mockOrdersSignal = signal<Order[]>([...testOrders]);
    mockTablesSignal = signal<RestaurantTable[]>([...testTables]);
    mockActivePromotionsSignal = signal<any[]>([]);

    const mockRecipeService = {
      recipes: mockRecipesSignal,
      capacitiesMap: mockCapacitiesMapSignal
    };

    mockOrderService = {
      orders: mockOrdersSignal,
      createOrder: jasmine.createSpy('createOrder').and.resolveTo({
        id: 'ord-new-102',
        orderNumber: 102,
        totalPrice: 45
      })
    };

    mockTableService = {
      tables: mockTablesSignal,
      tablesWithLiveStatus: mockTablesSignal,
      totalTablesCount: signal(3),
      availableZones: signal(['Sala Główna', 'Bar']),
      occupyTableByNumber: jasmine.createSpy('occupyTableByNumber').and.resolveTo()
    };

    const mockPromotionService = {
      activePromotions: mockActivePromotionsSignal,
      calculateValidationAndDiscount: jasmine.createSpy('calculateValidationAndDiscount').and.returnValue({
        isEligible: false,
        discountAmount: 0
      })
    };

    TestBed.configureTestingModule({
      providers: [
        NewOrderModalComponent,
        { provide: RecipeService, useValue: mockRecipeService },
        { provide: OrderService, useValue: mockOrderService },
        { provide: TableService, useValue: mockTableService },
        { provide: PromotionService, useValue: mockPromotionService }
      ]
    });

    component = TestBed.inject(NewOrderModalComponent);
  });

  describe('Inicjalizacja i Input initialTableNumber', () => {
    it('powinien domyślnie ustawić Stolik 1 i strefę "all"', () => {
      expect(component.tableNumber()).toBe('Stolik 1');
      expect(component.selectedModalZone()).toBe('all');
    });

    it('powinien poprawnie wykryć strefę stolika przy przekazaniu initialTableNumber', () => {
      component.initialTableNumber = 'Bar 1';

      expect(component.tableNumber()).toBe('Bar 1');
      expect(component.selectedModalZone()).toBe('Bar');
    });

    it('powinien przełączyć na strefę "takeout" i wyodrębnić dane klienta przy zamówieniu na wynos', () => {
      component.initialTableNumber = 'Wynos (Jan Kowalski, 500-123-456)';

      expect(component.selectedModalZone()).toBe('takeout');
      expect(component.takeoutCustomerInfo()).toBe('Jan Kowalski, 500-123-456');
    });
  });

  describe('Płaska nawigacja stref i obsługa Wynosu (selectModalZone & onTakeoutCustomerChange)', () => {
    it('nextOrderNumber() powinien wyliczyć kolejny numer zamówienia (max + 1)', () => {
      // W bazie najwyższy numer to 101 => kolejny powinien być 102
      expect(component.nextOrderNumber()).toBe(102);
    });

    it('selectModalZone("takeout") powinien ustawić strefę wynosu i opróżnić modalTables', () => {
      component.selectModalZone('takeout');

      expect(component.selectedModalZone()).toBe('takeout');
      expect(component.tableNumber()).toBe('Wynos / Odbiór');
      expect(component.modalTables()).toEqual([]);
    });

    it('onTakeoutCustomerChange() powinien dynamicznie aktualizować tableNumber z danymi klienta', () => {
      component.selectModalZone('takeout');
      component.onTakeoutCustomerChange('Anna Nowak');

      expect(component.takeoutCustomerInfo()).toBe('Anna Nowak');
      expect(component.tableNumber()).toBe('Wynos (Anna Nowak)');
    });

    it('selectModalZone("Bar") powinien przywrócić stoliki sali i zresetować oznaczenie wynosu', () => {
      component.selectModalZone('takeout');
      expect(component.tableNumber()).toBe('Wynos / Odbiór');

      component.selectModalZone('Bar');

      expect(component.selectedModalZone()).toBe('Bar');
      expect(component.tableNumber()).toBe('Bar 1');
      expect(component.modalTables().length).toBe(1);
    });
  });

  describe('Koszyk i sterowanie pozycjami (incrementItem, decrementItem)', () => {
    it('powinien dodawać pozycję do koszyka i poprawnie liczyć totalPrice oraz totalItemsCount', () => {
      component.incrementItem('rec-1'); // 1x 35 zł
      component.incrementItem('rec-1'); // 2x 35 zł
      component.incrementItem('rec-2'); // 1x 10 zł

      expect(component.totalItemsCount()).toBe(3);
      expect(component.totalPrice()).toBe(80); // 70 + 10
      expect(component.selectedItems().length).toBe(2);
    });

    it('powinien zablokować zwiększenie ilości ponad stan magazynowy (maxAllowed)', () => {
      // rec-2 ma limit maxPortions: 2
      component.incrementItem('rec-2'); // 1
      component.incrementItem('rec-2'); // 2
      expect(component.getQuantity('rec-2')).toBe(2);

      // Próba dodania 3. sztuki
      component.incrementItem('rec-2');
      expect(component.getQuantity('rec-2')).toBe(2);
      expect(component.errorMessage()).toContain('Osiągnięto limit surowców');
    });

    it('decrementItem() powinien zmniejszać ilość i usuwać pozycję, gdy osiągnie 0', () => {
      component.incrementItem('rec-1');
      component.incrementItem('rec-1');
      expect(component.getQuantity('rec-1')).toBe(2);

      component.decrementItem('rec-1');
      expect(component.getQuantity('rec-1')).toBe(1);

      component.decrementItem('rec-1');
      expect(component.getQuantity('rec-1')).toBe(0);
      expect(component.selectedItems().length).toBe(0);
    });
  });

  describe('Nawigacja w Stepperze (goToStep)', () => {
    it('powinien zablokować przejście do Kroku 2 lub 3, gdy koszyk jest pusty', () => {
      component.goToStep(2);
      expect(component.currentStep()).toBe(1);
      expect(component.errorMessage()).toContain('Wybierz co najmniej jedno danie');

      component.goToStep(3);
      expect(component.currentStep()).toBe(1);
    });

    it('powinien zezwolić na przejście do kolejnych kroków po wybraniu dań', () => {
      component.incrementItem('rec-1');

      component.goToStep(2);
      expect(component.currentStep()).toBe(2);
      expect(component.errorMessage()).toBeNull();

      component.goToStep(3);
      expect(component.currentStep()).toBe(3);
    });
  });

  describe('Wysyłanie zamówienia (onSubmitOrder)', () => {
    it('powinien zarejestrować zamówienie w OrderService i oznaczyć stolik jako zajęty', async () => {
      const closeSpy = spyOn(component.close, 'emit');
      const createdSpy = spyOn(component.created, 'emit');

      component.incrementItem('rec-1'); // 1x Margherita
      component.selectQuickTable('Stolik 1');

      await component.onSubmitOrder();

      expect(mockOrderService.createOrder).toHaveBeenCalledWith(
        jasmine.objectContaining({
          tableNumber: 'Stolik 1',
          items: jasmine.arrayContaining([
            jasmine.objectContaining({ recipeId: 'rec-1', quantity: 1, unitPrice: 35 })
          ])
        })
      );

      expect(mockTableService.occupyTableByNumber).toHaveBeenCalledWith(
        'Stolik 1',
        jasmine.objectContaining({
          orderNumber: 102
        })
      );

      expect(createdSpy).toHaveBeenCalled();
      expect(closeSpy).toHaveBeenCalled();
    });

    it('nie powinien oznaczać stolika sali jako zajęty, gdy wybrano Wynos', async () => {
      component.incrementItem('rec-1');
      component.selectModalZone('takeout');

      await component.onSubmitOrder();

      expect(mockOrderService.createOrder).toHaveBeenCalledWith(
        jasmine.objectContaining({
          tableNumber: 'Wynos / Odbiór'
        })
      );

      // Dla wynosu occupyTableByNumber NIE powinien zostać wywołany
      expect(mockTableService.occupyTableByNumber).not.toHaveBeenCalled();
    });
  });
});
