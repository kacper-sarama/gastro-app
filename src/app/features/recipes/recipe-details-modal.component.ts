import { Component, EventEmitter, Input, Output, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Recipe, RecipeCapacityResult } from '../../core/models/recipe.model';
import { InventoryService } from '../../core/services/inventory.service';
import { formatStockAmount } from '../../core/models/inventory-item.model';

export interface RecipeDetailsModalData {
  recipe: Recipe;
  capacity: RecipeCapacityResult;
}

@Component({
  selector: 'app-recipe-details-modal',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './recipe-details-modal.component.html'
})
export class RecipeDetailsModalComponent implements OnInit {
  readonly inventoryService = inject(InventoryService);
  private dialogRef = inject<MatDialogRef<RecipeDetailsModalComponent>>(MatDialogRef, { optional: true });
  private dialogData = inject<RecipeDetailsModalData>(MAT_DIALOG_DATA, { optional: true });

  @Input() recipe!: Recipe;
  @Input() capacity!: RecipeCapacityResult;

  @Output() close = new EventEmitter<void>();
  @Output() edit = new EventEmitter<Recipe>();

  ngOnInit(): void {
    if (this.dialogData?.recipe) {
      this.recipe = this.dialogData.recipe;
    }
    if (this.dialogData?.capacity) {
      this.capacity = this.dialogData.capacity;
    }
  }

  closeModal(): void {
    this.close.emit();
    this.dialogRef?.close();
  }

  handleEdit(): void {
    this.edit.emit(this.recipe);
    this.dialogRef?.close({ action: 'edit', recipe: this.recipe });
  }

  formatAmount(amount: number, unit: any) {
    return formatStockAmount(amount, unit);
  }
}
