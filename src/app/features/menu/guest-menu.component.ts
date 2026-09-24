import { Component, inject, signal, computed, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { RecipeService } from '../../core/services/recipe.service';
import { InventoryService } from '../../core/services/inventory.service';
import { ThemeService } from '../../core/services/theme.service';
import { Recipe, RecipeCapacityResult, resolveFallbackIngredient } from '../../core/models/recipe.model';

@Component({
  selector: 'app-guest-menu',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './guest-menu.component.html'
})
export class GuestMenuComponent implements OnInit {
  private route = inject(ActivatedRoute);
  readonly recipeService = inject(RecipeService);
  readonly inventoryService = inject(InventoryService);
  readonly themeService = inject(ThemeService);

  restaurantId = signal<string>('demo-restaurant');
  selectedCategory = signal<string>('all');

  constructor() {
    // Jeśli wybrana kategoria przestanie mieć jakiekolwiek pozycje (np. wyłączono jedyne danie),
    // automatycznie zresetuj widok na "Wszystkie", aby gość nie widział pustej strony.
    effect(() => {
      const activeCats = this.categories();
      const current = this.selectedCategory();
      if (current !== 'all' && !activeCats.some(c => c.toLowerCase() === current.toLowerCase())) {
        this.selectedCategory.set('all');
      }
    });
  }

  readonly displayName = computed(() => 
    this.recipeService.activeRestaurantName() || 'Karta Menu'
  );

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('restaurantId');
    if (id) {
      this.restaurantId.set(id);
      // Pobierz na żywo z chmury Firestore menu i stany magazynowe dla danego lokalu
      this.recipeService.loadRestaurantData(id);
      this.inventoryService.loadRestaurantData(id);
    }
  }

  // Dania widoczne dla gości (tylko włączone manualnie przez restauratora)
  readonly menuDishes = computed(() => {
    return this.recipeService.recipes().filter(r => r.isAvailable !== false);
  });

  // Pigułki kategorii w menu gościa: TYLKO te kategorie, które mają CO NAJMNIEJ jedno widoczne danie!
  // Pusta kategoria (np. Calzone gdy wyłączono pozycję) nie pojawia się w menu gościa.
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

    // Awaryjne dołączenie pozycji, jeśli którakolwiek nie miała przypisanej kategorii
    const uncategorized = dishes.filter(d => !d.category || !cats.some(c => c.toLowerCase() === d.category.toLowerCase()));
    if (uncategorized.length > 0) {
      groups.push({
        category: 'Inne',
        items: uncategorized
      });
    }

    return groups;
  });

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
}
