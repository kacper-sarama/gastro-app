import { Injectable, inject, signal, computed, effect, OnDestroy } from '@angular/core';
import { 
  Firestore,
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  onSnapshot, 
  getDocs,
  Unsubscribe 
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { InventoryService } from './inventory.service';
import { RecipeService } from './recipe.service';
import { ToastService } from './toast.service';
import { Order, OrderItem, OrderStatus, CreateOrderDto } from '../models/order.model';

@Injectable({
  providedIn: 'root'
})
export class OrderService implements OnDestroy {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private inventoryService = inject(InventoryService);
  private recipeService = inject(RecipeService);
  private toastService = inject(ToastService);

  readonly orders = signal<Order[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  private firestoreUnsub: Unsubscribe | null = null;

  // --- Sygnały podsumowujące (Live KPI) ---

  readonly pendingOrdersCount = computed(() => 
    this.orders().filter(o => o.status === 'pending').length
  );

  readonly inProgressOrdersCount = computed(() => 
    this.orders().filter(o => o.status === 'in_progress').length
  );

  readonly readyOrdersCount = computed(() => 
    this.orders().filter(o => o.status === 'ready').length
  );

  readonly completedOrdersCount = computed(() => 
    this.orders().filter(o => o.status === 'completed').length
  );

  readonly activeOrdersCount = computed(() => 
    this.orders().filter(o => o.status !== 'completed' && o.status !== 'cancelled').length
  );

  readonly todaysRevenue = computed(() => 
    this.orders()
      .filter(o => o.status === 'completed')
      .reduce((sum, o) => sum + (o.totalPrice || 0), 0)
  );

  // Reaktywny zegar aktualizowany co 15 sekund w pamięci (bez ruchu sieciowego)
  readonly currentTime = signal<number>(Date.now());
  private timeTickerInterval: any = null;

  constructor() {
    // Uruchomienie cyklicznego odświeżania czasu dla tablicy KDS i dashboardu
    if (typeof window !== 'undefined') {
      this.timeTickerInterval = setInterval(() => {
        this.currentTime.set(Date.now());
      }, 15000); // co 15 sekund
    }

    // Reaguj na zmiany zalogowanego użytkownika
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        this.initFirestoreSubscription(user.uid);
      } else {
        this.cleanupState();
      }
    });
  }

  private cleanupState(): void {
    if (this.firestoreUnsub) {
      this.firestoreUnsub();
      this.firestoreUnsub = null;
    }
    this.orders.set([]);
    this.isLoading.set(false);
  }

  /**
   * Reaktywne wyliczanie upływu czasu od złożenia zamówienia.
   * Dzięki odczytowi this.currentTime() Angular automatycznie aktualizuje czas na kafelkach na żywo.
   */
  getElapsedTime(createdAt: string): string {
    const now = this.currentTime();
    const diffMs = Math.max(0, now - new Date(createdAt).getTime());
    const mins = Math.floor(diffMs / 60000);
    
    if (mins < 1) return 'Przed chwilą';
    if (mins === 1) return '1 min temu';
    if (mins < 60) return `${mins} min temu`;
    
    const hours = Math.floor(mins / 60);
    if (hours === 1) return '1 godz. temu';
    return `${hours} godz. temu`;
  }

  private initFirestoreSubscription(restaurantId: string): void {
    this.isLoading.set(true);
    if (this.firestoreUnsub) {
      this.firestoreUnsub();
      this.firestoreUnsub = null;
    }

    try {
      const ordersCol = collection(this.firestore, 'orders');
      const q = query(ordersCol, where('restaurantId', '==', restaurantId));

      this.firestoreUnsub = onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        } as Order));

        if (items.length === 0) {
          if (this.authService.currentUserId === restaurantId) {
            this.seedStarterOrders(restaurantId);
          } else {
            this.orders.set([]);
            this.isLoading.set(false);
          }
        } else {
          // Sortuj od najnowszych
          items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          this.orders.set(items);
          this.isLoading.set(false);
        }
      }, (err) => {
        console.error('Błąd subskrypcji zamówień Firestore:', err);
        this.errorMessage.set('Błąd połączenia z bazą zamówień.');
        this.isLoading.set(false);
      });
    } catch (err) {
      console.error('Błąd inicjalizacji zamówień Firestore:', err);
      this.isLoading.set(false);
    }
  }

  private async seedStarterOrders(restaurantId: string): Promise<void> {
    const recipes = this.recipeService.recipes();
    const margherita = recipes.find(r => r.name.toLowerCase().includes('margherita'));
    const funghi = recipes.find(r => r.name.toLowerCase().includes('funghi'));
    const focaccia = recipes.find(r => r.name.toLowerCase().includes('focaccia'));

    const now = Date.now();
    const starterOrders: Omit<Order, 'id'>[] = [
      {
        restaurantId,
        orderNumber: 100,
        tableNumber: 'Stolik 1',
        status: 'completed',
        stockDeducted: true,
        items: [
          {
            recipeId: margherita?.id || 'recipe-margherita',
            recipeName: margherita?.name || 'Pizza Margherita 32cm',
            quantity: 1,
            unitPrice: margherita?.sellingPrice || 36,
            category: margherita?.category || 'Pizza Rossa (na czerwono)'
          }
        ],
        totalPrice: margherita?.sellingPrice || 36,
        createdAt: new Date(now - 80 * 60 * 1000).toISOString(),
        updatedAt: new Date(now - 50 * 60 * 1000).toISOString()
      },
      {
        restaurantId,
        orderNumber: 101,
        tableNumber: 'Stolik 2',
        status: 'in_progress',
        stockDeducted: false,
        items: [
          {
            recipeId: margherita?.id || 'recipe-margherita',
            recipeName: margherita?.name || 'Pizza Margherita 32cm',
            quantity: 2,
            unitPrice: margherita?.sellingPrice || 36,
            category: margherita?.category || 'Pizza Rossa (na czerwono)'
          }
        ],
        totalPrice: (margherita?.sellingPrice || 36) * 2,
        createdAt: new Date(now - 12 * 60 * 1000).toISOString(),
        updatedAt: new Date(now - 5 * 60 * 1000).toISOString()
      },
      {
        restaurantId,
        orderNumber: 102,
        tableNumber: 'Stolik 4',
        status: 'pending',
        stockDeducted: false,
        items: [
          {
            recipeId: funghi?.id || 'recipe-funghi',
            recipeName: funghi?.name || 'Pizza Funghi 32cm',
            quantity: 1,
            unitPrice: funghi?.sellingPrice || 41,
            category: funghi?.category || 'Pizza Rossa (na czerwono)'
          },
          {
            recipeId: focaccia?.id || 'recipe-focaccia',
            recipeName: focaccia?.name || 'Focaccia z Rozmarynem i Solą Morską',
            quantity: 1,
            unitPrice: focaccia?.sellingPrice || 22,
            category: focaccia?.category || 'Focaccia (włoskie pieczywo)'
          }
        ],
        totalPrice: (funghi?.sellingPrice || 41) + (focaccia?.sellingPrice || 22),
        createdAt: new Date(now - 4 * 60 * 1000).toISOString(),
        updatedAt: new Date(now - 4 * 60 * 1000).toISOString()
      },
      {
        restaurantId,
        orderNumber: 103,
        tableNumber: 'Wynos',
        status: 'ready',
        stockDeducted: false,
        items: [
          {
            recipeId: margherita?.id || 'recipe-margherita',
            recipeName: margherita?.name || 'Pizza Margherita 32cm',
            quantity: 1,
            unitPrice: margherita?.sellingPrice || 36,
            category: margherita?.category || 'Pizza Rossa (na czerwono)'
          }
        ],
        totalPrice: margherita?.sellingPrice || 36,
        createdAt: new Date(now - 18 * 60 * 1000).toISOString(),
        updatedAt: new Date(now - 2 * 60 * 1000).toISOString()
      }
    ];

    try {
      const col = collection(this.firestore, 'orders');
      for (const ord of starterOrders) {
        await addDoc(col, this.cleanObject(ord));
      }
    } catch (e) {
      console.error('Błąd zapisu zamówień startowych do Firestore:', e);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Resetuje zamówienia lokalu do stanu fabrycznego (dla konta demo)
   */
  async resetToStarter(restaurantId: string): Promise<void> {
    const q = query(collection(this.firestore, 'orders'), where('restaurantId', '==', restaurantId));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      await deleteDoc(d.ref);
    }
    await this.seedStarterOrders(restaurantId);
  }

  private cleanObject(obj: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (val !== undefined) {
        result[key] = val;
      }
    }
    return result;
  }

  // --- Tworzenie zamówienia (wyłącznie Firestore) ---

  async createOrder(dto: CreateOrderDto): Promise<Order> {
    const user = this.authService.currentUser();
    if (!user) {
      throw new Error('Musisz być zalogowany, aby złożyć zamówienie.');
    }

    const currentOrders = this.orders();

    // Wyznacz kolejny numer zamówienia (np. 101, 102...)
    const maxNum = currentOrders.reduce((max, o) => Math.max(max, o.orderNumber || 100), 100);
    const orderNumber = maxNum + 1;

    // Oblicz sumę zamówienia
    const totalPrice = dto.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

    const tableNumber = dto.tableNumber?.trim() || 'Stolik 1';
    const now = new Date().toISOString();
    const orderData = this.cleanObject({
      restaurantId: user.uid,
      orderNumber,
      tableNumber,
      items: dto.items,
      totalPrice,
      status: 'pending' as OrderStatus,
      stockDeducted: false,
      createdAt: now,
      updatedAt: now
    });

    try {
      const col = collection(this.firestore, 'orders');
      const docRef = await addDoc(col, orderData);
      this.toastService.info(
        `Zarejestrowano zamówienie #${orderNumber} (${tableNumber}, ${dto.items.length} pozycji).`,
        'Nowe zamówienie'
      );
      return { id: docRef.id, ...orderData } as Order;
    } catch (err) {
      console.error('Błąd zapisu zamówienia do Firestore:', err);
      this.toastService.danger('Nie udało się zarejestrować zamówienia w bazie.', 'Błąd zamówienia');
      throw err;
    }
  }

  // --- Zmiana statusu zamówienia i automatyczny odpis magazynowy ---

  async updateOrderStatus(orderId: string, newStatus: OrderStatus): Promise<void> {
    const target = this.orders().find(o => o.id === orderId);
    if (!target) return;

    let stockDeducted = target.stockDeducted;

    // AUTOMATYCZNY ODPIS Z MAGAZYNU: następuje, gdy zamówienie zostaje wydane (status: 'completed')
    if (newStatus === 'completed' && !target.stockDeducted) {
      await this.deductIngredientsForOrder(target);
      stockDeducted = true;
    }

    const updatedFields = {
      status: newStatus,
      stockDeducted,
      updatedAt: new Date().toISOString()
    };

    try {
      const docRef = doc(this.firestore, `orders/${orderId}`);
      await updateDoc(docRef, updatedFields);
    } catch (err) {
      console.error('Błąd aktualizacji statusu zamówienia w Firestore:', err);
      this.toastService.danger('Nie udało się zaktualizować statusu zamówienia.', 'Błąd');
      return;
    }

    // Powiadomienia Toast w zależności od nowego statusu
    const num = target.orderNumber || target.id.slice(-4);
    if (newStatus === 'completed') {
      this.toastService.success(
        `Wydano zamówienie #${num} (${target.tableNumber}). Składniki zostały odpisane z magazynu.`,
        'Wydano zamówienie'
      );
    } else if (newStatus === 'ready') {
      this.toastService.info(
        `Zamówienie #${num} (${target.tableNumber}) jest gotowe do wydania przez kelnera.`,
        'Gotowe do wydania'
      );
    } else if (newStatus === 'in_progress') {
      this.toastService.info(
        `Zamówienie #${num} (${target.tableNumber}) trafiło na kuchnię.`,
        'W realizacji'
      );
    }
  }

  /**
   * Automatycznie zdejmuje z magazynu odpowiednie gramatury/ilości składników
   * dla wszystkich dań zawartych w danym zamówieniu.
   */
  async deductIngredientsForOrder(order: Order): Promise<void> {
    const allRecipes = this.recipeService.recipes();

    for (const item of order.items) {
      // 1. Znajdź recepturę powiązaną z daniem
      const recipe = allRecipes.find(r => r.id === item.recipeId || r.name.toLowerCase() === item.recipeName.toLowerCase());
      if (!recipe || !recipe.ingredients) continue;

      // 2. Dla każdego składnika w recepturze odejmij [ilość na porcję * liczba porcji]
      for (const ing of recipe.ingredients) {
        const totalAmountToDeduct = ing.amount * item.quantity;
        if (totalAmountToDeduct > 0) {
          await this.inventoryService.quickAdjustStock(ing.inventoryItemId, -totalAmountToDeduct);
        }
      }
    }
  }

  async deleteOrder(orderId: string): Promise<void> {
    try {
      const docRef = doc(this.firestore, `orders/${orderId}`);
      await deleteDoc(docRef);
      this.toastService.danger('Usunięto zamówienie z bazy.', 'Zamówienia');
    } catch (err) {
      console.error('Błąd usuwania zamówienia z Firestore:', err);
      this.toastService.danger('Nie udało się usunąć zamówienia.', 'Błąd');
    }
  }

  ngOnDestroy(): void {
    if (this.timeTickerInterval) {
      clearInterval(this.timeTickerInterval);
      this.timeTickerInterval = null;
    }
    if (this.firestoreUnsub) {
      this.firestoreUnsub();
      this.firestoreUnsub = null;
    }
  }
}
