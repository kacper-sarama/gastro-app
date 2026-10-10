import { Component, EventEmitter, Input, Output, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RestaurantTable } from '../../core/models/table.model';
import { TableService } from '../../core/services/table.service';
import { OrderService } from '../../core/services/order.service';
import { Order } from '../../core/models/order.model';

@Component({
  selector: 'app-table-details-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './table-details-modal.component.html'
})
export class TableDetailsModalComponent {
  readonly tableService = inject(TableService);
  readonly orderService = inject(OrderService);

  @Input({ required: true }) table!: RestaurantTable;
  @Output() close = new EventEmitter<void>();
  @Output() editTable = new EventEmitter<RestaurantTable>();
  @Output() openNewOrder = new EventEmitter<RestaurantTable>();

  isSettling = signal<boolean>(false);
  selectedPaymentMethod = signal<'Karta' | 'Gotówka' | 'BLIK'>('Karta');

  // Wszystkie aktywne zamówienia/bony w ramach tej wizyty (w kolejności chronologicznej)
  readonly activeOrders = computed<Order[]>(() => {
    if (!this.table) return [];
    return this.tableService.getActiveOrdersForTable(this.table);
  });

  // Łączna kwota całego rachunku (ze wszystkich bonów wizyty)
  readonly totalBill = computed<number>(() => {
    const orders = this.activeOrders();
    if (orders.length > 0) {
      return orders.reduce((sum, o) => sum + o.totalPrice, 0);
    }
    return this.table?.currentOrderTotal || 0;
  });

  // Łączna liczba pozycji ze wszystkich bonów
  readonly totalItemsCount = computed<number>(() => {
    const orders = this.activeOrders();
    if (orders.length > 0) {
      return orders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0);
    }
    return this.table?.currentOrderItemsCount || 0;
  });

  // Czas od rozpoczęcia wizyty (pierwszego bonu)
  readonly elapsedTime = computed<string>(() => {
    const orders = this.activeOrders();
    const startTime = this.table?.occupiedSince || (orders.length > 0 ? orders[0].createdAt : undefined);
    if (!startTime) return '';
    return this.orderService.getElapsedTime(startTime);
  });

  async onRequestBill(): Promise<void> {
    await this.tableService.requestBill(this.table.id);
  }

  async onFreeTable(): Promise<void> {
    await this.tableService.cleanAndFreeTable(this.table.id);
    this.close.emit();
  }

  async onSettle(paymentMethod: 'Karta' | 'Gotówka' | 'BLIK'): Promise<void> {
    this.isSettling.set(true);
    try {
      const orderIds = this.activeOrders().map(o => o.id);
      await this.tableService.settleTableOrder(this.table.id, orderIds, paymentMethod);
      this.close.emit();
    } finally {
      this.isSettling.set(false);
    }
  }

  async onCleanTable(): Promise<void> {
    await this.tableService.cleanAndFreeTable(this.table.id);
    this.close.emit();
  }

  handleOpenNewOrder(): void {
    this.openNewOrder.emit(this.table);
    this.close.emit();
  }

  handleEditTable(): void {
    this.editTable.emit(this.table);
    this.close.emit();
  }
}
