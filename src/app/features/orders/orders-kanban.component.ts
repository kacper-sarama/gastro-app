import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrderService } from '../../core/services/order.service';
import { AuthService } from '../../core/services/auth.service';
import { Order, OrderStatus } from '../../core/models/order.model';
import { NewOrderModalComponent } from './new-order-modal.component';

@Component({
  selector: 'app-orders-kanban',
  standalone: true,
  imports: [CommonModule, NewOrderModalComponent],
  templateUrl: './orders-kanban.component.html'
})
export class OrdersKanbanComponent {
  readonly orderService = inject(OrderService);
  readonly authService = inject(AuthService);

  // Kontrola modala nowego zamówienia
  isNewOrderModalOpen = signal<boolean>(false);

  // Zakładka dla widoku mobilnego (na małych ekranach)
  activeMobileTab = signal<OrderStatus>('pending');

  // Zamówienia podzielone na 4 kolumny tablicy Kanban
  readonly pendingOrders = computed(() => 
    this.orderService.orders().filter(o => o.status === 'pending')
  );

  readonly inProgressOrders = computed(() => 
    this.orderService.orders().filter(o => o.status === 'in_progress')
  );

  readonly readyOrders = computed(() => 
    this.orderService.orders().filter(o => o.status === 'ready')
  );

  readonly completedOrders = computed(() => 
    this.orderService.orders().filter(o => o.status === 'completed')
  );

  openNewOrderModal(): void {
    this.isNewOrderModalOpen.set(true);
  }

  closeNewOrderModal(): void {
    this.isNewOrderModalOpen.set(false);
  }

  /**
   * Przesuwa zamówienie o jeden krok w przód na tablicy Kanban:
   * pending -> in_progress -> ready -> completed (zdejmuje składniki z magazynu!)
   */
  async advanceStatus(order: Order): Promise<void> {
    let nextStatus: OrderStatus | null = null;

    if (order.status === 'pending') {
      nextStatus = 'in_progress';
    } else if (order.status === 'in_progress') {
      nextStatus = 'ready';
    } else if (order.status === 'ready') {
      nextStatus = 'completed';
    }

    if (nextStatus) {
      await this.orderService.updateOrderStatus(order.id, nextStatus);
    }
  }

  /**
   * Cofa status zamówienia o krok w tył w razie pomyłki kelnera lub kuchni
   */
  async revertStatus(order: Order): Promise<void> {
    let prevStatus: OrderStatus | null = null;

    if (order.status === 'ready') {
      prevStatus = 'in_progress';
    } else if (order.status === 'in_progress') {
      prevStatus = 'pending';
    }

    if (prevStatus) {
      await this.orderService.updateOrderStatus(order.id, prevStatus);
    }
  }

  /**
   * Anuluje zamówienie (np. gdy gość zrezygnował)
   */
  async cancelOrder(order: Order): Promise<void> {
    if (confirm(`Czy na pewno chcesz anulować zamówienie #${order.orderNumber} (${order.tableNumber})?`)) {
      await this.orderService.updateOrderStatus(order.id, 'cancelled');
    }
  }

  /**
   * Całkowite usunięcie z archiwum
   */
  async deleteOrder(order: Order): Promise<void> {
    if (confirm(`Czy na pewno trwale usunąć zamówienie #${order.orderNumber}?`)) {
      await this.orderService.deleteOrder(order.id);
    }
  }

  /**
   * Wyświetla czytelny czas oczekiwania (np. "3 min temu", "15 min temu")
   */
  getElapsedTime(createdAt: string): string {
    const diffMs = Date.now() - new Date(createdAt).getTime();
    const mins = Math.floor(diffMs / 60000);
    
    if (mins < 1) return 'Przed chwilą';
    if (mins === 1) return '1 min temu';
    if (mins < 60) return `${mins} min temu`;
    
    const hours = Math.floor(mins / 60);
    if (hours === 1) return '1 godz. temu';
    return `${hours} godz. temu`;
  }
}
