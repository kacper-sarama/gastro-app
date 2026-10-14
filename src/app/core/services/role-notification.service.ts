import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { AuthService } from './auth.service';
import { OrderService } from './order.service';
import { InventoryService } from './inventory.service';
import { TableService } from './table.service';
import { RecipeService } from './recipe.service';
import { ToastService } from './toast.service';
import { Order } from '../models/order.model';
import { RestaurantTable } from '../models/table.model';
import { Recipe, RecipeCapacityResult } from '../models/recipe.model';

export interface RoleAlertItem {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  colorClass: string;
  route: string;
  timeAgo?: string;
}

@Injectable({
  providedIn: 'root'
})
export class RoleNotificationService {
  private authService = inject(AuthService);
  private orderService = inject(OrderService);
  private inventoryService = inject(InventoryService);
  private tableService = inject(TableService);
  private recipeService = inject(RecipeService);
  private toastService = inject(ToastService);

  // Śledzenie stanu zamówień (Kucharz / Kelner)
  private knownPendingOrderIds = new Set<string>();
  private knownReadyOrderIds = new Set<string>();
  private isOrdersInitialized = false;

  // Śledzenie stanu stolików (Kelner / Kasjer)
  private knownBillRequestedTableIds = new Set<string>();
  private isTablesInitialized = false;

  // Śledzenie dostępności dań / porcji (Kasjer / Menedżer)
  private knownLowPortionDishIds = new Set<string>();
  private knownSoldOutDishIds = new Set<string>();
  private isRecipesInitialized = false;

  // Śledzenie osiągnięcia celu dziennego (Właściciel)
  private hasNotifiedDailyTargetToday = false;
  private isRevenueInitialized = false;

  // Dźwięk Web Audio API
  private audioCtx: AudioContext | null = null;

  constructor() {
    // 1. Reaktywne śledzenie zmian zamówień na żywo
    effect(() => {
      const orders = this.orderService.orders();
      const currentRole = this.authService.currentUserRole();
      this.handleLiveOrderTransitions(orders, currentRole);
    });

    // 2. Reaktywne śledzenie zmian stolików na żywo (prośby o rachunek)
    effect(() => {
      const tables = this.tableService.tables();
      const currentRole = this.authService.currentUserRole();
      this.handleLiveTableTransitions(tables, currentRole);
    });

    // 3. Reaktywne śledzenie porcji potraw w kuchni (końcówka porcji i wyprzedane dania)
    effect(() => {
      const recipes = this.recipeService.recipes();
      const capacities = this.recipeService.capacitiesMap();
      const currentRole = this.authService.currentUserRole();
      this.handleLiveDishPortionsTransitions(recipes, capacities, currentRole);
    });

    // 4. Reaktywne śledzenie celu obrotu dziennego
    effect(() => {
      const revenue = this.orderService.todaysRevenue();
      const target = this.orderService.dailyRevenueTarget();
      const currentRole = this.authService.currentUserRole();
      this.handleLiveDailyTargetTransition(revenue, target, currentRole);
    });
  }

  /**
   * Liczba aktywnych spraw oczekujących na reakcję w zależności od aktualnej roli
   */
  readonly unreadCount = computed<number>(() => {
    const role = this.authService.currentUserRole();
    const orders = this.orderService.orders();

    if (role === 'kitchen') {
      // Dla kucharza: liczba zamówień oczekujących w kolejce (pending)
      return orders.filter(o => o.status === 'pending').length;
    }

    if (role === 'waiter') {
      // Dla kelnera/kasjera: dania na wydawce (ready) + stoliki proszące o rachunek
      const readyCount = orders.filter(o => o.status === 'ready').length;
      const billCount = this.tableService.tables().filter(t => t.status === 'bill_requested').length;
      return readyCount + billCount;
    }

    if (role === 'owner' || role === 'manager') {
      // Dla właściciela / menedżera: braki magazynowe (stan 0) + zamówienia opóźnione (>30 min)
      const outOfStockCount = this.inventoryService.outOfStockItems().length;
      const now = Date.now();
      const delayedOrders = orders.filter(o => {
        if (o.status !== 'pending' && o.status !== 'in_progress') return false;
        const diffMinutes = (now - new Date(o.createdAt).getTime()) / 60000;
        return diffMinutes >= 30;
      }).length;
      return outOfStockCount + delayedOrders;
    }

    return 0;
  });

  /**
   * Etykieta tooltipu opisująca zawartość powiadomień
   */
  readonly tooltipLabel = computed<string>(() => {
    const count = this.unreadCount();
    const role = this.authService.currentUserRole();

    if (count === 0) return 'Brak oczekujących powiadomień';

    if (role === 'kitchen') {
      return count === 1 ? '1 zamówienie czeka w kolejce' : `${count} zamówienia czekają w kolejce`;
    }
    if (role === 'waiter') {
      return count === 1 ? '1 sprawa wymaga obsługi (wydawka / rachunek)' : `${count} sprawy na sali wymagają obsługi`;
    }
    if (role === 'owner' || role === 'manager') {
      return count === 1 ? '1 sprawa operacyjna wymaga uwagi' : `${count} spraw operacyjnych wymaga uwagi`;
    }
    return `${count} powiadomień`;
  });

  /**
   * Aktywne elementy do podglądu w dropdownie dzwoneczka
   */
  readonly activeAlertItems = computed<RoleAlertItem[]>(() => {
    const role = this.authService.currentUserRole();
    const orders = this.orderService.orders();
    const list: RoleAlertItem[] = [];

    if (role === 'kitchen') {
      const pending = orders.filter(o => o.status === 'pending');
      for (const ord of pending) {
        list.push({
          id: ord.id,
          title: `Nowy bon #${ord.orderNumber} (${ord.tableNumber})`,
          subtitle: ord.notes ? `Uwagi: „${ord.notes}”` : `${ord.items.length} pozycji do przygotowania`,
          icon: 'outdoor_grill',
          colorClass: 'text-amber-500 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/40',
          route: '/orders',
          timeAgo: this.orderService.getElapsedTime(ord.createdAt)
        });
      }
    } else if (role === 'waiter') {
      // 1. Dania gotowe na wydawce
      const ready = orders.filter(o => o.status === 'ready');
      for (const ord of ready) {
        list.push({
          id: ord.id,
          title: `Danie gotowe: ${ord.tableNumber}`,
          subtitle: `Bon #${ord.orderNumber} czeka na odbiór z wydawki`,
          icon: 'room_service',
          colorClass: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/40',
          route: '/tables',
          timeAgo: this.orderService.getElapsedTime(ord.createdAt)
        });
      }

      // 2. Stoliki proszące o rachunek
      const bills = this.tableService.tables().filter(t => t.status === 'bill_requested');
      for (const tbl of bills) {
        list.push({
          id: `bill-${tbl.id}`,
          title: `Prośba o rachunek: ${tbl.number}`,
          subtitle: `Goście przy stoliku oczekują na płatność`,
          icon: 'receipt_long',
          colorClass: 'text-amber-500 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/40',
          route: '/tables'
        });
      }
    } else if (role === 'owner' || role === 'manager') {
      // 1. Braki w magazynie
      const outOfStock = this.inventoryService.outOfStockItems();
      for (const item of outOfStock) {
        list.push({
          id: `inv-${item.id}`,
          title: `Brak surowca: ${item.name}`,
          subtitle: `Stan wynosi 0 ${item.unit} (wymagane uzupełnienie)`,
          icon: 'inventory_2',
          colorClass: 'text-rose-500 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/40',
          route: '/inventory'
        });
      }

      // 2. Opóźnienia
      const now = Date.now();
      const delayed = orders.filter(o => {
        if (o.status !== 'pending' && o.status !== 'in_progress') return false;
        const diffMinutes = (now - new Date(o.createdAt).getTime()) / 60000;
        return diffMinutes >= 30;
      });
      for (const ord of delayed) {
        list.push({
          id: `delay-${ord.id}`,
          title: `Opóźnienie #${ord.orderNumber} (${ord.tableNumber})`,
          subtitle: `Czas realizacji przekroczył 30 minut!`,
          icon: 'timer',
          colorClass: 'text-amber-500 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/40',
          route: '/orders',
          timeAgo: this.orderService.getElapsedTime(ord.createdAt)
        });
      }
    }

    return list;
  });

  /**
   * Monitoruje zamówienia na żywo:
   * - Kucharz: Nowy bon w kolejce (Toast info)
   * - Kasjer: Gotowe danie na wydawce (Toast success)
   */
  private handleLiveOrderTransitions(orders: Order[], currentRole: string): void {
    const currentPendingIds = new Set(orders.filter(o => o.status === 'pending').map(o => o.id));
    const currentReadyIds = new Set(orders.filter(o => o.status === 'ready').map(o => o.id));

    if (!this.isOrdersInitialized) {
      this.knownPendingOrderIds = currentPendingIds;
      this.knownReadyOrderIds = currentReadyIds;
      this.isOrdersInitialized = true;
      return;
    }

    // 1. Nowy bon w kolejce (Kucharz)
    for (const ord of orders) {
      if (ord.status === 'pending' && !this.knownPendingOrderIds.has(ord.id)) {
        if (currentRole === 'kitchen') {
          const notesText = ord.notes ? ` (Uwagi: „${ord.notes}”)` : '';
          this.toastService.info(
            `Bon #${ord.orderNumber} dla ${ord.tableNumber}${notesText}`,
            '🔔 Nowe zamówienie w kolejce'
          );
          this.playChime('kitchen');
        }
      }
    }

    // 2. Gotowe danie na wydawce (Kasjer / Kelner)
    for (const ord of orders) {
      if (ord.status === 'ready' && !this.knownReadyOrderIds.has(ord.id)) {
        if (currentRole === 'waiter') {
          this.toastService.success(
            `Bon #${ord.orderNumber} (${ord.tableNumber}) czeka na odbiór z wydawki!`,
            '🍽️ Danie gotowe do wydania'
          );
          this.playChime('waiter');
        }
      }
    }

    this.knownPendingOrderIds = currentPendingIds;
    this.knownReadyOrderIds = currentReadyIds;
  }

  /**
   * Monitoruje statusy stolików na żywo:
   * - Kasjer / Kelner: Gość prosi o rachunek (Toast info)
   */
  private handleLiveTableTransitions(tables: RestaurantTable[], currentRole: string): void {
    const currentBillRequestedIds = new Set(tables.filter(t => t.status === 'bill_requested').map(t => t.id));

    if (!this.isTablesInitialized) {
      this.knownBillRequestedTableIds = currentBillRequestedIds;
      this.isTablesInitialized = true;
      return;
    }

    // Sprawdź nowo zgłoszone prośby o rachunek
    for (const tbl of tables) {
      if (tbl.status === 'bill_requested' && !this.knownBillRequestedTableIds.has(tbl.id)) {
        if (currentRole === 'waiter') {
          this.toastService.info(
            `Stolik ${tbl.number} prosi o rachunek.`,
            '🧾 Prośba o rachunek'
          );
          this.playChime('waiter');
        }
      }
    }

    this.knownBillRequestedTableIds = currentBillRequestedIds;
  }

  /**
   * Monitoruje dostępność porcji potraw na kuchni:
   * - Kasjer & Menedżer: Końcówka porcji w kuchni (zostały tylko 3 porcje) (Toast warning)
   * - Kasjer & Menedżer: Danie wyprzedane (0 porcji / brak możliwości zamówienia) (Toast danger)
   */
  private handleLiveDishPortionsTransitions(
    recipes: Recipe[],
    capacities: Map<string, RecipeCapacityResult>,
    currentRole: string
  ): void {
    if (recipes.length === 0) return;

    if (!this.isRecipesInitialized) {
      // Pierwszy przebieg: mapujemy aktualny stan, aby nie wywołać spamu alertów przy logowaniu
      for (const recipe of recipes) {
        const cap = capacities.get(recipe.id);
        if (!cap) continue;

        if (cap.maxPortions === 3) {
          this.knownLowPortionDishIds.add(recipe.id);
        }
        if (cap.maxPortions === 0 || recipe.isAvailable === false || cap.status === 'blocked') {
          this.knownSoldOutDishIds.add(recipe.id);
        }
      }
      this.isRecipesInitialized = true;
      return;
    }

    for (const recipe of recipes) {
      const cap = capacities.get(recipe.id);
      if (!cap) continue;

      const portions = cap.maxPortions;
      const isSoldOut = portions === 0 || recipe.isAvailable === false || cap.status === 'blocked';

      // 1. Końcówka porcji w kuchni (gdy jakiejś potrawy pozostały już tylko 3 dostępne)
      if (portions === 3 && !this.knownLowPortionDishIds.has(recipe.id) && !isSoldOut) {
        if (currentRole === 'waiter' || currentRole === 'manager') {
          const hint = currentRole === 'waiter'
            ? 'Uprzedź gości przed przyjęciem zamówienia.'
            : 'Wymagane zaplanowanie dostawy lub uzupełnienie prep-listy.';

          this.toastService.warning(
            `Pozostały już tylko 3 porcje: "${recipe.name}". ${hint}`,
            '⚠️ Końcówka porcji'
          );
        }
        this.knownLowPortionDishIds.add(recipe.id);
      } else if (portions !== 3) {
        // Jeśli stan się zmienił (np. przyjęto dostawę lub danie zeszło do zera), usuwamy ze zbioru
        this.knownLowPortionDishIds.delete(recipe.id);
      }

      // 2. Danie wyprzedane (gdy już kompletnie nie można zamówić jakiejś potrawy)
      if (isSoldOut && !this.knownSoldOutDishIds.has(recipe.id)) {
        if (currentRole === 'waiter' || currentRole === 'manager') {
          this.toastService.danger(
            `Danie "${recipe.name}" zostało wyprzedane – brak możliwości zamówienia.`,
            '🚫 Danie wyprzedane'
          );
        }
        this.knownSoldOutDishIds.add(recipe.id);
      } else if (!isSoldOut) {
        // Danie powróciło na stan magazynowy
        this.knownSoldOutDishIds.delete(recipe.id);
      }
    }
  }

  /**
   * Monitoruje realizację dziennego obrotu lokalu:
   * - Właściciel: Osiągnięcie celu dziennego (Toast success)
   */
  private handleLiveDailyTargetTransition(revenue: number, target: number, currentRole: string): void {
    if (target <= 0) return;

    if (!this.isRevenueInitialized) {
      if (revenue >= target && revenue > 0) {
        this.hasNotifiedDailyTargetToday = true;
      }
      this.isRevenueInitialized = true;
      return;
    }

    if (revenue >= target && revenue > 0 && !this.hasNotifiedDailyTargetToday) {
      this.hasNotifiedDailyTargetToday = true;
      if (currentRole === 'owner') {
        this.toastService.success(
          `Gratulacje! Lokal osiągnął dzienny cel obrotu (${Math.round(revenue)} zł z planowanych ${target} zł).`,
          '🎯 Cel dzienny osiągnięty'
        );
        this.playChime('owner');
      }
    }
  }

  /**
   * Subtelny syntetyzowany dźwięk dzwonka (Web Audio API - działa natychmiast bez zewnętrznych plików)
   */
  playChime(type: 'kitchen' | 'waiter' | 'owner'): void {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;

      if (!this.audioCtx) {
        this.audioCtx = new AudioCtxClass();
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const ctx = this.audioCtx;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'kitchen') {
        // Dwutonowy dzwonek kuchenny (ding-dong): 587.33 Hz (D5) -> 880 Hz (A5)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      } else if (type === 'waiter') {
        // Dzwonek kelnerski wydawki (delikatny metaliczny chime): 880 Hz -> 1174.66 Hz
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.1);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
        osc.start(now);
        osc.stop(now + 0.38);
      } else {
        // Fanfara sukcesu dla właściciela: 440 Hz -> 659.25 Hz -> 880 Hz
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.2);
        gain.gain.setValueAtTime(0.16, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      }
    } catch {
      // Bezpieczne wyciszenie jeśli przeglądarka blokuje audio przed pierwszą interakcją
    }
  }
}
