import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InventoryItem, formatStockAmount } from '../../core/models/inventory-item.model';

@Component({
  selector: 'app-quick-delivery-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './quick-delivery-modal.component.html'
})
export class QuickDeliveryModalComponent implements OnInit {
  @Input({ required: true }) item!: InventoryItem;
  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<number>();

  addedBaseAmount = 0;
  customInputValue = 0;
  customMultiplier = 1;

  presets: { label: string; baseAmount: number }[] = [];

  get currentFormatted() {
    return formatStockAmount(this.item.amount, this.item.unit);
  }

  get newFormatted() {
    return formatStockAmount(this.item.amount + this.addedBaseAmount, this.item.unit);
  }

  ngOnInit(): void {
    if (this.item.unit === 'g') {
      this.customMultiplier = 1000; // domyślnie kg
      this.presets = [
        { label: '+ 500 g', baseAmount: 500 },
        { label: '+ 1 kg', baseAmount: 1000 },
        { label: '+ 2.5 kg', baseAmount: 2500 },
        { label: '+ 5 kg', baseAmount: 5000 },
        { label: '+ 10 kg', baseAmount: 10000 },
        { label: '+ 25 kg', baseAmount: 25000 },
      ];
      this.setPreset(5000); // Domyślnie zaznacz +5kg
    } else if (this.item.unit === 'ml') {
      this.customMultiplier = 1000; // domyślnie litry
      this.presets = [
        { label: '+ 500 ml', baseAmount: 500 },
        { label: '+ 1 litr', baseAmount: 1000 },
        { label: '+ 2 litry', baseAmount: 2000 },
        { label: '+ 5 litrów', baseAmount: 5000 },
        { label: '+ 10 litrów', baseAmount: 10000 },
        { label: '+ 20 litrów', baseAmount: 20000 },
      ];
      this.setPreset(5000);
    } else {
      this.customMultiplier = 1;
      this.presets = [
        { label: '+ 1 szt', baseAmount: 1 },
        { label: '+ 5 szt', baseAmount: 5 },
        { label: '+ 10 szt', baseAmount: 10 },
        { label: '+ 20 szt', baseAmount: 20 },
        { label: '+ 50 szt', baseAmount: 50 },
        { label: '+ 100 szt', baseAmount: 100 },
      ];
      this.setPreset(10);
    }
  }

  setPreset(amount: number): void {
    this.addedBaseAmount = amount;
    this.customInputValue = amount / this.customMultiplier;
  }

  onCustomInputChange(): void {
    const val = Number(this.customInputValue) || 0;
    this.addedBaseAmount = Math.max(0, Math.round(val * this.customMultiplier));
  }

  confirmDelivery(): void {
    if (this.addedBaseAmount > 0) {
      this.confirm.emit(this.addedBaseAmount);
    }
  }
}
