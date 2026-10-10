import { TestBed } from '@angular/core/testing';
import { InventoryService } from './inventory.service';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';
import { Firestore } from '@angular/fire/firestore';
import { signal } from '@angular/core';
import { InventoryItem } from '../models/inventory-item.model';

describe('InventoryService (Warehouse & Stock Management)', () => {
  let service: InventoryService;

  let mockUserSignal: ReturnType<typeof signal<{ uid: string; email: string } | null>>;

  const mockToastService = {
    success: jasmine.createSpy('success'),
    info: jasmine.createSpy('info'),
    warning: jasmine.createSpy('warning'),
    danger: jasmine.createSpy('danger')
  };

  const initialItems: InventoryItem[] = [
    { id: 'ing-1', restaurantId: 'r1', name: 'Mąka Caputo', amount: 25000, unit: 'g', minAmount: 5000, category: 'Suche' },
    { id: 'ing-2', restaurantId: 'r1', name: 'Ser Mozzarella', amount: 2500, unit: 'g', minAmount: 3000, category: 'Nabiał' }, // Niski stan (2500 <= 3000)
    { id: 'ing-3', restaurantId: 'r1', name: 'Świeża bazylia', amount: 0, unit: 'szt', minAmount: 5, category: 'Zioła' },        // Brak (0)
    { id: 'ing-4', restaurantId: 'r1', name: 'Sos San Marzano', amount: 8000, unit: 'ml', minAmount: 2000, category: 'Przetwory' } // OK
  ];

  beforeEach(() => {
    mockUserSignal = signal<{ uid: string; email: string } | null>(null);

    const mockAuthService = {
      currentUser: mockUserSignal
    };

    const mockFirestore = {};

    TestBed.configureTestingModule({
      providers: [
        InventoryService,
        { provide: Firestore, useValue: mockFirestore },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ToastService, useValue: mockToastService }
      ]
    });

    service = TestBed.inject(InventoryService);
    service.items.set([...initialItems]);

    mockToastService.success.calls.reset();
    mockToastService.info.calls.reset();
    mockToastService.warning.calls.reset();
    mockToastService.danger.calls.reset();
  });

  describe('Reaktywne sygnały stanu magazynu (computed)', () => {
    it('totalItemsCount powinien zwrócić łączną liczbę surowców w magazynie', () => {
      expect(service.totalItemsCount()).toBe(4);
    });

    it('outOfStockItems powinien filtrować wyłącznie surowce o stanie 0', () => {
      const outItems = service.outOfStockItems();
      expect(outItems.length).toBe(1);
      expect(outItems[0].name).toBe('Świeża bazylia');
    });

    it('lowStockItems powinien filtrować surowce o stanie poniżej minimum (ale > 0)', () => {
      const lowItems = service.lowStockItems();
      expect(lowItems.length).toBe(1);
      expect(lowItems[0].name).toBe('Ser Mozzarella');
    });

    it('healthyStockItems powinien filtrować surowce o bezpiecznym stanie magazynowym', () => {
      const healthy = service.healthyStockItems();
      expect(healthy.length).toBe(2);
      expect(healthy.map(i => i.name)).toContain('Mąka Caputo');
      expect(healthy.map(i => i.name)).toContain('Sos San Marzano');
    });

    it('criticalAlertsCount powinien zwrócić łączną sumę braków i stanów niskich', () => {
      // 1 brak (bazylia) + 1 niski stan (mozzarella) = 2
      expect(service.criticalAlertsCount()).toBe(2);
    });
  });

  describe('Kategorie surowców (allCategories & getCategoryItemCount)', () => {
    it('allCategories() powinien zawierać domyślne kategorie i kategorie z surowców', () => {
      const cats = service.allCategories();
      expect(cats).toContain('Suche');
      expect(cats).toContain('Nabiał');
      expect(cats).toContain('Zioła');
      expect(cats).toContain('Przetwory');
      expect(cats).toContain('Mięso i wędliny');
    });

    it('getCategoryItemCount() powinien zliczać liczbę surowców w kategorii (case-insensitive)', () => {
      expect(service.getCategoryItemCount('Suche')).toBe(1);
      expect(service.getCategoryItemCount('suche')).toBe(1);
      expect(service.getCategoryItemCount('Nabiał')).toBe(1);
      expect(service.getCategoryItemCount('Mięso i wędliny')).toBe(0);
    });

    it('addCategory() powinien dodać nową kategorię i zablokować duplikaty', async () => {
      const resultEmpty = await service.addCategory('   ');
      expect(resultEmpty).toBeFalse();

      const resultDup = await service.addCategory('Nabiał');
      expect(resultDup).toBeFalse();

      const resultSuccess = await service.addCategory('Napoje i syropy');
      expect(resultSuccess).toBeTrue();
      expect(service.customCategories()).toContain('Napoje i syropy');
    });
  });

  describe('Szybkie korekty stanów magazynowych (quickAdjustStock)', () => {
    it('powinien zwiększyć stan surowca przy dostawie i wyemitować toast sukcesu', async () => {
      spyOn(service, 'updateItem').and.callFake(async (id, partial) => {
        service.items.update(list =>
          list.map(i => (i.id === id ? { ...i, ...partial } : i))
        );
      });

      // Dostawa +5000g mąki
      await service.quickAdjustStock('ing-1', 5000);

      expect(service.updateItem).toHaveBeenCalledWith('ing-1', { amount: 30000 });
      expect(mockToastService.success).toHaveBeenCalledWith(
        jasmine.stringContaining('Przyjęto dostawę'),
        'Dostawa przyjęta'
      );
    });

    it('powinien wyemitować toast ostrzegawczy, gdy stan po zużyciu spadnie poniżej progu minAmount', async () => {
      spyOn(service, 'updateItem').and.callFake(async (id, partial) => {
        service.items.update(list =>
          list.map(i => (i.id === id ? { ...i, ...partial } : i))
        );
      });

      // Mąka ma 25000g, minAmount = 5000g. Odejmujemy 21000g -> zostaje 4000g (poniżej minimum!)
      await service.quickAdjustStock('ing-1', -21000);

      expect(service.updateItem).toHaveBeenCalledWith('ing-1', { amount: 4000 });
      expect(mockToastService.warning).toHaveBeenCalledWith(
        jasmine.stringContaining('spadł poniżej progu'),
        'Niski stan magazynowy'
      );
    });

    it('powinien wyemitować toast błędu (danger), gdy surowiec wyczerpie się dokładnie do 0', async () => {
      spyOn(service, 'updateItem').and.callFake(async (id, partial) => {
        service.items.update(list =>
          list.map(i => (i.id === id ? { ...i, ...partial } : i))
        );
      });

      // Mozzarella ma 2500g. Odejmujemy 2500g -> zostaje 0g
      await service.quickAdjustStock('ing-2', -2500);

      expect(service.updateItem).toHaveBeenCalledWith('ing-2', { amount: 0 });
      expect(mockToastService.danger).toHaveBeenCalledWith(
        jasmine.stringContaining('został wyczerpany do zera'),
        'Brak surowca w magazynie'
      );
    });

    it('nie powinien pozwolić na ujemny stan magazynu (blokada na 0)', async () => {
      spyOn(service, 'updateItem').and.callFake(async (id, partial) => {
        service.items.update(list =>
          list.map(i => (i.id === id ? { ...i, ...partial } : i))
        );
      });

      // Mozzarella ma 2500g. Próba odjęcia 10000g powinna ustawić stan na 0, a nie -7500
      await service.quickAdjustStock('ing-2', -10000);

      expect(service.updateItem).toHaveBeenCalledWith('ing-2', { amount: 0 });
    });

    it('nie powinien emitować toastów, gdy przekazano silent: true', async () => {
      spyOn(service, 'updateItem').and.resolveTo();

      await service.quickAdjustStock('ing-1', -100, true);

      expect(mockToastService.success).not.toHaveBeenCalled();
      expect(mockToastService.warning).not.toHaveBeenCalled();
      expect(mockToastService.danger).not.toHaveBeenCalled();
    });
  });

  describe('Walidacje i zabezpieczenia operacji na surowcach (addItem)', () => {
    it('addItem() bez zalogowanego użytkownika powinien wyświetlić błąd autoryzacji', async () => {
      mockUserSignal.set(null);

      await service.addItem({
        name: 'Oliwa truflowa',
        amount: 1000,
        unit: 'ml',
        minAmount: 200,
        category: 'Tłuszcze'
      });

      expect(mockToastService.danger).toHaveBeenCalledWith(
        'Musisz być zalogowany, aby dodać surowiec.',
        'Brak autoryzacji'
      );
    });

    it('addItem() powinien zablokować dodanie surowca o nazwie, która już istnieje (duplikat)', async () => {
      mockUserSignal.set({ uid: 'u1', email: 'test@gastro.pl' });

      // Próba dodania "Mąka Caputo" (istnieje już ing-1)
      await service.addItem({
        name: '  Mąka Caputo  ',
        amount: 5000,
        unit: 'g',
        minAmount: 1000,
        category: 'Suche'
      });

      expect(mockToastService.warning).toHaveBeenCalledWith(
        jasmine.stringContaining('już istnieje w magazynie'),
        'Duplikat surowca'
      );
    });
  });
});
