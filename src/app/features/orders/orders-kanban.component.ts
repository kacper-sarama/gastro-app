import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrderService } from '../../core/services/order.service';
import { AuthService } from '../../core/services/auth.service';
import { Order, OrderStatus } from '../../core/models/order.model';
import { NewOrderModalComponent } from './new-order-modal.component';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';

@Component({
  selector: 'app-orders-kanban',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatTooltipModule],
  templateUrl: './orders-kanban.component.html'
})
export class OrdersKanbanComponent {
  readonly orderService = inject(OrderService);
  readonly authService = inject(AuthService);
  private dialog = inject(MatDialog);
  private confirmDialogService = inject(ConfirmDialogService);

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
    this.dialog.open(NewOrderModalComponent, {
      panelClass: 'gastro-dialog-panel'
    });
  }

  closeNewOrderModal(): void {
    this.isNewOrderModalOpen.set(false);
  }

  /**
   * Przesuwa zamówienie o jeden krok w przód na tablicy Kanban:
   * pending -> in_progress -> ready -> completed (zdejmuje składniki z magazynu!)
   */
  async advanceStatus(order: Order): Promise<void> {
    // Kucharz nie ma uprawnień do wydania potrawy (status 'ready' -> 'completed')
    if (order.status === 'ready' && this.authService.currentUserRole() === 'kitchen') {
      return;
    }

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
    const confirmed = await this.confirmDialogService.confirm({
      title: 'Anulować zamówienie?',
      message: `Czy na pewno chcesz anulować zamówienie #${order.orderNumber} (${order.tableNumber})?`,
      confirmText: 'Anuluj zamówienie',
      isDestructive: true
    });

    if (confirmed) {
      await this.orderService.updateOrderStatus(order.id, 'cancelled');
    }
  }

  /**
   * Całkowite usunięcie z archiwum
   */
  async deleteOrder(order: Order): Promise<void> {
    const confirmed = await this.confirmDialogService.confirm({
      title: 'Usunąć zamówienie?',
      message: `Czy na pewno chcesz trwale usunąć zamówienie #${order.orderNumber} z archiwum?`,
      confirmText: 'Usuń trwale',
      isDestructive: true
    });

    if (confirmed) {
      await this.orderService.deleteOrder(order.id);
    }
  }

  /**
   * Wyświetla czytelny czas oczekiwania (np. "3 min temu", "15 min temu").
   * Korzysta z reaktywnego zegara w OrderService (odświeżanie na żywo).
   */
  getElapsedTime(createdAt: string): string {
    return this.orderService.getElapsedTime(createdAt);
  }
}
