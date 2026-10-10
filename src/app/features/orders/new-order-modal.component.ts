import { Component, EventEmitter, Input, Output, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RecipeService } from '../../core/services/recipe.service';
import { OrderService } from '../../core/services/order.service';
import { TableService } from '../../core/services/table.service';
import { PromotionService } from '../../core/services/promotion.service';
import { Recipe, RecipeCapacityResult } from '../../core/models/recipe.model';
import { OrderItem } from '../../core/models/order.model';
import { Promotion } from '../../core/models/promotion.model';
import { RestaurantTable } from '../../core/models/table.model';

export interface QuickTableOption {
  name: string;
  icon: string;
  type?: 'table' | 'bar' | 'takeout' | 'outdoor';
}

@Component({
  selector: 'app-new-order-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './new-order-modal.component.html'
})
export class NewOrderModalComponent {
  readonly recipeService = inject(RecipeService);
  readonly orderService = inject(OrderService);
  readonly tableService = inject(TableService);
  readonly promotionService = inject(PromotionService);

  @Input() set initialTableNumber(val: string | undefined) {
    if (val && val.trim()) {
      const trimmed = val.trim();
      this.tableNumber.set(trimmed);
      if (trimmed.toLowerCase().includes('wynos')) {
        this.selectedModalZone.set('takeout');
        const match = trimmed.match(/\((.*?)\)/);
        if (match && match[1]) {
          this.takeoutCustomerInfo.set(match[1]);
        }
      } else {
        const found = this.tableService.tables().find(t => t.number.trim().toLowerCase() === trimmed.toLowerCase());
        if (found?.zone) {
          this.selectedModalZone.set(found.zone);
        } else {
          this.selectedModalZone.set('all');
        }
      }
    }
  }

  @Output() close = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

  // 3-krokowy Stepper: 1 (Menu) -> 2 (Promocje) -> 3 (Stolik)
  currentStep = signal<1 | 2 | 3>(1);

  // Krok w widoku mobilnym w Kroku 1: 'menu' (dania) lub 'cart' (koszyk)
  mobileTab = signal<'menu' | 'cart'>('menu');

  tableNumber = signal<string>('Stolik 1');
  searchQuery = signal<string>('');
  selectedCategory = signal<string>('all');

  // Informacja o kliencie na wynos (np. imię / telefon)
  takeoutCustomerInfo = signal<string>('');

  // Mapa wybranych pozycji: [recipeId -> quantity]
  quantities = signal<Record<string, number>>({});
  isSubmitting = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  // Promocje & Kody
  selectedPromotionId = signal<string | null>(null);
  promoCodeInput = signal<string>('');
  promoCodeMessage = signal<{ text: string; isError: boolean } | null>(null);

  // Notatki / uwagi dla kuchni
  notes = signal<string>('');

  // Wybór strefy stolików w modalu (domyślnie 'all' lub 'takeout' lub nazwa strefy)
  selectedModalZone = signal<string>('all');

  // Przewidywany numer kolejnego zamówienia (np. #101)
  readonly nextOrderNumber = computed<number>(() => {
    const currentOrders = this.orderService.orders();
    const maxNum = currentOrders.reduce((max, o) => Math.max(max, o.orderNumber || 100), 100);
    return maxNum + 1;
  });

  // Liczniki stolików w poszczególnych strefach
  readonly modalZoneCounts = computed<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const t of this.tableService.tablesWithLiveStatus()) {
      const z = t.zone?.trim() || 'Inne';
      counts[z] = (counts[z] || 0) + 1;
    }
    return counts;
  });

  // Dynamiczne stoliki z bazy wg wybranej strefy (posortowane naturalnie)
  readonly modalTables = computed<RestaurantTable[]>(() => {
    const zone = this.selectedModalZone();
    if (zone === 'takeout') return [];
    const tables = this.tableService.tablesWithLiveStatus();
    const filtered = zone === 'all' 
      ? tables 
      : tables.filter(t => (t.zone || '').trim().toLowerCase() === zone.toLowerCase());

    return [...filtered].sort((a, b) => {
      return a.number.localeCompare(b.number, 'pl', { numeric: true });
    });
  });

  getTableIcon(tbl: RestaurantTable): string {
    const num = (tbl.number || '').toLowerCase();
    const zone = (tbl.zone || '').toLowerCase();
    if (num.includes('bar') || zone.includes('bar')) return 'local_bar';
    if (num.includes('ogród') || zone.includes('ogród')) return 'deck';
    return 'table_restaurant';
  }

  selectModalZone(zone: string): void {
    this.selectedModalZone.set(zone);
    if (zone === 'takeout') {
      const info = this.takeoutCustomerInfo().trim();
      this.tableNumber.set(info ? `Wynos (${info})` : 'Wynos / Odbiór');
    } else {
      if (this.tableNumber().toLowerCase().includes('wynos')) {
        const first = this.modalTables()[0];
        this.tableNumber.set(first?.number || 'Stolik 1');
      }
    }
  }

  onTakeoutCustomerChange(val: string): void {
    this.takeoutCustomerInfo.set(val);
    const trimmed = val.trim();
    if (trimmed) {
      this.tableNumber.set(`Wynos (${trimmed})`);
    } else {
      this.tableNumber.set('Wynos / Odbiór');
    }
  }

  // Czy to domówienie do już zajętego stolika (kolejny bon kuchenny)
  readonly isReorder = computed<boolean>(() => {
    const num = this.tableNumber().trim().toLowerCase();
    if (!num || num === 'wynos' || num.includes('wynos')) return false;
    const table = this.tableService.tables().find(t => t.number.trim().toLowerCase() === num);
    return !!table && (table.status === 'occupied' || table.status === 'bill_requested');
  });

  readonly categories = computed(() => {
    const available = this.recipeService.recipes().filter(r => r.isAvailable !== false);
    const set = new Set<string>();
    for (const r of available) {
      if (r.category && r.category.trim()) {
        set.add(r.category.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pl'));
  });

  readonly availableRecipes = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const cat = this.selectedCategory();
    const all = this.recipeService.recipes().filter(r => r.isAvailable !== false);

    return all.filter(r => {
      const matchesSearch = !query || 
        r.name.toLowerCase().includes(query) || 
        (r.category && r.category.toLowerCase().includes(query));

      if (!matchesSearch) return false;
      if (cat !== 'all' && (r.category || '').toLowerCase() !== cat.toLowerCase()) return false;
      return true;
    });
  });

  // Lista wybranych dań do zamówienia
  readonly selectedItems = computed<OrderItem[]>(() => {
    const qMap = this.quantities();
    const recipes = this.recipeService.recipes();
    const items: OrderItem[] = [];

    for (const [recipeId, qty] of Object.entries(qMap)) {
      if (qty > 0) {
        const r = recipes.find(rec => rec.id === recipeId);
        if (r) {
          items.push({
            recipeId: r.id,
            recipeName: r.name,
            quantity: qty,
            unitPrice: r.sellingPrice || 0,
            category: r.category
          });
        }
      }
    }

    return items;
  });

  readonly totalPrice = computed(() => {
    return this.selectedItems().reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
  });

  readonly totalItemsCount = computed(() => {
    return this.selectedItems().reduce((sum, item) => sum + item.quantity, 0);
  });

  // --- Ewaluacja aktywnych promocji względem bieżącego koszyka ---
  readonly evaluatedPromotions = computed(() => {
    const promos = this.promotionService.activePromotions();
    const items = this.selectedItems();

    return promos.map(promo => {
      const result = this.promotionService.calculateValidationAndDiscount(promo, items);
      return {
        promo,
        ...result
      };
    });
  });

  readonly appliedPromotionData = computed(() => {
    const pId = this.selectedPromotionId();
    if (!pId) return null;
    const match = this.evaluatedPromotions().find(e => e.promo.id === pId);
    return match || null;
  });

  readonly discountAmount = computed(() => {
    const applied = this.appliedPromotionData();
    if (!applied || !applied.isEligible) return 0;
    return applied.discountAmount;
  });

  readonly finalTotalPrice = computed(() => {
    const subtotal = this.totalPrice();
    const discount = this.discountAmount();
    return Math.max(0, Math.round((subtotal - discount) * 100) / 100);
  });

  getCapacity(recipeId: string): RecipeCapacityResult | undefined {
    return this.recipeService.capacitiesMap().get(recipeId);
  }

  getMaxPortions(recipeId: string): number {
    const cap = this.getCapacity(recipeId);
    return cap ? cap.maxPortions : 999;
  }

  isMaxReached(recipeId: string): boolean {
    const qty = this.getQuantity(recipeId);
    const max = this.getMaxPortions(recipeId);
    return qty >= max;
  }

  getQuantity(recipeId: string): number {
    return this.quantities()[recipeId] || 0;
  }

  incrementItem(recipeId: string): void {
    const current = this.quantities();
    const currentVal = current[recipeId] || 0;
    const capacity = this.getCapacity(recipeId);
    const maxAllowed = capacity ? capacity.maxPortions : 999;

    if (currentVal >= maxAllowed) {
      const r = this.recipeService.recipes().find(rec => rec.id === recipeId);
      const bottleneckName = capacity?.bottleneckIngredient?.name;
      const bottleneckInfo = bottleneckName ? ` (brakujący składnik: ${bottleneckName})` : '';
      this.errorMessage.set(
        `Osiągnięto limit surowców w magazynie dla „${r?.name || 'dania'}”: maksymalnie ${maxAllowed} szt.${bottleneckInfo}`
      );
      return;
    }

    this.quantities.set({ ...current, [recipeId]: currentVal + 1 });
    this.errorMessage.set(null);
  }

  decrementItem(recipeId: string): void {
    const current = this.quantities();
    const val = (current[recipeId] || 0) - 1;
    if (val <= 0) {
      const copy = { ...current };
      delete copy[recipeId];
      this.quantities.set(copy);
    } else {
      this.quantities.set({ ...current, [recipeId]: val });
    }
    this.errorMessage.set(null);
  }

  // --- Nawigacja w Stepperze ---

  goToStep(targetStep: 1 | 2 | 3): void {
    if (targetStep > 1 && this.selectedItems().length === 0) {
      this.errorMessage.set('Wybierz co najmniej jedno danie z menu przed przejściem dalej.');
      return;
    }
    this.errorMessage.set(null);
    this.currentStep.set(targetStep);
  }

  selectQuickTable(tblName: string): void {
    this.tableNumber.set(tblName);
  }

  // --- Akcje modułu promocji ---

  togglePromotion(promoId: string): void {
    if (this.selectedPromotionId() === promoId) {
      this.selectedPromotionId.set(null);
      this.promoCodeMessage.set(null);
    } else {
      this.selectedPromotionId.set(promoId);
      this.promoCodeMessage.set(null);
    }
  }

  removeAppliedPromotion(): void {
    this.selectedPromotionId.set(null);
    this.promoCodeMessage.set(null);
  }

  addBonusItem(recipeId: string): void {
    this.incrementItem(recipeId);
  }

  applyPromoCode(): void {
    const code = this.promoCodeInput().trim().toUpperCase();
    if (!code) {
      this.promoCodeMessage.set({ text: 'Wpisz kod promocji.', isError: true });
      return;
    }

    const match = this.promotionService.activePromotions().find(
      p => (p.code || '').toUpperCase() === code
    );

    if (!match) {
      this.promoCodeMessage.set({ text: 'Nieprawidłowy lub nieaktywny kod promocji.', isError: true });
      return;
    }

    this.selectedPromotionId.set(match.id);
    const evaluation = this.promotionService.calculateValidationAndDiscount(match, this.selectedItems());

    if (evaluation.isEligible) {
      this.promoCodeMessage.set({ text: `Zastosowano promocję: ${match.name}!`, isError: false });
    } else {
      this.promoCodeMessage.set({
        text: `Kod zaakceptowany: ${evaluation.missingRequirementReason || 'Niespełnione warunki'}`,
        isError: false
      });
    }
    this.promoCodeInput.set('');
  }

  async onSubmitOrder(): Promise<void> {
    const items = this.selectedItems();
    if (items.length === 0) {
      this.errorMessage.set('Wybierz co najmniej jedno danie z menu.');
      this.currentStep.set(1);
      return;
    }

    // Walidacja stanów magazynowych przed przesłaniem na kuchnię
    for (const item of items) {
      const capacity = this.getCapacity(item.recipeId);
      const maxAllowed = capacity ? capacity.maxPortions : 999;
      if (item.quantity > maxAllowed) {
        const bottleneck = capacity?.bottleneckIngredient?.name;
        const bottleneckText = bottleneck ? ` Brakujący surowiec: ${bottleneck}.` : '';
        this.errorMessage.set(
          `Przekroczono limit magazynowy dla „${item.recipeName}” (wybrano ${item.quantity} szt., w magazynie maks. ${maxAllowed} szt.).${bottleneckText}`
        );
        this.currentStep.set(1);
        return;
      }
    }

    const applied = this.appliedPromotionData();
    const isPromoValid = applied && applied.isEligible;

    this.isSubmitting.set(true);
    try {
      const tableNumber = this.tableNumber().trim() || 'Stolik 1';
      const createdOrder = await this.orderService.createOrder({
        tableNumber,
        items,
        appliedPromotionId: isPromoValid ? applied.promo.id : undefined,
        appliedPromotionName: isPromoValid ? applied.promo.name : undefined,
        discountAmount: isPromoValid ? this.discountAmount() : undefined,
        originalPrice: this.totalPrice(),
        notes: this.notes().trim() || undefined
      });

      // Jeśli to zamówienie na stolik sali (nie wynos / odbiór), oznacz stolik trwale jako zajęty
      const isTakeout = this.selectedModalZone() === 'takeout' || tableNumber.toLowerCase().includes('wynos');
      if (!isTakeout) {
        await this.tableService.occupyTableByNumber(tableNumber, {
          orderId: createdOrder.id,
          orderNumber: createdOrder.orderNumber,
          total: createdOrder.totalPrice,
          itemsCount: items.reduce((s, i) => s + i.quantity, 0)
        });
      }

      this.created.emit();
      this.close.emit();
    } catch {
      this.errorMessage.set('Wystąpił błąd podczas rejestracji zamówienia.');
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
