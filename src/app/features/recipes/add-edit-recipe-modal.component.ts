import { Component, EventEmitter, Input, Output, OnInit, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule, Validators } from '@angular/forms';
import { Recipe, RecipeIngredient, calculateRecipeCapacity } from '../../core/models/recipe.model';
import { InventoryService } from '../../core/services/inventory.service';
import { InventoryItem, InventoryUnit } from '../../core/models/inventory-item.model';

@Component({
  selector: 'app-add-edit-recipe-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './add-edit-recipe-modal.component.html'
})
export class AddEditRecipeModalComponent implements OnInit {
  private fb = inject(FormBuilder);
  readonly inventoryService = inject(InventoryService);

  @Input() recipeToEdit?: Recipe;
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<Omit<Recipe, 'id' | 'restaurantId' | 'updatedAt'>>();

  form!: FormGroup;

  get isEditMode(): boolean {
    return !!this.recipeToEdit;
  }

  get ingredientsArray(): FormArray {
    return this.form.get('ingredients') as FormArray;
  }

  ngOnInit(): void {
    const edit = this.recipeToEdit;

    this.form = this.fb.group({
      name: [edit?.name || '', [Validators.required, Validators.minLength(2)]],
      category: [edit?.category || 'Pizza', [Validators.required]],
      description: [edit?.description || ''],
      sellingPrice: [edit?.sellingPrice || null, [Validators.min(0)]],
      ingredients: this.fb.array([])
    });

    if (edit && edit.ingredients && edit.ingredients.length > 0) {
      for (const ing of edit.ingredients) {
        this.addIngredient(ing.inventoryItemId, ing.amount);
      }
    } else {
      // Domyślnie dodaj 2 puste wiersze składników
      const items = this.inventoryService.items();
      const firstId = items.length > 0 ? items[0].id : '';
      const secondId = items.length > 1 ? items[1].id : firstId;
      this.addIngredient(firstId, 100);
      if (secondId !== firstId) {
        this.addIngredient(secondId, 100);
      }
    }
  }

  addIngredient(itemId = '', baseAmount = 100): void {
    let mult = '1';
    let displayAmount = baseAmount;

    const item = this.getInventoryItem(itemId);
    if (item && (item.unit === 'g' || item.unit === 'ml') && baseAmount >= 1000 && baseAmount % 100 === 0) {
      mult = '1000';
      displayAmount = baseAmount / 1000;
    }

    const group = this.fb.group({
      inventoryItemId: [itemId, [Validators.required]],
      displayAmount: [displayAmount, [Validators.required, Validators.min(0.001)]],
      displayMultiplier: [mult]
    });

    this.ingredientsArray.push(group);
  }

  removeIngredient(index: number): void {
    if (this.ingredientsArray.length > 1) {
      this.ingredientsArray.removeAt(index);
    }
  }

  getInventoryItem(id: string): InventoryItem | undefined {
    return this.inventoryService.items().find(i => i.id === id);
  }

  getItemUnit(itemId: string): InventoryUnit {
    const item = this.getInventoryItem(itemId);
    return item ? item.unit : 'g';
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const val = this.form.value;
    const ingredients: RecipeIngredient[] = val.ingredients
      .filter((row: any) => !!row.inventoryItemId && Number(row.displayAmount) > 0)
      .map((row: any) => {
        const mult = Number(row.displayMultiplier) || 1;
        const baseAmount = Math.round(Number(row.displayAmount) * mult * 100) / 100;
        return {
          inventoryItemId: row.inventoryItemId,
          amount: baseAmount
        };
      });

    if (ingredients.length === 0) {
      alert('Receptura musi zawierać co najmniej jeden prawidłowy składnik.');
      return;
    }

    this.save.emit({
      name: val.name.trim(),
      category: val.category.trim(),
      description: val.description ? val.description.trim() : undefined,
      sellingPrice: val.sellingPrice ? Number(val.sellingPrice) : undefined,
      ingredients
    });
  }
}
