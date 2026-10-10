import { Component, inject, signal, computed, OnInit, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Unsubscribe } from '@angular/fire/firestore';
import { RecipeService } from '../../core/services/recipe.service';
import { InventoryService } from '../../core/services/inventory.service';
import { OrderService } from '../../core/services/order.service';
import { TableService } from '../../core/services/table.service';
import { ThemeService } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/services/auth.service';
import { PaymentService } from '../../core/services/payment.service';
import { Recipe, RecipeCapacityResult, resolveFallbackIngredient } from '../../core/models/recipe.model';
import { Order, OrderItem, CreateOrderDto } from '../../core/models/order.model';

export interface CartItemDetail {
  recipe: Recipe;
  quantity: number;
  subtotal: number;
}

@Component({
  selector: 'app-guest-menu',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './guest-menu.component.html'
})
export class GuestMenuComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  readonly recipeService = inject(RecipeService);
  readonly inventoryService = inject(InventoryService);
  readonly orderService = inject(OrderService);
  readonly tableService = inject(TableService);
  readonly themeService = inject(ThemeService);
  readonly toastService = inject(ToastService);
  readonly authService = inject(AuthService);
  readonly paymentService = inject(PaymentService);

  restaurantId = signal<string>('demo-restaurant');
  selectedCategory = signal<string>('all');

  // --- Kontekst zamówienia i stolika ---
  orderType = signal<'dine_in' | 'takeout'>('dine_in');
  tableNumber = signal<string>('Stolik 1');
  customerName = signal<string>('');
  customerPhone = signal<string>('');
  orderNotes = signal<string>('');

  // --- Stan koszyka gościa ---
  cart = signal<Record<string, number>>({});
  isCheckoutOpen = signal<boolean>(false);

  // --- Stan płatności online ---
  paymentMethod = signal<'BLIK' | 'Apple Pay' | 'Google Pay' | 'Karta' | 'Gotówka'>('BLIK');
  blikCode = signal<string>('');
  blikError = signal<string | null>(null);
  isAwaitingBankAuth = signal<boolean>(false);
  blikTimer = signal<number>(60);
  isSubmitting = signal<boolean>(false);

  // --- Stan po złożeniu zamówienia (Live Status) ---
  completedOrder = signal<Order | null>(null);
  private orderUnsub: Unsubscribe | null = null;
  private authTimerInterval: any = null;

  constructor() {
    effect(() => {
      const activeCats = this.categories();
      const current = this.selectedCategory();
      if (current !== 'all' && !activeCats.some(c => c.toLowerCase() === current.toLowerCase())) {
        this.selectedCategory.set('all');
      }
    });

    // Reaguj na asynchroniczne zainicjalizowanie użytkownika z Firebase Auth:
    // Jeśli gość testuje w tej samej przeglądarce i podano demo-restaurant lub brak parametru,
    // automatycznie przypisz ID aktywnego lokalu.
    effect(() => {
      const user = this.authService.currentUser();
      const currentParam = this.route.snapshot.paramMap.get('restaurantId');
      if (user && (!currentParam || currentParam === 'demo-restaurant')) {
        this.restaurantId.set(user.uid);
        this.recipeService.loadRestaurantData(user.uid);
        this.inventoryService.loadRestaurantData(user.uid);
      }
    });
  }

  readonly displayName = computed(() => 
    this.recipeService.activeRestaurantName() || 'Karta Menu'
  );

  ngOnInit(): void {
    let id = this.route.snapshot.paramMap.get('restaurantId') || 'demo-restaurant';
    const loggedUser = this.authService.currentUser();
    // Jeśli gość testuje w tej samej sesji przeglądarki i w URL było demo-restaurant, 
    // zmapuj na faktyczne UID lokalu zalogowanego restauratora:
    if (loggedUser && (id === 'demo-restaurant' || !id)) {
      id = loggedUser.uid;
    }

    if (id) {
      this.restaurantId.set(id);
      this.recipeService.loadRestaurantData(id);
      this.inventoryService.loadRestaurantData(id);
    }

    // Odczyt stolika lub trybu na wynos z URL (np. ze skanu kodu QR)
    const tableParam = this.route.snapshot.queryParamMap.get('table');
    const typeParam = this.route.snapshot.queryParamMap.get('type');

    if (tableParam) {
      this.tableNumber.set(tableParam);
      this.orderType.set('dine_in');
    } else if (typeParam === 'takeout') {
      this.orderType.set('takeout');
      this.tableNumber.set('Wynos');
    }
  }

  ngOnDestroy(): void {
    if (this.orderUnsub) {
      this.orderUnsub();
      this.orderUnsub = null;
    }
    if (this.authTimerInterval) {
      clearInterval(this.authTimerInterval);
      this.authTimerInterval = null;
    }
  }

  // --- Filtrowanie i kategorie menu ---

  readonly menuDishes = computed(() => {
    return this.recipeService.recipes().filter(r => r.isAvailable !== false);
  });

  readonly categories = computed(() => {
    const dishes = this.menuDishes();
    const set = new Set<string>();
    for (const d of dishes) {
      if (d.category && d.category.trim()) {
        set.add(d.category.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pl'));
  });

  readonly filteredDishes = computed(() => {
    const cat = this.selectedCategory();
    const dishes = this.menuDishes();
    const activeCats = this.categories();

    if (cat === 'all' || !activeCats.some(c => c.toLowerCase() === cat.toLowerCase())) {
      return dishes;
    }
    return dishes.filter(d => (d.category || '').toLowerCase() === cat.toLowerCase());
  });

  readonly groupedDishes = computed(() => {
    const dishes = this.filteredDishes();
    const cats = this.categories();

    const groups = cats.map(cat => ({
      category: cat,
      items: dishes.filter(d => (d.category || '').toLowerCase() === cat.toLowerCase())
    })).filter(g => g.items.length > 0);

    const uncategorized = dishes.filter(d => !d.category || !cats.some(c => c.toLowerCase() === d.category.toLowerCase()));
    if (uncategorized.length > 0) {
      groups.push({
        category: 'Inne',
        items: uncategorized
      });
    }
    return groups;
  });

  // --- Magazyn i dostępność ---

  getCapacity(recipeId: string): RecipeCapacityResult {
    return this.recipeService.getCapacity(recipeId);
  }

  isSoldOut(recipe: Recipe): boolean {
    const cap = this.getCapacity(recipe.id);
    return cap.status === 'blocked';
  }

  getIngredientNames(recipe: Recipe): string[] {
    const items = this.inventoryService.items();
    return (recipe.ingredients || [])
      .map(ing => {
        let item = items.find(i => i.id === ing.inventoryItemId);
        if (!item) {
          item = resolveFallbackIngredient(recipe.name, ing.amount, items);
        }
        if (!item && ing.inventoryItemId) {
          const rawKey = ing.inventoryItemId.replace('virtual-', '').replace('demo-', '').toLowerCase().trim();
          if (rawKey && rawKey !== 'ing') {
            item = items.find(i => i.name.toLowerCase().includes(rawKey));
          }
        }
        return item?.name;
      })
      .filter((name): name is string => !!name);
  }

  // --- Obsługa Koszyka ---

  getItemQuantity(recipeId: string): number {
    return this.cart()[recipeId] || 0;
  }

  addToCart(recipe: Recipe): void {
    if (this.isSoldOut(recipe)) {
      this.toastService.warning('To danie jest chwilowo wyprzedane.', 'Brak dostępności');
      return;
    }

    this.cart.update(curr => {
      const currentQty = curr[recipe.id] || 0;
      return {
        ...curr,
        [recipe.id]: currentQty + 1
      };
    });
  }

  removeFromCart(recipeId: string): void {
    this.cart.update(curr => {
      const currentQty = curr[recipeId] || 0;
      if (currentQty <= 1) {
        const next = { ...curr };
        delete next[recipeId];
        return next;
      }
      return {
        ...curr,
        [recipeId]: currentQty - 1
      };
    });
  }

  clearCart(): void {
    this.cart.set({});
  }

  readonly cartItemsDetailed = computed<CartItemDetail[]>(() => {
    const currentCart = this.cart();
    const allRecipes = this.recipeService.recipes();
    const details: CartItemDetail[] = [];

    for (const [recipeId, qty] of Object.entries(currentCart)) {
      if (qty > 0) {
        const recipe = allRecipes.find(r => r.id === recipeId);
        if (recipe) {
          const price = recipe.sellingPrice || 0;
          details.push({
            recipe,
            quantity: qty,
            subtotal: Math.round(price * qty * 100) / 100
          });
        }
      }
    }
    return details;
  });

  readonly cartCount = computed<number>(() => {
    return Object.values(this.cart()).reduce((sum, qty) => sum + qty, 0);
  });

  readonly cartTotal = computed<number>(() => {
    return this.cartItemsDetailed().reduce((sum, item) => sum + item.subtotal, 0);
  });

  // --- Kasa i Płatności Online ---

  openCheckout(): void {
    if (this.cartCount() === 0) return;
    this.isCheckoutOpen.set(true);
    this.blikError.set(null);
  }

  closeCheckout(): void {
    if (this.isAwaitingBankAuth()) return; // Nie zamykaj podczas trwającej autoryzacji bankowej
    this.isCheckoutOpen.set(false);
  }

  formatBlikInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let raw = input.value.replace(/\D/g, '').slice(0, 6);
    this.blikCode.set(raw);
    this.blikError.set(null);
  }

  fillTestBlikCode(code: string): void {
    this.blikCode.set(code);
    this.blikError.set(null);
  }

  async proceedToPayment(): Promise<void> {
    const items = this.cartItemsDetailed();
    if (items.length === 0) {
      this.toastService.warning('Twój koszyk jest pusty.', 'Pusty koszyk');
      return;
    }

    const method = this.paymentMethod();

    if (method === 'BLIK') {
      const code = this.blikCode().trim();
      if (!/^\d{6}$/.test(code)) {
        this.blikError.set('Kod BLIK musi składać się dokładnie z 6 cyfr.');
        return;
      }

      // Sprawdź kod w silniku Stripe Sandbox
      const sandboxCheck = await this.paymentService.processBlikPayment(this.cartTotal(), code);
      if (!sandboxCheck.success) {
        this.blikError.set(sandboxCheck.error || 'Płatność odrzucona przez bramkę Stripe.');
        return;
      }

      // Rozpocznij symulację oczekiwania na akceptację w aplikacji bankowej
      this.isAwaitingBankAuth.set(true);
      this.blikTimer.set(60);

      if (this.authTimerInterval) clearInterval(this.authTimerInterval);
      this.authTimerInterval = setInterval(() => {
        this.blikTimer.update(t => {
          if (t <= 1) {
            clearInterval(this.authTimerInterval);
            return 0;
          }
          return t - 1;
        });
      }, 1000);

      // Symulacja akceptacji płatności przez użytkownika w banku (po 2 sekundach)
      setTimeout(async () => {
        clearInterval(this.authTimerInterval);
        await this.finalizeOrderCreation(true, 'BLIK', sandboxCheck.transactionId);
      }, 2000);

    } else if (method === 'Apple Pay' || method === 'Google Pay') {
      this.isSubmitting.set(true);
      const res = await this.paymentService.processWalletPayment(method, this.cartTotal());
      setTimeout(async () => {
        await this.finalizeOrderCreation(true, method, res.transactionId);
      }, 1200);

    } else if (method === 'Karta') {
      this.isSubmitting.set(true);
      const res = await this.paymentService.processCardPayment(this.cartTotal());
      setTimeout(async () => {
        await this.finalizeOrderCreation(true, 'Karta', res.transactionId);
      }, 1200);

    } else {
      // Płatność gotówką u obsługi
      this.isSubmitting.set(true);
      await this.finalizeOrderCreation(false, 'Gotówka');
    }
  }

  private async finalizeOrderCreation(paid: boolean, method: string, transactionId?: string): Promise<void> {
    this.isSubmitting.set(true);

    try {
      const orderItems: OrderItem[] = this.cartItemsDetailed().map(i => ({
        recipeId: i.recipe.id,
        recipeName: i.recipe.name,
        quantity: i.quantity,
        unitPrice: i.recipe.sellingPrice || 0,
        category: i.recipe.category
      }));

      const isTakeout = this.orderType() === 'takeout';
      const resolvedTable = isTakeout ? 'Wynos' : (this.tableNumber().trim() || 'Stolik 1');

      const dto: CreateOrderDto = {
        tableNumber: resolvedTable,
        items: orderItems,
        notes: this.orderNotes().trim() || undefined,
        paid,
        paymentMethod: method,
        stripePaymentIntentId: transactionId,
        customerName: this.customerName().trim() || undefined,
        customerPhone: this.customerPhone().trim() || undefined,
        isTakeout
      };

      const newOrder = await this.orderService.createGuestOrder(this.restaurantId(), dto);

      // Jeśli to zamówienie przy stoliku, powiadom system stolików
      if (!isTakeout) {
        this.tableService.occupyTableByNumber(resolvedTable, {
          orderId: newOrder.id,
          orderNumber: newOrder.orderNumber,
          total: newOrder.totalPrice,
          itemsCount: orderItems.length
        }).catch(() => {});
      }

      this.completedOrder.set(newOrder);
      this.clearCart();
      this.isAwaitingBankAuth.set(false);
      this.isSubmitting.set(false);
      this.isCheckoutOpen.set(false);

      // Uruchom nasłuchiwanie na żywo statusu zamówienia gościa w kuchni!
      if (this.orderUnsub) this.orderUnsub();
      this.orderUnsub = this.orderService.watchOrder(newOrder.id, (updated) => {
        if (updated) {
          this.completedOrder.set(updated);
        }
      });

    } catch (err) {
      console.error('Błąd podczas finalizacji zamówienia:', err);
      this.toastService.danger('Wystąpił problem z realizacją zamówienia. Spróbuj ponownie.', 'Błąd płatności');
      this.isAwaitingBankAuth.set(false);
      this.isSubmitting.set(false);
    }
  }

  resetOrderView(): void {
    if (this.orderUnsub) {
      this.orderUnsub();
      this.orderUnsub = null;
    }
    this.completedOrder.set(null);
    this.blikCode.set('');
    this.orderNotes.set('');
  }
}
