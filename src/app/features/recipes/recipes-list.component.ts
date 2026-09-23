import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RecipeService } from '../../core/services/recipe.service';
import { InventoryService } from '../../core/services/inventory.service';
import { Recipe, RecipeCapacityResult, RecipeFormData } from '../../core/models/recipe.model';
import { AddEditRecipeModalComponent } from './add-edit-recipe-modal.component';
import { RecipeDetailsModalComponent } from './recipe-details-modal.component';
import { ManageCategoriesModalComponent } from './manage-categories-modal.component';

@Component({
  selector: 'app-recipes-list',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    AddEditRecipeModalComponent, 
    RecipeDetailsModalComponent,
    ManageCategoriesModalComponent
  ],
  templateUrl: './recipes-list.component.html'
})
export class RecipesListComponent {
  readonly recipeService = inject(RecipeService);
  readonly inventoryService = inject(InventoryService);

  // Filtry
  searchQuery = signal<string>('');
  selectedCategory = signal<string>('all');
  selectedStatusFilter = signal<'all' | 'available' | 'low' | 'blocked'>('all');

  // Stan Modali
  isAddEditModalOpen = signal(false);
  recipeToEdit = signal<Recipe | undefined>(undefined);

  isDetailsModalOpen = signal(false);
  selectedRecipeForDetails = signal<Recipe | undefined>(undefined);

  isManageCategoriesModalOpen = signal(false);

  recipeToDelete = signal<Recipe | undefined>(undefined);

  readonly categories = computed(() => this.recipeService.allCategories());

  getCategoryDishCount(cat: string): number {
    return this.recipeService.getCategoryDishCount(cat);
  }

  readonly filteredRecipes = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const cat = this.selectedCategory();
    const status = this.selectedStatusFilter();
    const recipes = this.recipeService.recipes();

    return recipes.filter(r => {
      // 1. Filtr tekstu
      const matchesSearch = !query || 
        r.name.toLowerCase().includes(query) || 
        (r.description && r.description.toLowerCase().includes(query)) ||
        r.category.toLowerCase().includes(query);

      if (!matchesSearch) return false;

      // 2. Filtr kategorii
      if (cat !== 'all' && r.category !== cat) {
        return false;
      }

      // 3. Filtr statusu wydajności
      if (status !== 'all') {
        const capacity = this.recipeService.getCapacity(r.id);
        if (capacity.status !== status) {
          return false;
        }
      }

      return true;
    });
  });

  getCapacity(recipeId: string): RecipeCapacityResult {
    return this.recipeService.getCapacity(recipeId);
  }

  openAddModal(): void {
    this.recipeToEdit.set(undefined);
    this.isAddEditModalOpen.set(true);
  }

  openEditModal(recipe: Recipe): void {
    this.recipeToEdit.set(recipe);
    this.isAddEditModalOpen.set(true);
  }

  closeAddEditModal(): void {
    this.isAddEditModalOpen.set(false);
    this.recipeToEdit.set(undefined);
  }

  async onSaveRecipe(data: RecipeFormData): Promise<void> {
    const edit = this.recipeToEdit();
    if (edit) {
      await this.recipeService.updateRecipe(edit.id, data);
    } else {
      await this.recipeService.addRecipe(data);
    }
    this.closeAddEditModal();
  }

  openDetailsModal(recipe: Recipe): void {
    this.selectedRecipeForDetails.set(recipe);
    this.isDetailsModalOpen.set(true);
  }

  closeDetailsModal(): void {
    this.isDetailsModalOpen.set(false);
    this.selectedRecipeForDetails.set(undefined);
  }

  openManageCategoriesModal(): void {
    this.isManageCategoriesModalOpen.set(true);
  }

  closeManageCategoriesModal(): void {
    this.isManageCategoriesModalOpen.set(false);
  }

  promptDelete(recipe: Recipe): void {
    this.recipeToDelete.set(recipe);
  }

  cancelDelete(): void {
    this.recipeToDelete.set(undefined);
  }

  async confirmDelete(): Promise<void> {
    const r = this.recipeToDelete();
    if (r) {
      await this.recipeService.deleteRecipe(r.id);
      this.cancelDelete();
    }
  }
}
