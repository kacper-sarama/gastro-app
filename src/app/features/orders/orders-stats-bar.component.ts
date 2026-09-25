import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrderService } from '../../core/services/order.service';

export interface CategoryStat {
  category: string;
  count: number;
  percentage: number;
  color: string;
}

export interface HourlySlotStat {
  label: string;
  count: number;
  x: number;
  y: number;
}

export interface DishLeaderStat {
  rank: number;
  name: string;
  count: number;
  percentage: number;
  revenue: number;
}

@Component({
  selector: 'app-orders-stats-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './orders-stats-bar.component.html'
})
export class OrdersStatsBarComponent {
  readonly orderService = inject(OrderService);

  // Dzienny cel obrotu restauracji w PLN (możliwy do podbicia przez managera)
  dailyRevenueTarget = signal<number>(3000);

  // Możliwość zwinięcia paska wykresów (np. w godzinach szczytu kuchni)
  isCollapsed = signal<boolean>(false);

  // Paleta kolorów dla kategorii dań
  private readonly categoryColors: Record<string, string> = {
    'Pizza Rossa (na czerwono)': '#f97316',      // orange-500
    'Pizza Bianca (na biało)': '#38bdf8',        // sky-400
    'Calzone (pizza zawijana)': '#eab308',       // amber-500
    'Focaccia (włoskie pieczywo)': '#10b981',    // emerald-500
    'Pizza': '#f97316',      // orange-500
    'Makarony': '#0ea5e9',   // sky-500
    'Przystawki': '#eab308', // amber-500
    'Desery': '#ec4899',     // pink-500
    'Napoje': '#10b981',     // emerald-500
    'Inne': '#8b5cf6'        // violet-500
  };

  toggleCollapse(): void {
    this.isCollapsed.update(v => !v);
  }

  // ========================================================
  // 1. WYKRES SŁUPKOWY: Wolumen wydanych dań wg kategorii
  // ========================================================
  readonly categoryStats = computed<CategoryStat[]>(() => {
    const orders = this.orderService.orders().filter(o => o.status === 'completed');
    const countsMap = new Map<string, number>();

    // Zlicz ilości wydanych dań w kategoriach
    for (const order of orders) {
      for (const item of order.items) {
        const cat = item.category?.trim() || 'Pizza Rossa (na czerwono)';
        countsMap.set(cat, (countsMap.get(cat) || 0) + item.quantity);
      }
    }

    // Jeśli brak danych wydanych, przygotuj domyślne kategorie
    if (countsMap.size === 0) {
      countsMap.set('Pizza Rossa (na czerwono)', 0);
      countsMap.set('Pizza Bianca (na biało)', 0);
      countsMap.set('Calzone (pizza zawijana)', 0);
      countsMap.set('Focaccia (włoskie pieczywo)', 0);
    }

    const maxCount = Math.max(...Array.from(countsMap.values()), 1);

    return Array.from(countsMap.entries()).map(([category, count]) => ({
      category,
      count,
      percentage: Math.round((count / maxCount) * 100),
      color: this.categoryColors[category] || '#f97316'
    })).slice(0, 4); // Top 4 kategorie na słupkach
  });

  readonly totalCompletedDishesCount = computed<number>(() => {
    return this.categoryStats().reduce((sum, c) => sum + c.count, 0);
  });

  // ========================================================
  // 2. WYKRES PIERŚCIENIOWY: Realizacja celu obrotu i średni rachunek
  // ========================================================
  readonly revenueTargetPercent = computed<number>(() => {
    const rev = this.orderService.todaysRevenue();
    const target = this.dailyRevenueTarget();
    if (target <= 0) return 0;
    return Math.min(100, Math.round((rev / target) * 100));
  });

  // Obliczenia dla obwodu okręgu SVG (r = 34, 2 * PI * 34 ≈ 213.63)
  readonly circleCircumference = 213.63;

  readonly circleDashOffset = computed<number>(() => {
    const percent = this.revenueTargetPercent();
    return this.circleCircumference - (this.circleCircumference * percent) / 100;
  });

  readonly averageOrderValue = computed<number>(() => {
    const count = this.orderService.completedOrdersCount();
    const rev = this.orderService.todaysRevenue();
    if (count <= 0) return 0;
    return Math.round((rev / count) * 10) / 10;
  });

  // ========================================================
  // 3. WYKRES LINIOWY: Szczyty zamówień w ciągu dnia (Timeline)
  // Ostatnie 5 godzin wstecz + bieżąca godzina (np. 18:00, 19:00, 20:00, 21:00, 22:00, 23:00)
  // ========================================================
  readonly hourlyStats = computed(() => {
    const orders = this.orderService.orders();
    const nowTime = this.orderService.currentTime();
    const now = new Date(nowTime);
    const currentHour = now.getHours();

    // 6 punktów: ostatnie 5 godzin wstecz aż do bieżącej godziny
    // np. dla 13:00 -> 8:00, 9:00, 10:00, 11:00, 12:00, 13:00
    // np. dla 23:00 -> 18:00, 19:00, 20:00, 21:00, 22:00, 23:00
    const slots: { label: string; hour: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const h = (currentHour - i + 24) % 24;
      slots.push({
        label: `${h}:00`,
        hour: h
      });
    }

    const slotCounts = slots.map(slot => {
      const count = orders.filter(o => {
        const orderDate = new Date(o.createdAt);
        // Uwzględniamy zamówienia z ostatnich 12 godzin (bieżące okno)
        const diffHours = (nowTime - orderDate.getTime()) / (1000 * 60 * 60);
        if (diffHours < 0 || diffHours > 12) return false;

        return orderDate.getHours() === slot.hour;
      }).length;
      return { label: slot.label, count };
    });

    const maxCount = Math.max(...slotCounts.map(s => s.count), 4);
    const svgWidth = 220;
    const svgHeight = 55;
    const padding = 12;

    const points: HourlySlotStat[] = slotCounts.map((slot, index) => {
      const x = padding + (index / (slots.length - 1)) * (svgWidth - 2 * padding);
      const y = (svgHeight - padding) - (slot.count / maxCount) * (svgHeight - 2 * padding);
      return {
        label: slot.label,
        count: slot.count,
        x: Math.round(x),
        y: Math.round(y)
      };
    });

    // Ścieżka SVG linii
    const linePath = points.reduce((acc, pt, i) => 
      i === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`, ''
    );

    // Ścieżka zamknięta do gradientu tła
    const first = points[0];
    const last = points[points.length - 1];
    const areaPath = `${linePath} L ${last.x},${svgHeight} L ${first.x},${svgHeight} Z`;

    // Znajdź szczytową godzinę
    let peakSlot = slotCounts[0];
    for (const s of slotCounts) {
      if (s.count > peakSlot.count) peakSlot = s;
    }

    return {
      points,
      linePath,
      areaPath,
      peakLabel: peakSlot.count > 0 ? `${peakSlot.label} (${peakSlot.count} zam.)` : 'Brak szczytu'
    };
  });

  // ========================================================
  // 4. WYKRES RANKINGOWY: Top 3 Hity Sprzedaży Dnia
  // ========================================================
  readonly topDishesLeaderboard = computed<DishLeaderStat[]>(() => {
    const orders = this.orderService.orders();
    const dishesMap = new Map<string, { count: number; revenue: number }>();

    for (const order of orders) {
      for (const item of order.items) {
        const existing = dishesMap.get(item.recipeName) || { count: 0, revenue: 0 };
        dishesMap.set(item.recipeName, {
          count: existing.count + item.quantity,
          revenue: existing.revenue + (item.unitPrice * item.quantity)
        });
      }
    }

    const sorted = Array.from(dishesMap.entries())
      .map(([name, stat]) => ({ name, ...stat }))
      .sort((a, b) => b.count - a.count);

    const topItems = sorted.slice(0, 3);
    const maxQty = topItems[0]?.count || 1;

    return topItems.map((item, index) => ({
      rank: index + 1,
      name: item.name,
      count: item.count,
      revenue: item.revenue,
      percentage: Math.round((item.count / maxQty) * 100)
    }));
  });
}
