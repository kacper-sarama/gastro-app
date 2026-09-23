import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { RecipeService } from '../../core/services/recipe.service';
import { InventoryService } from '../../core/services/inventory.service';
import { ThemeService } from '../../core/services/theme.service';
import { Recipe, RecipeCapacityResult } from '../../core/models/recipe.model';

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

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('restaurantId');
    if (id) {
      this.restaurantId.set(id);
    }
  }

  readonly categories = computed(() => this.recipeService.allCategories());

  // Dania widoczne dla gości (zarówno dostępne, jak i chwilowo wyprzedane, ale nie wyłączone manualnie)
  readonly menuDishes = computed(() => {
    return this.recipeService.recipes().filter(r => r.isAvailable !== false);
  });

  readonly filteredDishes = computed(() => {
    const cat = this.selectedCategory();
    const dishes = this.menuDishes();
    if (cat === 'all') return dishes;
    return dishes.filter(d => (d.category || '').toLowerCase() === cat.toLowerCase());
  });

  readonly groupedDishes = computed(() => {
    const dishes = this.filteredDishes();
    const cats = this.categories();

    return cats.map(cat => ({
      category: cat,
      items: dishes.filter(d => (d.category || '').toLowerCase() === cat.toLowerCase())
    })).filter(g => g.items.length > 0);
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
      .map(ing => items.find(i => i.id === ing.inventoryItemId)?.name)
      .filter((name): name is string => !!name);
  }
}
