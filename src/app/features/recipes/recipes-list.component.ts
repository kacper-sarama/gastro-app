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
import { StatCardComponent } from '../../shared/components/stat-card/stat-card.component';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';

@Component({
  selector: 'app-recipes-list',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    StatCardComponent,
    MatDialogModule,
    MatSelectModule,
    MatFormFieldModule,
    MatTooltipModule
  ],
  templateUrl: './recipes-list.component.html'
})
export class RecipesListComponent {
  readonly recipeService = inject(RecipeService);
  readonly inventoryService = inject(InventoryService);
  private dialog = inject(MatDialog);
  private confirmDialogService = inject(ConfirmDialogService);

  searchQuery = signal<string>('');
  selectedCategory = signal<string>('all');
  selectedStatusFilter = signal<'all' | 'available' | 'low' | 'blocked'>('all');

  toggleStatusFilter(status: 'all' | 'available' | 'low' | 'blocked'): void {
    if (this.selectedStatusFilter() === status) {
      this.selectedStatusFilter.set('all');
    } else {
      this.selectedStatusFilter.set(status);
    }
  }

  // Stan Modali
  isAddEditModalOpen = signal(false);
  recipeToEdit = signal<Recipe | undefined>(undefined);

  isDetailsModalOpen = signal(false);
  selectedRecipeForDetails = signal<Recipe | undefined>(undefined);

  isManageCategoriesModalOpen = signal(false);

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
    const ref = this.dialog.open(AddEditRecipeModalComponent, {
      panelClass: 'gastro-dialog-panel'
    });
    ref.afterClosed().subscribe(async (data: RecipeFormData | undefined) => {
      if (data) {
        await this.recipeService.addRecipe(data);
      }
    });
  }

  openEditModal(recipe: Recipe): void {
    const ref = this.dialog.open(AddEditRecipeModalComponent, {
      data: { recipeToEdit: recipe },
      panelClass: 'gastro-dialog-panel'
    });
    ref.afterClosed().subscribe(async (data: RecipeFormData | undefined) => {
      if (data) {
        await this.recipeService.updateRecipe(recipe.id, data);
      }
    });
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
    const capacity = this.getCapacity(recipe.id);
    const dialogRef = this.dialog.open(RecipeDetailsModalComponent, {
      data: { recipe, capacity },
      panelClass: 'gastro-dialog-panel'
    });

    dialogRef.afterClosed().subscribe((res?: { action: string; recipe?: Recipe }) => {
      if (res?.action === 'edit' && res.recipe) {
        this.openEditModal(res.recipe);
      }
    });
  }

  closeDetailsModal(): void {
    this.isDetailsModalOpen.set(false);
    this.selectedRecipeForDetails.set(undefined);
  }

  openManageCategoriesModal(): void {
    this.dialog.open(ManageCategoriesModalComponent, {
      panelClass: 'gastro-dialog-panel'
    });
  }

  async promptDelete(recipe: Recipe): Promise<void> {
    const confirmed = await this.confirmDialogService.confirm({
      title: 'Usunąć recepturę?',
      message: `Czy na pewno chcesz usunąć recepturę "${recipe.name}"?`,
      confirmText: 'Usuń',
      isDestructive: true
    });

    if (confirmed) {
      await this.recipeService.deleteRecipe(recipe.id);
    }
  }
}
