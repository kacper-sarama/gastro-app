import { TestBed } from '@angular/core/testing';
import { OrderService } from './order.service';
import { Firestore } from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { InventoryService } from './inventory.service';
import { RecipeService } from './recipe.service';
import { ToastService } from './toast.service';
import { PromotionService } from './promotion.service';
import { Order } from '../models/order.model';
import { Recipe } from '../models/recipe.model';
import { InventoryItem } from '../models/inventory-item.model';
import { signal } from '@angular/core';

describe('OrderService (KDS & Automatic Warehouse Stock Deduction)', () => {
  let service: OrderService;
  let mockInventoryService: {
    items: ReturnType<typeof signal<InventoryItem[]>>;
    quickAdjustStock: jasmine.Spy;
  };
  let mockRecipeService: {
    recipes: ReturnType<typeof signal<Recipe[]>>;
  };
  let mockToastService: {
    success: jasmine.Spy;
    info: jasmine.Spy;
    warning: jasmine.Spy;
    danger: jasmine.Spy;
  };

  const mockRecipes: Recipe[] = [
    {
      id: 'rec-margherita',
      restaurantId: 'rest-1',
      name: 'Pizza Margherita',
      category: 'Pizza',
      sellingPrice: 35,
      ingredients: [
        { inventoryItemId: 'ing-flour', amount: 250 },      // 250g mąki
        { inventoryItemId: 'ing-mozzarella', amount: 150 }, // 150g mozzarelli
        { inventoryItemId: 'ing-sauce', amount: 100 }       // 100ml sosu
      ],
      updatedAt: '2026-10-10T12:00:00Z'
    }
  ];

  const mockInventoryItems: InventoryItem[] = [
    { id: 'ing-flour', restaurantId: 'rest-1', name: 'Mąka Caputo', amount: 5000, unit: 'g', minAmount: 1000 },
    { id: 'ing-mozzarella', restaurantId: 'rest-1', name: 'Mozzarella', amount: 3000, unit: 'g', minAmount: 800 },
    { id: 'ing-sauce', restaurantId: 'rest-1', name: 'Sos pomidorowy', amount: 2000, unit: 'ml', minAmount: 500 }
  ];

  beforeEach(() => {
    mockInventoryService = {
      items: signal<InventoryItem[]>(mockInventoryItems),
      quickAdjustStock: jasmine.createSpy('quickAdjustStock').and.resolveTo()
    };

    mockRecipeService = {
      recipes: signal<Recipe[]>(mockRecipes)
    };

    const mockFirestore = {};
    const mockAuthService = {
      currentUser: signal(null),
      currentUserId: 'rest-1',
      isDemoAccount: signal(false)
    };
    mockToastService = {
      success: jasmine.createSpy('success'),
      info: jasmine.createSpy('info'),
      warning: jasmine.createSpy('warning'),
      danger: jasmine.createSpy('danger')
    };
    const mockPromotionService = {
      recordPromotionUsage: jasmine.createSpy('recordPromotionUsage')
    };

    TestBed.configureTestingModule({
      providers: [
        OrderService,
        { provide: Firestore, useValue: mockFirestore },
        { provide: AuthService, useValue: mockAuthService },
        { provide: InventoryService, useValue: mockInventoryService },
        { provide: RecipeService, useValue: mockRecipeService },
        { provide: ToastService, useValue: mockToastService },
        { provide: PromotionService, useValue: mockPromotionService }
      ]
    });

    service = TestBed.inject(OrderService);
  });

  describe('Formatowanie upływu czasu (getElapsedTime)', () => {
    it('powinien zwrócić "Przed chwilą", gdy od złożenia minęło mniej niż 60 sekund', () => {
      const now = new Date();
      const justNow = new Date(now.getTime() - 20 * 1000).toISOString(); // 20s temu

      expect(service.getElapsedTime(justNow)).toBe('Przed chwilą');
    });

    it('powinien zwrócić "1 min temu" dla czasu 1 minuty', () => {
      const now = new Date();
      const oneMinAgo = new Date(now.getTime() - 75 * 1000).toISOString(); // 75s = 1 min

      expect(service.getElapsedTime(oneMinAgo)).toBe('1 min temu');
    });

    it('powinien zwrócić "X min temu" dla czasu poniżej godziny', () => {
      const now = new Date();
      const fifteenMinsAgo = new Date(now.getTime() - (15 * 60 * 1000 + 5000)).toISOString(); // 15 min 5s temu

      expect(service.getElapsedTime(fifteenMinsAgo)).toBe('15 min temu');
    });

    it('powinien zwrócić "1 godz. temu", gdy czas mieści się między 60 a 119 minutami', () => {
      const now = new Date();
      const seventyMinsAgo = new Date(now.getTime() - 70 * 60 * 1000).toISOString(); // 70 min temu

      expect(service.getElapsedTime(seventyMinsAgo)).toBe('1 godz. temu');
    });

    it('powinien zwrócić "X godz. temu", gdy upłynęło 2 lub więcej godzin', () => {
      const now = new Date();
      const threeHoursAgo = new Date(now.getTime() - 185 * 60 * 1000).toISOString(); // ~3 godz.

      expect(service.getElapsedTime(threeHoursAgo)).toBe('3 godz. temu');
    });
  });

  describe('Automatyczny odpis surowców z magazynu (deductIngredientsForOrder)', () => {
    it('powinien poprawnie przemnożyć gramatury składników przez liczbę zamówionych porcji', async () => {
      // Zamówienie na 2 szt. Pizzy Margherita
      const testOrder: Order = {
        id: 'ord-test-1',
        restaurantId: 'rest-1',
        orderNumber: 201,
        tableNumber: 'Stolik 1',
        items: [
          { recipeId: 'rec-margherita', recipeName: 'Pizza Margherita', quantity: 2, unitPrice: 35 }
        ],
        totalPrice: 70,
        status: 'pending',
        stockDeducted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const depleted = await service.deductIngredientsForOrder(testOrder);

      // Składniki na 2 pizze:
      // Mąka: 250g * 2 = 500g
      // Mozzarella: 150g * 2 = 300g
      // Sos: 100ml * 2 = 200ml
      expect(mockInventoryService.quickAdjustStock).toHaveBeenCalledWith('ing-flour', -500, true);
      expect(mockInventoryService.quickAdjustStock).toHaveBeenCalledWith('ing-mozzarella', -300, true);
      expect(mockInventoryService.quickAdjustStock).toHaveBeenCalledWith('ing-sauce', -200, true);

      // Ponieważ w magazynie było sporo zapasu, żaden surowiec nie spadł do zera
      expect(depleted.length).toBe(0);
    });

    it('powinien zidentyfikować surowce, których stan spadł do 0 lub poniżej', async () => {
      // Przypadek, w którym mozzarella miała tylko 250g, a zamówienie wymaga 300g (2 pizze)
      mockInventoryService.items.set([
        mockInventoryItems[0],
        { ...mockInventoryItems[1], amount: 250 }, // tylko 250g
        mockInventoryItems[2]
      ]);

      const testOrder: Order = {
        id: 'ord-test-2',
        restaurantId: 'rest-1',
        orderNumber: 202,
        tableNumber: 'Stolik 1',
        items: [
          { recipeId: 'rec-margherita', recipeName: 'Pizza Margherita', quantity: 2, unitPrice: 35 }
        ],
        totalPrice: 70,
        status: 'pending',
        stockDeducted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const depleted = await service.deductIngredientsForOrder(testOrder);

      expect(depleted).toContain('Mozzarella');
    });

    it('powinien zagregować składniki, gdy zamówienie zawiera tę samą pozycję w kilku wpisach', async () => {
      // 1x Margherita w pierwszym wpisie i 2x Margherita w drugim wpisie => łącznie 3 pizze
      const testOrder: Order = {
        id: 'ord-test-3',
        restaurantId: 'rest-1',
        orderNumber: 203,
        tableNumber: 'Stolik 1',
        items: [
          { recipeId: 'rec-margherita', recipeName: 'Pizza Margherita', quantity: 1, unitPrice: 35 },
          { recipeId: 'rec-margherita', recipeName: 'Pizza Margherita', quantity: 2, unitPrice: 35 }
        ],
        totalPrice: 105,
        status: 'pending',
        stockDeducted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await service.deductIngredientsForOrder(testOrder);

      // 3 pizze * 250g mąki = 750g
      expect(mockInventoryService.quickAdjustStock).toHaveBeenCalledWith('ing-flour', -750, true);
    });

    it('nie powinien powtórnie odpisywać składników z magazynu, jeśli zamówienie ma już flagę stockDeducted: true', async () => {
      const alreadyDeductedOrder: Order = {
        id: 'ord-test-4',
        restaurantId: 'rest-1',
        orderNumber: 204,
        tableNumber: 'Stolik 1',
        items: [
          { recipeId: 'rec-margherita', recipeName: 'Pizza Margherita', quantity: 1, unitPrice: 35 }
        ],
        totalPrice: 35,
        status: 'ready',
        stockDeducted: true, // Już wcześniej odpisano
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      service.orders.set([alreadyDeductedOrder]);
      const deductSpy = spyOn(service, 'deductIngredientsForOrder').and.resolveTo([]);

      // Zmiana statusu na completed
      await service.updateOrderStatus('ord-test-4', 'completed');

      // deductIngredientsForOrder NIE powinien zostać wywołany!
      expect(deductSpy).not.toHaveBeenCalled();
    });

    it('powinien odpisać składniki z magazynu przy przejściu na status ready (Gotowe do wydania)', async () => {
      const pendingOrder: Order = {
        id: 'ord-test-5',
        restaurantId: 'rest-1',
        orderNumber: 205,
        tableNumber: 'Stolik 2',
        items: [
          { recipeId: 'rec-margherita', recipeName: 'Pizza Margherita', quantity: 1, unitPrice: 35 }
        ],
        totalPrice: 35,
        status: 'in_progress',
        stockDeducted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      service.orders.set([pendingOrder]);
      const deductSpy = spyOn(service, 'deductIngredientsForOrder').and.resolveTo([]);

      await service.updateOrderStatus('ord-test-5', 'ready');

      expect(deductSpy).toHaveBeenCalledWith(pendingOrder);
    });
  });
});
