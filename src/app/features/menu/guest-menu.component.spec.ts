import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { GuestMenuComponent } from './guest-menu.component';
import { ActivatedRoute } from '@angular/router';
import { RecipeService } from '../../core/services/recipe.service';
import { InventoryService } from '../../core/services/inventory.service';
import { OrderService } from '../../core/services/order.service';
import { TableService } from '../../core/services/table.service';
import { ThemeService } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/services/auth.service';
import { signal } from '@angular/core';
import { Recipe } from '../../core/models/recipe.model';
import { InventoryItem } from '../../core/models/inventory-item.model';
import { Order } from '../../core/models/order.model';

describe('GuestMenuComponent (Pay-at-Table & Online Payments with BLIK/Card)', () => {
  let component: GuestMenuComponent;
  let fixture: ComponentFixture<GuestMenuComponent>;

  let mockRecipeService: {
    recipes: ReturnType<typeof signal<Recipe[]>>;
    activeRestaurantName: ReturnType<typeof signal<string>>;
    getCapacity: jasmine.Spy;
    loadRestaurantData: jasmine.Spy;
  };

  let mockInventoryService: {
    items: ReturnType<typeof signal<InventoryItem[]>>;
    loadRestaurantData: jasmine.Spy;
  };

  let mockOrderService: {
    createGuestOrder: jasmine.Spy;
    watchOrder: jasmine.Spy;
  };

  let mockTableService: {
    occupyTableByNumber: jasmine.Spy;
  };

  let mockToastService: {
    info: jasmine.Spy;
    success: jasmine.Spy;
    warning: jasmine.Spy;
    danger: jasmine.Spy;
  };

  let mockThemeService: {
    isDarkMode: boolean;
    toggleTheme: jasmine.Spy;
  };

  const sampleDishes: Recipe[] = [
    {
      id: 'dish-1',
      restaurantId: 'rest-123',
      name: 'Pizza Margherita',
      category: 'Pizza',
      sellingPrice: 38,
      isAvailable: true,
      ingredients: [{ inventoryItemId: 'ing-1', amount: 200 }],
      updatedAt: '2026-10-10T12:00:00Z'
    },
    {
      id: 'dish-2',
      restaurantId: 'rest-123',
      name: 'Penne Arrabbiata',
      category: 'Makarony',
      sellingPrice: 32,
      isAvailable: true,
      ingredients: [{ inventoryItemId: 'ing-2', amount: 150 }],
      updatedAt: '2026-10-10T12:00:00Z'
    },
    {
      id: 'dish-3-soldout',
      restaurantId: 'rest-123',
      name: 'Tiramisu',
      category: 'Desery',
      sellingPrice: 22,
      isAvailable: true,
      ingredients: [],
      updatedAt: '2026-10-10T12:00:00Z'
    }
  ];

  beforeEach(async () => {
    mockRecipeService = {
      recipes: signal<Recipe[]>(sampleDishes),
      activeRestaurantName: signal<string>('Trattoria Bella'),
      getCapacity: jasmine.createSpy('getCapacity').and.callFake((id: string) => {
        if (id === 'dish-3-soldout') {
          return { status: 'blocked', maxPortions: 0, limitingIngredient: 'Mascarpone' };
        }
        return { status: 'ok', maxPortions: 15, limitingIngredient: null };
      }),
      loadRestaurantData: jasmine.createSpy('loadRestaurantData')
    };

    mockInventoryService = {
      items: signal<InventoryItem[]>([
        { id: 'ing-1', restaurantId: 'rest-123', name: 'Mąka', amount: 5000, unit: 'g', minAmount: 1000 }
      ]),
      loadRestaurantData: jasmine.createSpy('loadRestaurantData')
    };

    mockOrderService = {
      createGuestOrder: jasmine.createSpy('createGuestOrder').and.resolveTo({
        id: 'ord-999',
        restaurantId: 'rest-123',
        orderNumber: 108,
        tableNumber: 'Stolik 3',
        status: 'pending',
        stockDeducted: false,
        totalPrice: 70,
        paid: true,
        paymentMethod: 'BLIK',
        items: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } as Order),
      watchOrder: jasmine.createSpy('watchOrder').and.returnValue(() => {})
    };

    mockTableService = {
      occupyTableByNumber: jasmine.createSpy('occupyTableByNumber').and.resolveTo()
    };

    mockToastService = {
      info: jasmine.createSpy('info'),
      success: jasmine.createSpy('success'),
      warning: jasmine.createSpy('warning'),
      danger: jasmine.createSpy('danger')
    };

    mockThemeService = {
      isDarkMode: false,
      toggleTheme: jasmine.createSpy('toggleTheme')
    };

    await TestBed.configureTestingModule({
      imports: [GuestMenuComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: () => 'rest-123' },
              queryParamMap: {
                get: (key: string) => (key === 'table' ? 'Stolik 3' : null)
              }
            }
          }
        },
        { provide: RecipeService, useValue: mockRecipeService },
        { provide: InventoryService, useValue: mockInventoryService },
        { provide: OrderService, useValue: mockOrderService },
        { provide: TableService, useValue: mockTableService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ThemeService, useValue: mockThemeService },
        { provide: AuthService, useValue: { currentUser: signal(null), isDemoAccount: signal(true) } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(GuestMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('powinien zainicjalizować kontekst lokalu i stolika z parametrów URL', () => {
    expect(component.restaurantId()).toBe('rest-123');
    expect(component.tableNumber()).toBe('Stolik 3');
    expect(component.orderType()).toBe('dine_in');
    expect(mockRecipeService.loadRestaurantData).toHaveBeenCalledWith('rest-123');
  });

  describe('Koszyk gościa (Cart Management)', () => {
    it('powinien dodawać pozycję do koszyka i aktualizować licznik oraz sumę', () => {
      const pizza = sampleDishes[0]; // 38 zł
      component.addToCart(pizza);

      expect(component.getItemQuantity('dish-1')).toBe(1);
      expect(component.cartCount()).toBe(1);
      expect(component.cartTotal()).toBe(38);

      // Dodaj drugą sztukę
      component.addToCart(pizza);
      expect(component.getItemQuantity('dish-1')).toBe(2);
      expect(component.cartCount()).toBe(2);
      expect(component.cartTotal()).toBe(76);
    });

    it('powinien blokować dodanie wyprzedanego dania (status blocked)', () => {
      const soldOutDish = sampleDishes[2]; // Tiramisu
      component.addToCart(soldOutDish);

      expect(component.getItemQuantity('dish-3-soldout')).toBe(0);
      expect(mockToastService.warning).toHaveBeenCalledWith(
        'To danie jest chwilowo wyprzedane.',
        'Brak dostępności'
      );
    });

    it('powinien zmniejszać i usuwać pozycję z koszyka', () => {
      const pizza = sampleDishes[0];
      component.addToCart(pizza);
      component.addToCart(pizza);
      expect(component.getItemQuantity('dish-1')).toBe(2);

      component.removeFromCart('dish-1');
      expect(component.getItemQuantity('dish-1')).toBe(1);

      component.removeFromCart('dish-1');
      expect(component.getItemQuantity('dish-1')).toBe(0);
      expect(component.cartCount()).toBe(0);
    });

    it('powinien poprawnie wyczyścić koszyk', () => {
      component.addToCart(sampleDishes[0]);
      component.addToCart(sampleDishes[1]);
      expect(component.cartCount()).toBe(2);

      component.clearCart();
      expect(component.cartCount()).toBe(0);
      expect(component.cartTotal()).toBe(0);
    });
  });

  describe('Formatowanie wejścia kodu BLIK', () => {
    it('powinien ograniczać kod BLIK do maksymalnie 6 cyfr i usuwać znaki niebędące cyframi', () => {
      const mockEvent = {
        target: { value: '123-abc-4567' }
      } as unknown as Event;

      component.formatBlikInput(mockEvent);
      expect(component.blikCode()).toBe('123456');
    });
  });

  describe('Płatności Online i Zamawianie (BLIK / Karta / Gotówka)', () => {
    it('powinien walidować 6-cyfrowy kod BLIK przed wysłaniem', async () => {
      component.addToCart(sampleDishes[0]);
      component.paymentMethod.set('BLIK');
      component.blikCode.set('123'); // Zbyt krótki kod

      await component.proceedToPayment();

      expect(component.blikError()).toBe('Kod BLIK musi składać się dokładnie z 6 cyfr.');
      expect(mockOrderService.createGuestOrder).not.toHaveBeenCalled();
    });

    it('powinien przejść przez autoryzację BLIK i utworzyć opłacone zamówienie', fakeAsync(() => {
      component.addToCart(sampleDishes[0]); // 38 zł
      component.paymentMethod.set('BLIK');
      component.blikCode.set('777888');

      component.proceedToPayment();

      // Stan oczekiwania na akceptację w banku
      expect(component.isAwaitingBankAuth()).toBeTrue();

      // Symulacja upływu 2.5s na autoryzację w aplikacji bankowej
      tick(2600);

      expect(mockOrderService.createGuestOrder).toHaveBeenCalledWith(
        'rest-123',
        jasmine.objectContaining({
          tableNumber: 'Stolik 3',
          paid: true,
          paymentMethod: 'BLIK',
          isTakeout: false
        })
      );
      expect(mockTableService.occupyTableByNumber).toHaveBeenCalledWith(
        'Stolik 3',
        jasmine.objectContaining({
          orderNumber: 108,
          total: 70
        })
      );
      expect(component.completedOrder()).not.toBeNull();
      expect(component.cartCount()).toBe(0); // Koszyk wyczyszczony
      expect(mockOrderService.watchOrder).toHaveBeenCalledWith('ord-999', jasmine.any(Function));
    }));

    it('powinien poprawnie przetworzyć zamówienie na wynos z płatnością gotówkową', fakeAsync(() => {
      component.addToCart(sampleDishes[1]); // 32 zł
      component.orderType.set('takeout');
      component.customerName.set('Jan Kowalski');
      component.customerPhone.set('600100200');
      component.paymentMethod.set('Gotówka');

      component.proceedToPayment();
      tick(100);

      expect(mockOrderService.createGuestOrder).toHaveBeenCalledWith(
        'rest-123',
        jasmine.objectContaining({
          tableNumber: 'Wynos',
          isTakeout: true,
          paid: false,
          paymentMethod: 'Gotówka',
          customerName: 'Jan Kowalski',
          customerPhone: '600100200'
        })
      );

      // Dla wynosu nie zajmujemy stolika
      expect(mockTableService.occupyTableByNumber).not.toHaveBeenCalled();
    }));

    it('powinien poprawnie zresetować widok po kliknięciu "Złóż kolejne zamówienie"', () => {
      component.completedOrder.set({
        id: 'ord-123',
        restaurantId: 'rest-123',
        orderNumber: 105,
        tableNumber: 'Stolik 1',
        items: [],
        totalPrice: 50,
        status: 'pending',
        stockDeducted: false,
        createdAt: '',
        updatedAt: ''
      });

      component.resetOrderView();
      expect(component.completedOrder()).toBeNull();
    });
  });
});
