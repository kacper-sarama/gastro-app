import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { RecipeService } from '../../core/services/recipe.service';
import { InventoryService } from '../../core/services/inventory.service';
import { AuthService } from '../../core/services/auth.service';
import { Recipe, RecipeCapacityResult } from '../../core/models/recipe.model';
import { QrCodeModalComponent } from './qr-code-modal.component';
import { StatCardComponent } from '../../shared/components/stat-card/stat-card.component';

@Component({
  selector: 'app-menu-management',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, QrCodeModalComponent, StatCardComponent],
  templateUrl: './menu-management.component.html'
})
export class MenuManagementComponent {
  readonly recipeService = inject(RecipeService);
  readonly inventoryService = inject(InventoryService);
  readonly authService = inject(AuthService);
  private router = inject(Router);

  // Filtry
  searchQuery = signal<string>('');
  selectedCategory = signal<string>('all');

  // Modal QR
  isQrModalOpen = signal<boolean>(false);

  // Kategorie
  readonly categories = computed(() => this.recipeService.allCategories());

  // URL do publicznego menu
  readonly publicMenuUrl = computed(() => {
    const user = this.authService.currentUser();
    const restId = user ? user.uid : 'demo-restaurant';
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4200';
    return `${origin}/menu/${restId}`;
  });

  // Receptury po filtrach
  readonly filteredRecipes = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const cat = this.selectedCategory();
    const recipes = this.recipeService.recipes();

    return recipes.filter(r => {
      // 1. Wyszukiwanie tekstem
      const matchesSearch = !query || 
        r.name.toLowerCase().includes(query) || 
        (r.description && r.description.toLowerCase().includes(query)) ||
        (r.category && r.category.toLowerCase().includes(query));

      if (!matchesSearch) return false;

      // 2. Kategoria
      if (cat !== 'all' && (r.category || '').toLowerCase() !== cat.toLowerCase()) {
        return false;
      }

      return true;
    });
  });

  // Dania pogrupowane według kategorii do wyświetlenia w karcie
  readonly groupedDishes = computed(() => {
    const dishes = this.filteredRecipes();
    const cats = this.categories();

    return cats.map(cat => ({
      category: cat,
      items: dishes.filter(d => (d.category || '').toLowerCase() === cat.toLowerCase())
    })).filter(g => g.items.length > 0);
  });

  // Metryki Menu
  readonly totalDishes = computed(() => this.recipeService.recipes().length);

  readonly availableDishes = computed(() => {
    const recipes = this.recipeService.recipes();
    return recipes.filter(r => {
      const isManualActive = r.isAvailable !== false;
      const capacity = this.recipeService.getCapacity(r.id);
      return isManualActive && capacity.status !== 'blocked';
    }).length;
  });

  readonly soldOutDishes = computed(() => {
    const recipes = this.recipeService.recipes();
    return recipes.filter(r => {
      const capacity = this.recipeService.getCapacity(r.id);
      return capacity.status === 'blocked';
    }).length;
  });

  readonly manuallyHiddenDishes = computed(() => {
    const recipes = this.recipeService.recipes();
    return recipes.filter(r => r.isAvailable === false).length;
  });

  // Dynamiczny status cyfrowej karty menu na żywo (dla chipa w nagłówku)
  readonly menuOnlineStatus = computed(() => {
    const total = this.totalDishes();
    const soldOut = this.soldOutDishes();

    if (total === 0) {
      return {
        label: 'Szkic menu',
        badgeClass: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
        dotClass: 'bg-slate-400',
        pulse: false
      };
    }

    if (soldOut > 0) {
      return {
        label: `Karta Online (${soldOut} ${soldOut === 1 ? 'wyprzedane' : 'wyprzedane'})`,
        badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
        dotClass: 'bg-amber-500',
        pulse: true
      };
    }

    return {
      label: 'Karta Online (Wszystkie dania dostępne)',
      badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      dotClass: 'bg-emerald-500',
      pulse: true
    };
  });

  getCapacity(recipeId: string): RecipeCapacityResult {
    return this.recipeService.getCapacity(recipeId);
  }

  getIngredientNames(recipe: Recipe): string[] {
    const items = this.inventoryService.items();
    return (recipe.ingredients || [])
      .map(ing => items.find(i => i.id === ing.inventoryItemId)?.name)
      .filter((name): name is string => !!name);
  }

  async toggleAvailability(recipe: Recipe): Promise<void> {
    const current = recipe.isAvailable !== false;
    await this.recipeService.toggleAvailability(recipe.id, !current);
  }

  async toggleFeatured(recipe: Recipe): Promise<void> {
    const current = !!recipe.isFeatured;
    await this.recipeService.toggleFeatured(recipe.id, !current);
  }

  openQrModal(): void {
    this.isQrModalOpen.set(true);
  }

  closeQrModal(): void {
    this.isQrModalOpen.set(false);
  }

  openGuestPreview(): void {
    const user = this.authService.currentUser();
    const restId = user ? user.uid : 'demo-restaurant';
    this.router.navigate(['/menu', restId]);
  }
}
