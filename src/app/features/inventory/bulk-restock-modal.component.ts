import { Component, EventEmitter, Input, Output, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { InventoryItem, StockStatus, formatStockAmount, getStockStatus } from '../../core/models/inventory-item.model';
import { ToastService } from '../../core/services/toast.service';

export interface BulkRestockRow {
  item: InventoryItem;
  selected: boolean;
  inputAmount: number;
  multiplier: number;
  unitOptions: { label: string; multiplier: number }[];
}

export interface BulkRestockModalData {
  items: InventoryItem[];
}

@Component({
  selector: 'app-bulk-restock-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bulk-restock-modal.component.html'
})
export class BulkRestockModalComponent implements OnInit {
  private toastService = inject(ToastService);
  private dialogRef = inject<MatDialogRef<BulkRestockModalComponent>>(MatDialogRef, { optional: true });
  private dialogData = inject<BulkRestockModalData>(MAT_DIALOG_DATA, { optional: true });

  @Input() items: InventoryItem[] = [];
  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<{ id: string; addedAmount: number }[]>();

  rows: BulkRestockRow[] = [];
  isSubmitting = signal(false);

  ngOnInit(): void {
    if (this.dialogData?.items) {
      this.items = this.dialogData.items;
    }

    // Posortuj: najpierw zupełne braki ('out'), potem niski stan ('low')
    const sorted = [...this.items].sort((a, b) => {
      const statusOrder: Record<StockStatus, number> = { out: 0, low: 1, ok: 2 };
      const statusA = getStockStatus(a);
      const statusB = getStockStatus(b);
      if (statusOrder[statusA] !== statusOrder[statusB]) {
        return statusOrder[statusA] - statusOrder[statusB];
      }
      return a.name.localeCompare(b.name, 'pl');
    });

    this.rows = sorted.map(item => {
      const { value, multiplier, unitOptions } = this.calculateInitialQuantity(item);
      return {
        item,
        selected: true,
        inputAmount: value,
        multiplier,
        unitOptions
      };
    });
  }

  private calculateInitialQuantity(item: InventoryItem): {
    value: number;
    multiplier: number;
    unitOptions: { label: string; multiplier: number }[];
  } {
    // Sugerowane uzupełnienie do poziomu bezpiecznego (2x minAmount)
    const neededBase = Math.max(item.minAmount, item.minAmount * 2 - Math.max(0, item.amount));

    if (item.unit === 'g') {
      const unitOptions = [
        { label: 'kg', multiplier: 1000 },
        { label: 'g', multiplier: 1 }
      ];

      if (item.minAmount >= 1000) {
        // Domyślnie w kg, zaokrąglone do 0.5 kg lub 1 kg
        const inKg = Math.max(0.5, Math.ceil((neededBase / 1000) * 2) / 2);
        return { value: inKg, multiplier: 1000, unitOptions };
      } else {
        // Małe ilości w g (np. przyprawy/zioła)
        const inG = Math.max(10, Math.ceil(neededBase / 10) * 10);
        return { value: inG, multiplier: 1, unitOptions };
      }
    }

    if (item.unit === 'ml') {
      const unitOptions = [
        { label: 'litry (l)', multiplier: 1000 },
        { label: 'ml', multiplier: 1 }
      ];

      if (item.minAmount >= 1000) {
        const inL = Math.max(0.5, Math.ceil((neededBase / 1000) * 2) / 2);
        return { value: inL, multiplier: 1000, unitOptions };
      } else {
        const inMl = Math.max(10, Math.ceil(neededBase / 10) * 10);
        return { value: inMl, multiplier: 1, unitOptions };
      }
    }

    // sztuki
    const unitOptions = [{ label: 'szt', multiplier: 1 }];
    const inSzt = Math.max(1, Math.ceil(neededBase));
    return { value: inSzt, multiplier: 1, unitOptions };
  }

  get selectedCount(): number {
    return this.rows.filter(r => r.selected).length;
  }

  get outCount(): number {
    return this.rows.filter(r => getStockStatus(r.item) === 'out').length;
  }

  get lowCount(): number {
    return this.rows.filter(r => getStockStatus(r.item) === 'low').length;
  }

  get isAllSelected(): boolean {
    return this.rows.length > 0 && this.rows.every(r => r.selected);
  }

  toggleSelectAll(): void {
    const nextState = !this.isAllSelected;
    this.rows.forEach(r => r.selected = nextState);
  }

  getRowAddedBase(row: BulkRestockRow): number {
    const val = Number(row.inputAmount) || 0;
    return Math.max(0, Math.round(val * row.multiplier));
  }

  getRowNewTotal(row: BulkRestockRow): number {
    return row.item.amount + this.getRowAddedBase(row);
  }

  formatCurrent(row: BulkRestockRow): string {
    return formatStockAmount(row.item.amount, row.item.unit).display;
  }

  formatMin(row: BulkRestockRow): string {
    return formatStockAmount(row.item.minAmount, row.item.unit).display;
  }

  formatNewTotal(row: BulkRestockRow): string {
    return formatStockAmount(this.getRowNewTotal(row), row.item.unit).display;
  }

  formatAdded(row: BulkRestockRow): string {
    return formatStockAmount(this.getRowAddedBase(row), row.item.unit).display;
  }

  getItemStatus(item: InventoryItem): StockStatus {
    return getStockStatus(item);
  }

  async copyListToClipboard(): Promise<void> {
    const selectedRows = this.rows.filter(r => r.selected && this.getRowAddedBase(r) > 0);
    if (selectedRows.length === 0) {
      this.toastService.warning('Brak zaznaczonych pozycji do skopiowania.', 'Schowek');
      return;
    }

    const todayStr = new Date().toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const lines: string[] = [
      `📦 ZAMÓWIENIE DOSTAWY (${todayStr})`,
      '----------------------------------------'
    ];

    const outItems = selectedRows.filter(r => getStockStatus(r.item) === 'out');
    if (outItems.length > 0) {
      lines.push('🔴 BRAKI W MAGAZYNIE:');
      outItems.forEach(r => {
        lines.push(`• ${r.item.name}: ${this.formatAdded(r)} (obecnie: 0)`);
      });
      lines.push('');
    }

    const lowItems = selectedRows.filter(r => getStockStatus(r.item) === 'low');
    if (lowItems.length > 0) {
      lines.push('🟡 NISKI STAN (UZUPEŁNIENIE):');
      lowItems.forEach(r => {
        lines.push(`• ${r.item.name}: ${this.formatAdded(r)} (obecnie: ${this.formatCurrent(r)}, min: ${this.formatMin(r)})`);
      });
      lines.push('');
    }

    lines.push('----------------------------------------');
    lines.push(`Łącznie pozycji: ${selectedRows.length}`);

    const text = lines.join('\n');

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        this.toastService.info('Skopiowano listę zamówienia do schowka (gotowa do wysłania).', 'Schowek');
      } else {
        // Fallback dla starszych przeglądarek
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        this.toastService.info('Skopiowano listę zamówienia do schowka.', 'Schowek');
      }
    } catch (e) {
      console.warn('Nie udało się skopiować do schowka:', e);
      this.toastService.warning('Nie udało się skopiować do schowka.', 'Schowek');
    }
  }

  closeModal(): void {
    this.close.emit();
    this.dialogRef?.close();
  }

  submitRestock(): void {
    const deliveries = this.rows
      .filter(r => r.selected)
      .map(r => ({
        id: r.item.id,
        addedAmount: this.getRowAddedBase(r)
      }))
      .filter(d => d.addedAmount > 0);

    if (deliveries.length === 0) {
      this.toastService.warning('Wybierz przynajmniej jeden surowiec z ilością większą niż 0.', 'Brak pozycji');
      return;
    }

    this.isSubmitting.set(true);
    this.confirm.emit(deliveries);
    this.dialogRef?.close(deliveries);
  }
}
