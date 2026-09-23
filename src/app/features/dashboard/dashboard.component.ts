import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { InventoryService } from '../../core/services/inventory.service';
import { RecipeService } from '../../core/services/recipe.service';
import { formatStockAmount, getStockStatus } from '../../core/models/inventory-item.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent {
  readonly authService = inject(AuthService);
  readonly inventoryService = inject(InventoryService);
  readonly recipeService = inject(RecipeService);

  formatAmount(amount: number, unit: any) {
    return formatStockAmount(amount, unit);
  }
}
