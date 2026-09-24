import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { InventoryService } from '../../core/services/inventory.service';
import { RecipeService } from '../../core/services/recipe.service';
import { OrderService } from '../../core/services/order.service';
import { formatStockAmount } from '../../core/models/inventory-item.model';

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
  readonly orderService = inject(OrderService);

  // Wszystkie aktywne zamówienia w kolejce kuchennej
  readonly allActiveOrders = computed(() => 
    this.orderService.orders()
      .filter(o => o.status !== 'completed' && o.status !== 'cancelled')
  );

  // Kafelki do wyświetlenia na pulpicie:
  // Jeśli jest do 6 zamówień: pokazujemy wszystkie
  // Jeśli jest > 6: pokazujemy 5, a 6. miejsce zajmie interaktywny kafelek "+X więcej w KDS"
  readonly displayedActiveOrders = computed(() => {
    const all = this.allActiveOrders();
    return all.length > 6 ? all.slice(0, 5) : all;
  });

  // Liczba pozostałych zamówień ukrytych za kafelkiem KDS
  readonly remainingOrdersCount = computed(() => {
    const all = this.allActiveOrders();
    return all.length > 6 ? all.length - 5 : 0;
  });

  formatAmount(amount: number, unit: any) {
    return formatStockAmount(amount, unit);
  }

  getElapsedTime(createdAt: string): string {
    return this.orderService.getElapsedTime(createdAt);
  }
}
