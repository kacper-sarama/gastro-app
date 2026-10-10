import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { AuthService } from './auth.service';
import { OrderService } from './order.service';
import { InventoryService } from './inventory.service';
import { ToastService } from './toast.service';
import { Order } from '../models/order.model';

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
  private toastService = inject(ToastService);

  // Poprzednie znane identyfikatory zamówień (do wykrywania nowo wpadających na żywo)
  private knownPendingOrderIds = new Set<string>();
  private knownReadyOrderIds = new Set<string>();
  private isInitialized = false;

  // Dźwięk Web Audio API
  private audioCtx: AudioContext | null = null;

  constructor() {
    // Reaktywne śledzenie zmian zamówień na żywo
    effect(() => {
      const orders = this.orderService.orders();
      const currentRole = this.authService.currentUserRole();
      this.handleLiveOrderTransitions(orders, currentRole);
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
      // Dla kelnera: liczba zamówień gotowych do odebrania z wydawki (ready)
      return orders.filter(o => o.status === 'ready').length;
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
      return count === 1 ? '1 danie czeka gotowe do wydania' : `${count} dania czekają gotowe do wydania`;
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
   * Monitoruje przejścia stanów na żywo i wywołuje Toasty oraz powiadomienie dźwiękowe
   */
  private handleLiveOrderTransitions(orders: Order[], currentRole: string): void {
    const currentPendingIds = new Set(orders.filter(o => o.status === 'pending').map(o => o.id));
    const currentReadyIds = new Set(orders.filter(o => o.status === 'ready').map(o => o.id));

    // Pierwszy przebieg służy tylko do zmapowania istniejących zamówień, nie alarmujemy o przeszłości
    if (!this.isInitialized) {
      this.knownPendingOrderIds = currentPendingIds;
      this.knownReadyOrderIds = currentReadyIds;
      this.isInitialized = true;
      return;
    }

    // 1. Sprawdź nowe zamówienia oczekujące (dla kucharza)
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

    // 2. Sprawdź dania świeżo wydane na wydawkę (dla kelnera)
    for (const ord of orders) {
      if (ord.status === 'ready' && !this.knownReadyOrderIds.has(ord.id)) {
        if (currentRole === 'waiter') {
          this.toastService.success(
            `Bon #${ord.orderNumber} (${ord.tableNumber}) czeka na odbiór!`,
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
        // Alert menedżera
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.15);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      }
    } catch {
      // Przeglądarka może blokować audio przed pierwszą interakcją użytkownika - ignorujemy bezpiecznie
    }
  }
}
