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

  // Powiązane aktywne zamówienie
  readonly activeOrder = computed<Order | undefined>(() => {
    if (!this.table) return undefined;
    if (this.table.currentOrderId) {
      return this.orderService.orders().find(o => o.id === this.table.currentOrderId);
    }
    // Wyszukaj alternatywnie po nazwie stolika jeśli currentOrderId nie jest jeszcze ustawione
    return this.orderService.orders().find(
      o => o.tableNumber.trim().toLowerCase() === this.table.number.trim().toLowerCase() &&
           o.status !== 'completed' && o.status !== 'cancelled'
    );
  });

  // Obliczony czas od zamówienia
  readonly elapsedTime = computed<string>(() => {
    const order = this.activeOrder();
    if (!order) return '';
    return this.orderService.getElapsedTime(order.createdAt);
  });

  async onRequestBill(): Promise<void> {
    await this.tableService.requestBill(this.table.id);
  }

  async onSettle(paymentMethod: 'Karta' | 'Gotówka' | 'BLIK'): Promise<void> {
    this.isSettling.set(true);
    try {
      const order = this.activeOrder();
      await this.tableService.settleTableOrder(this.table.id, order?.id, paymentMethod);
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
