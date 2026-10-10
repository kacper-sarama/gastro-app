import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { InventoryService } from '../../core/services/inventory.service';
import { RecipeService } from '../../core/services/recipe.service';
import { OrderService } from '../../core/services/order.service';
import { PromotionService } from '../../core/services/promotion.service';
import { TableService } from '../../core/services/table.service';
import { StatCardComponent } from '../../shared/components/stat-card/stat-card.component';
import { OrdersStatsBarComponent } from '../orders/orders-stats-bar.component';
import { formatStockAmount } from '../../core/models/inventory-item.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, StatCardComponent, OrdersStatsBarComponent],
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent {
  readonly authService = inject(AuthService);
  readonly inventoryService = inject(InventoryService);
  readonly recipeService = inject(RecipeService);
  readonly orderService = inject(OrderService);
  readonly promotionService = inject(PromotionService);
  readonly tableService = inject(TableService);
  private readonly router = inject(Router);

  // --- FINANSE & OPERACJE (EXECUTIVE SUMMARY) ---
  readonly averageOrderValue = computed(() => {
    const count = this.orderService.completedOrdersCount();
    return count > 0 ? (this.orderService.todaysRevenue() / count) : 0;
  });

  readonly totalOpenTabsValue = computed(() => {
    return this.tableService.tablesWithLiveStatus()
      .filter(t => t.status === 'occupied' || t.status === 'bill_requested')
      .reduce((sum, t) => sum + (t.currentOrderTotal || 0), 0);
  });

  readonly potentialTotalRevenue = computed(() => {
    return this.orderService.todaysRevenue() + this.totalOpenTabsValue();
  });

  readonly occupancyRate = computed(() => {
    const total = this.tableService.totalTablesCount();
    if (total === 0) return 0;
    const occupied = this.tableService.occupiedTablesCount() + this.tableService.billRequestedCount();
    return Math.round((occupied / total) * 100);
  });

  readonly seatedGuestsEstimate = computed(() => {
    return this.tableService.tablesWithLiveStatus()
      .filter(t => t.status === 'occupied' || t.status === 'bill_requested')
      .reduce((sum, t) => sum + (t.seats || 2), 0);
  });

  // --- STREFY SALI (ROZKŁAD OBŁOŻENIA) ---
  readonly zoneOccupancy = computed(() => {
    const tables = this.tableService.tablesWithLiveStatus();
    const zones = this.tableService.availableZones();
    return zones.map(zoneName => {
      const zoneTables = tables.filter(t => t.zone === zoneName);
      const total = zoneTables.length;
      const occupied = zoneTables.filter(t => t.status === 'occupied' || t.status === 'bill_requested').length;
      const percentage = total > 0 ? Math.round((occupied / total) * 100) : 0;
      return {
        name: zoneName,
        total,
        occupied,
        free: total - occupied,
        percentage
      };
    });
  });

  // --- BESTSELLERY DNIA (TOP DAŃ) ---
  readonly topSellingDishes = computed(() => {
    const map = new Map<string, { recipeName: string; quantity: number; revenue: number; category?: string }>();
    const validOrders = this.orderService.orders().filter(o => o.status !== 'cancelled');

    for (const order of validOrders) {
      for (const item of order.items) {
        const existing = map.get(item.recipeName) || {
          recipeName: item.recipeName,
          quantity: 0,
          revenue: 0,
          category: item.category
        };
        existing.quantity += item.quantity;
        existing.revenue += item.quantity * item.unitPrice;
        map.set(item.recipeName, existing);
      }
    }

    const sorted = Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
    const top5 = sorted.slice(0, 5);
    const totalSoldItems = sorted.reduce((sum, i) => sum + i.quantity, 0);

    return top5.map(dish => ({
      ...dish,
      share: totalSoldItems > 0 ? Math.round((dish.quantity / totalSoldItems) * 100) : 0
    }));
  });

  readonly totalSoldItemsToday = computed(() => {
    return this.orderService.orders()
      .filter(o => o.status !== 'cancelled')
      .reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0);
  });

  // --- KOLEJKA KUCHENNA KDS ---
  readonly allActiveOrders = computed(() => 
    this.orderService.orders()
      .filter(o => o.status !== 'completed' && o.status !== 'cancelled')
  );

  readonly displayedActiveOrders = computed(() => {
    const all = this.allActiveOrders();
    return all.length > 6 ? all.slice(0, 5) : all;
  });

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

  navigate(path: string): void {
    this.router.navigateByUrl(path);
  }
}
