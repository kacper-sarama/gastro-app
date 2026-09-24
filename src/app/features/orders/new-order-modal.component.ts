import { Component, EventEmitter, Output, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RecipeService } from '../../core/services/recipe.service';
import { OrderService } from '../../core/services/order.service';
import { Recipe } from '../../core/models/recipe.model';
import { OrderItem } from '../../core/models/order.model';

@Component({
  selector: 'app-new-order-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './new-order-modal.component.html'
})
export class NewOrderModalComponent {
  readonly recipeService = inject(RecipeService);
  readonly orderService = inject(OrderService);

  @Output() close = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

  tableNumber = signal<string>('Stolik 1');
  searchQuery = signal<string>('');
  selectedCategory = signal<string>('all');

  // Krok w widoku mobilnym: 'menu' (wybór dań) lub 'summary' (stolik i podsumowanie)
  mobileStep = signal<'menu' | 'summary'>('menu');

  // Mapa wybranych pozycji: [recipeId -> quantity]
  quantities = signal<Record<string, number>>({});
  isSubmitting = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  readonly quickTables = ['Stolik 1', 'Stolik 2', 'Stolik 3', 'Stolik 4', 'Stolik 5', 'Bar', 'Wynos'];

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

  getQuantity(recipeId: string): number {
    return this.quantities()[recipeId] || 0;
  }

  incrementItem(recipeId: string): void {
    const current = this.quantities();
    const val = (current[recipeId] || 0) + 1;
    this.quantities.set({ ...current, [recipeId]: val });
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
  }

  async onSubmitOrder(): Promise<void> {
    const items = this.selectedItems();
    if (items.length === 0) {
      this.errorMessage.set('Wybierz co najmniej jedno danie z menu.');
      return;
    }

    this.isSubmitting.set(true);
    try {
      await this.orderService.createOrder({
        tableNumber: this.tableNumber(),
        items
      });
      this.created.emit();
      this.close.emit();
    } catch {
      this.errorMessage.set('Wystąpił błąd podczas rejestracji zamówienia.');
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
