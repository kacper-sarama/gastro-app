import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Recipe, RecipeCapacityResult } from '../../core/models/recipe.model';
import { InventoryService } from '../../core/services/inventory.service';
import { formatStockAmount } from '../../core/models/inventory-item.model';

@Component({
  selector: 'app-recipe-details-modal',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './recipe-details-modal.component.html'
})
export class RecipeDetailsModalComponent {
  readonly inventoryService = inject(InventoryService);

  @Input({ required: true }) recipe!: Recipe;
  @Input({ required: true }) capacity!: RecipeCapacityResult;

  @Output() close = new EventEmitter<void>();
  @Output() edit = new EventEmitter<Recipe>();

  formatAmount(amount: number, unit: any) {
    return formatStockAmount(amount, unit);
  }
}
