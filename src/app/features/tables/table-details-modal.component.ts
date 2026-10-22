import { Component, EventEmitter, Input, Output, inject, computed, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { RestaurantTable } from '../../core/models/table.model';
import { TableService } from '../../core/services/table.service';
import { OrderService } from '../../core/services/order.service';
import { Order } from '../../core/models/order.model';

export interface TableDetailsModalData {
  table: RestaurantTable;
}

export interface TableDetailsModalResult {
  action: 'close' | 'newOrder' | 'edit' | 'settled';
  table?: RestaurantTable;
}

@Component({
  selector: 'app-table-details-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './table-details-modal.component.html'
})
export class TableDetailsModalComponent implements OnInit {
  readonly tableService = inject(TableService);
  readonly orderService = inject(OrderService);
  private dialogRef = inject<MatDialogRef<TableDetailsModalComponent>>(MatDialogRef, { optional: true });
  private dialogData = inject<TableDetailsModalData>(MAT_DIALOG_DATA, { optional: true });

  @Input() table!: RestaurantTable;
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

  // Czy wszystkie zamówienia na tym stoliku są już w 100% opłacone
  readonly isAllPaid = computed<boolean>(() => {
    const orders = this.activeOrders();
    return orders.length > 0 && orders.every(o => o.paid === true);
  });

  // Kwota pozostała do uregulowania u kelnera
  readonly unpaidTotal = computed<number>(() => {
    const orders = this.activeOrders();
    return orders.filter(o => !o.paid).reduce((sum, o) => sum + o.totalPrice, 0);
  });

  // Kwota już opłacona (np. Pay-at-Table BLIK / Google Pay)
  readonly paidTotal = computed<number>(() => {
    const orders = this.activeOrders();
    return orders.filter(o => o.paid).reduce((sum, o) => sum + o.totalPrice, 0);
  });

  // Ostatnio użyta metoda płatności online
  readonly lastPaymentMethod = computed<string>(() => {
    const paid = this.activeOrders().find(o => o.paid && o.paymentMethod);
    return paid?.paymentMethod || 'Online';
  });

  // Czy stolik ma jakiekolwiek dania gotowe do odebrania z kuchni
  readonly hasReadyOrders = computed<boolean>(() => {
    return this.activeOrders().some(o => o.status === 'ready');
  });

  isDelivering = signal<boolean>(false);

  ngOnInit(): void {
    if (this.dialogData?.table) {
      this.table = this.dialogData.table;
    }
  }

  closeModal(): void {
    this.close.emit();
    this.dialogRef?.close({ action: 'close' });
  }

  /**
   * Kelnerka wydaje wybrany bon bezpośrednio ze szczegółów stolika na Sali
   */
  async onDeliverOrder(order: Order): Promise<void> {
    if (order.status !== 'ready') return;
    this.isDelivering.set(true);
    try {
      await this.orderService.updateOrderStatus(order.id, 'completed');
    } finally {
      this.isDelivering.set(false);
    }
  }

  /**
   * Kelnerka wydaje wszystkie gotowe bony na stół jednym kliknięciem
   */
  async onDeliverAllReady(): Promise<void> {
    const readyOrders = this.activeOrders().filter(o => o.status === 'ready');
    if (readyOrders.length === 0) return;
    this.isDelivering.set(true);
    try {
      for (const ord of readyOrders) {
        await this.orderService.updateOrderStatus(ord.id, 'completed');
      }
    } finally {
      this.isDelivering.set(false);
    }
  }

  async onRequestBill(): Promise<void> {
    await this.tableService.requestBill(this.table.id);
  }

  async onFreeTable(): Promise<void> {
    await this.tableService.cleanAndFreeTable(this.table.id);
    this.close.emit();
    this.dialogRef?.close({ action: 'settled', table: this.table });
  }

  async onSettle(paymentMethod: 'Karta' | 'Gotówka' | 'BLIK'): Promise<void> {
    this.isSettling.set(true);
    try {
      const orderIds = this.activeOrders().map(o => o.id);
      await this.tableService.settleTableOrder(this.table.id, orderIds, paymentMethod);
      this.close.emit();
      this.dialogRef?.close({ action: 'settled', table: this.table });
    } finally {
      this.isSettling.set(false);
    }
  }

  async onFinishPaidVisit(): Promise<void> {
    this.isSettling.set(true);
    try {
      const orderIds = this.activeOrders().map(o => o.id);
      await this.tableService.settleTableOrder(this.table.id, orderIds, this.lastPaymentMethod());
      this.close.emit();
      this.dialogRef?.close({ action: 'settled', table: this.table });
    } finally {
      this.isSettling.set(false);
    }
  }

  async onCleanTable(): Promise<void> {
    await this.tableService.cleanAndFreeTable(this.table.id);
    this.close.emit();
    this.dialogRef?.close({ action: 'settled', table: this.table });
  }

  handleOpenNewOrder(): void {
    this.openNewOrder.emit(this.table);
    this.close.emit();
    this.dialogRef?.close({ action: 'newOrder', table: this.table });
  }

  handleEditTable(): void {
    this.editTable.emit(this.table);
    this.close.emit();
    this.dialogRef?.close({ action: 'edit', table: this.table });
  }
}
