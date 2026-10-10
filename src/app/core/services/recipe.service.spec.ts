import { TestBed } from '@angular/core/testing';
import { RecipeService } from './recipe.service';
import { AuthService } from './auth.service';
import { InventoryService } from './inventory.service';
import { ToastService } from './toast.service';
import { Firestore } from '@angular/fire/firestore';
import { signal } from '@angular/core';
import { Recipe } from '../models/recipe.model';
import { InventoryItem } from '../models/inventory-item.model';

describe('RecipeService', () => {
  let service: RecipeService;

  let mockInventorySignal: ReturnType<typeof signal<InventoryItem[]>>;
  let mockUserSignal: ReturnType<typeof signal<{ uid: string; email: string } | null>>;

  const mockToastService = {
    success: jasmine.createSpy('success'),
    info: jasmine.createSpy('info'),
    warning: jasmine.createSpy('warning'),
    danger: jasmine.createSpy('danger')
  };

  const initialInventory: InventoryItem[] = [
    { id: 'ing-flour', restaurantId: 'r1', name: 'Mąka typ 00', amount: 5000, unit: 'g', minAmount: 1000 },
    { id: 'ing-sauce', restaurantId: 'r1', name: 'Sos pomidorowy', amount: 2000, unit: 'ml', minAmount: 500 },
    { id: 'ing-mozzarella', restaurantId: 'r1', name: 'Mozzarella', amount: 3000, unit: 'g', minAmount: 1000 },
    { id: 'ing-basil', restaurantId: 'r1', name: 'Świeża bazylia', amount: 0, unit: 'g', minAmount: 50 }
  ];

  const initialRecipes: Recipe[] = [
    {
      id: 'rec-margherita',
      restaurantId: 'r1',
      name: 'Pizza Margherita',
      category: 'Pizza Rossa (na czerwono)',
      sellingPrice: 35,
      ingredients: [
        { inventoryItemId: 'ing-flour', amount: 250 },      // 5000/250 = 20
        { inventoryItemId: 'ing-sauce', amount: 100 },      // 2000/100 = 20
        { inventoryItemId: 'ing-mozzarella', amount: 150 }  // 3000/150 = 20
      ],
      isAvailable: true,
      isFeatured: false,
      updatedAt: '2026-10-10T12:00:00Z'
    },
    {
      id: 'rec-diavola',
      restaurantId: 'r1',
      name: 'Pizza Diavola',
      category: 'Pizza Rossa (na czerwono)',
      sellingPrice: 42,
      ingredients: [
        { inventoryItemId: 'ing-flour', amount: 250 },
        { inventoryItemId: 'ing-sauce', amount: 100 },
        { inventoryItemId: 'ing-mozzarella', amount: 150 }
      ],
      isAvailable: true,
      isFeatured: true,
      updatedAt: '2026-10-10T12:00:00Z'
    },
    {
      id: 'rec-basil-special',
      restaurantId: 'r1',
      name: 'Focaccia z bazylią',
      category: 'Focaccia (włoskie pieczywo)',
      sellingPrice: 22,
      ingredients: [
        { inventoryItemId: 'ing-flour', amount: 200 },
        { inventoryItemId: 'ing-basil', amount: 20 }        // 0 / 20 = 0 porcji (zablokowane!)
      ],
      isAvailable: true,
      isFeatured: false,
      updatedAt: '2026-10-10T12:00:00Z'
    }
  ];

  beforeEach(() => {
    mockInventorySignal = signal<InventoryItem[]>([...initialInventory]);
    mockUserSignal = signal<{ uid: string; email: string } | null>(null);

    const mockAuthService = {
      currentUser: mockUserSignal
    };

    const mockInventoryService = {
      items: mockInventorySignal
    };

    const mockFirestore = {};

    TestBed.configureTestingModule({
      providers: [
        RecipeService,
        { provide: Firestore, useValue: mockFirestore },
        { provide: AuthService, useValue: mockAuthService },
        { provide: InventoryService, useValue: mockInventoryService },
        { provide: ToastService, useValue: mockToastService }
      ]
    });

    service = TestBed.inject(RecipeService);
    // Ustawienie receptur testowych w sygnale
    service.recipes.set([...initialRecipes]);
  });

  describe('Kategorie dań (allCategories & getCategoryDishCount)', () => {
    it('powinien zawierać domyślne kategorie gastronomiczne w allCategories()', () => {
      const cats = service.allCategories();
      expect(cats).toContain('Pizza Rossa (na czerwono)');
      expect(cats).toContain('Pizza Bianca (na biało)');
      expect(cats).toContain('Calzone (pizza zawijana)');
      expect(cats).toContain('Focaccia (włoskie pieczywo)');
      expect(cats).toContain('Desery (włoskie słodkości)');
    });

    it('powinien poprawnie zliczać liczbę dań w danej kategorii (niezależnie od wielkości liter)', () => {
      expect(service.getCategoryDishCount('Pizza Rossa (na czerwono)')).toBe(2);
      expect(service.getCategoryDishCount('pizza rossa (na czerwono)')).toBe(2);
      expect(service.getCategoryDishCount('Focaccia (włoskie pieczywo)')).toBe(1);
      expect(service.getCategoryDishCount('Desery (włoskie słodkości)')).toBe(0);
    });

    it('powinien uwzględniać niestandardowe kategorie dodane przez użytkownika', async () => {
      service.customCategories.set(['Makarony domowe', 'Napoje rzemieślnicze']);
      const cats = service.allCategories();

      expect(cats).toContain('Makarony domowe');
      expect(cats).toContain('Napoje rzemieślnicze');
    });

    it('addCategory() nie powinien dodawać duplikatu ani pustej nazwy', async () => {
      const emptyResult = await service.addCategory('   ');
      expect(emptyResult).toBeFalse();

      const dupResult = await service.addCategory('Pizza Rossa (na czerwono)');
      expect(dupResult).toBeFalse();

      const successResult = await service.addCategory('Makarony');
      expect(successResult).toBeTrue();
      expect(service.customCategories()).toContain('Makarony');
    });
  });

  describe('Reaktywna wydajność kuchni (capacitiesMap & getCapacity)', () => {
    it('powinien wyliczyć wydajność dla dań w oparciu o stan magazynowy', () => {
      const margheritaCapacity = service.getCapacity('rec-margherita');
      expect(margheritaCapacity.maxPortions).toBe(20);
      expect(margheritaCapacity.status).toBe('available');
    });

    it('powinien wykryć zablokowane danie, gdy brakujący składnik ma stan 0', () => {
      const basilCapacity = service.getCapacity('rec-basil-special');
      expect(basilCapacity.maxPortions).toBe(0);
      expect(basilCapacity.status).toBe('blocked');
      expect(basilCapacity.bottleneckIngredient?.name).toBe('Świeża bazylia');
    });

    it('powinien zwrócić bezpieczny fallback dla nieistniejącego ID dania', () => {
      const fallback = service.getCapacity('non-existent-id');
      expect(fallback.maxPortions).toBe(0);
      expect(fallback.status).toBe('blocked');
      expect(fallback.ingredientDetails).toEqual([]);
    });

    it('powinien dynamicznie przeliczać liczniki statusów dań (available, low, blocked)', () => {
      expect(service.totalRecipesCount()).toBe(3);
      expect(service.availableRecipesCount()).toBe(2); // Margherita i Diavola (20 porcji)
      expect(service.blockedRecipesCount()).toBe(1);   // Focaccia (0 porcji)
      expect(service.lowPortionRecipesCount()).toBe(0);

      // Symulujemy drastyczny spadek sera mozzarella w magazynie do 400g (400/150 = 2 porcje => status 'low')
      mockInventorySignal.update(items =>
        items.map(i => (i.id === 'ing-mozzarella' ? { ...i, amount: 400 } : i))
      );

      // Po zmianie stanu w magazynie:
      expect(service.availableRecipesCount()).toBe(0);
      expect(service.lowPortionRecipesCount()).toBe(2); // Margherita i Diavola mają po 2 porcje
      expect(service.blockedRecipesCount()).toBe(1);   // Focaccia nadal zablokowana
    });
  });

  describe('Zarządzanie dostępnością i pozycjami menu (toggleAvailability & toggleFeatured)', () => {
    it('toggleAvailability() powinien wywołać updateRecipe i wyemitować toast informacyjny', async () => {
      spyOn(service, 'updateRecipe').and.resolveTo();

      // Wyłączenie dania
      await service.toggleAvailability('rec-margherita', false);
      expect(service.updateRecipe).toHaveBeenCalledWith('rec-margherita', { isAvailable: false });
      expect(mockToastService.danger).toHaveBeenCalledWith(
        jasmine.stringContaining('została zablokowana'),
        'Zarządzanie kartą'
      );

      // Ponowne włączenie dania
      await service.toggleAvailability('rec-margherita', true);
      expect(service.updateRecipe).toHaveBeenCalledWith('rec-margherita', { isAvailable: true });
      expect(mockToastService.success).toHaveBeenCalledWith(
        jasmine.stringContaining('jest ponownie widoczna'),
        'Zarządzanie kartą'
      );
    });

    it('toggleFeatured() powinien zaktualizować flagę wyróżnienia isFeatured', async () => {
      spyOn(service, 'updateRecipe').and.resolveTo();

      await service.toggleFeatured('rec-margherita', true);
      expect(service.updateRecipe).toHaveBeenCalledWith('rec-margherita', { isFeatured: true });
    });

    it('addRecipe() bez zalogowanego użytkownika powinien wyświetlić błąd autoryzacji', async () => {
      mockUserSignal.set(null);

      await service.addRecipe({
        name: 'Nowa Pizza',
        category: 'Pizza',
        ingredients: []
      });

      expect(mockToastService.danger).toHaveBeenCalledWith(
        'Musisz być zalogowany, aby dodać recepturę.',
        'Brak autoryzacji'
      );
    });
  });
});
