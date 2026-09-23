import { Component, EventEmitter, Output, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RecipeService } from '../../core/services/recipe.service';

@Component({
  selector: 'app-manage-categories-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './manage-categories-modal.component.html'
})
export class ManageCategoriesModalComponent {
  readonly recipeService = inject(RecipeService);

  @Output() close = new EventEmitter<void>();

  // Nowa kategoria
  newCategoryName = signal<string>('');
  newCategoryError = signal<string | null>(null);

  // Edycja inline
  editingCategory = signal<string | null>(null);
  editCategoryName = signal<string>('');
  editCategoryError = signal<string | null>(null);

  // Usuwanie z przeniesieniem dań
  deletingCategory = signal<string | null>(null);
  targetReassignCategory = signal<string>('');

  // Komunikaty sukcesu
  successFeedback = signal<string | null>(null);
  isSubmitting = signal<boolean>(false);

  // Lista wszystkich kategorii
  readonly categories = computed(() => this.recipeService.allCategories());

  // Kategorie alternatywne dla przenoszenia dań (bez aktualnie usuwanej)
  readonly alternativeCategories = computed(() => {
    const current = this.deletingCategory();
    return this.categories().filter(c => c !== current);
  });

  getDishCount(category: string): number {
    return this.recipeService.getCategoryDishCount(category);
  }

  async onAddCategory(): Promise<void> {
    const name = this.newCategoryName().trim();
    this.newCategoryError.set(null);

    if (!name) {
      this.newCategoryError.set('Podaj nazwę nowej kategorii.');
      return;
    }
    if (name.length < 2) {
      this.newCategoryError.set('Nazwa musi zawierać co najmniej 2 znaki.');
      return;
    }
    if (this.categories().some(c => c.toLowerCase() === name.toLowerCase())) {
      this.newCategoryError.set('Kategoria o takiej nazwie już istnieje.');
      return;
    }

    this.isSubmitting.set(true);
    try {
      const added = await this.recipeService.addCategory(name);
      if (added) {
        this.newCategoryName.set('');
        this.showFeedback(`Kategoria "${name}" została dodana pomyślnie.`);
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  startEdit(cat: string): void {
    this.editingCategory.set(cat);
    this.editCategoryName.set(cat);
    this.editCategoryError.set(null);
    this.deletingCategory.set(null);
  }

  cancelEdit(): void {
    this.editingCategory.set(null);
    this.editCategoryName.set('');
    this.editCategoryError.set(null);
  }

  async onSaveEdit(oldCat: string): Promise<void> {
    const newName = this.editCategoryName().trim();
    this.editCategoryError.set(null);

    if (!newName) {
      this.editCategoryError.set('Nazwa kategorii nie może być pusta.');
      return;
    }
    if (newName.length < 2) {
      this.editCategoryError.set('Nazwa musi mieć min. 2 znaki.');
      return;
    }
    if (newName.toLowerCase() === oldCat.toLowerCase()) {
      this.cancelEdit();
      return;
    }
    if (this.categories().some(c => c.toLowerCase() === newName.toLowerCase() && c.toLowerCase() !== oldCat.toLowerCase())) {
      this.editCategoryError.set('Kategoria o takiej nazwie już istnieje.');
      return;
    }

    this.isSubmitting.set(true);
    try {
      await this.recipeService.renameCategory(oldCat, newName);
      this.cancelEdit();
      this.showFeedback(`Nazwa zmieniona z "${oldCat}" na "${newName}". Wszystkie powiązane dania zaktualizowano.`);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  startDelete(cat: string): void {
    const count = this.getDishCount(cat);
    this.cancelEdit();

    if (count === 0) {
      // Usuń bezpośrednio jeśli kategoria jest pusta
      this.executeDelete(cat);
    } else {
      // Wymaga wyboru nowej kategorii dla dań
      this.deletingCategory.set(cat);
      const alternatives = this.categories().filter(c => c !== cat);
      this.targetReassignCategory.set(alternatives.length > 0 ? alternatives[0] : 'Inne');
    }
  }

  cancelDelete(): void {
    this.deletingCategory.set(null);
    this.targetReassignCategory.set('');
  }

  async confirmDeleteWithReassign(cat: string): Promise<void> {
    const target = this.targetReassignCategory() || 'Inne';
    this.isSubmitting.set(true);
    try {
      await this.recipeService.deleteCategory(cat, target);
      this.cancelDelete();
      this.showFeedback(`Kategoria "${cat}" usunięta. Dania przeniesiono do "${target}".`);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async executeDelete(cat: string): Promise<void> {
    this.isSubmitting.set(true);
    try {
      await this.recipeService.deleteCategory(cat);
      this.showFeedback(`Kategoria "${cat}" została usunięta.`);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private showFeedback(msg: string): void {
    this.successFeedback.set(msg);
    setTimeout(() => {
      if (this.successFeedback() === msg) {
        this.successFeedback.set(null);
      }
    }, 4000);
  }
}
