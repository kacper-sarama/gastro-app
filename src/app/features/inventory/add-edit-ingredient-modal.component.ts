import { Component, EventEmitter, Input, Output, OnInit, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { InventoryItem, InventoryUnit } from '../../core/models/inventory-item.model';
import { InventoryService } from '../../core/services/inventory.service';
import { CategorySelectorComponent } from '../../shared/components/category-selector/category-selector.component';

@Component({
  selector: 'app-add-edit-ingredient-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CategorySelectorComponent],
  templateUrl: './add-edit-ingredient-modal.component.html'
})
export class AddEditIngredientModalComponent implements OnInit {
  private fb = inject(FormBuilder);
  readonly inventoryService = inject(InventoryService);

  @Input() itemToEdit?: InventoryItem;
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<Omit<InventoryItem, 'id' | 'restaurantId'>>();

  form!: FormGroup;

  readonly availableCategories = computed(() => {
    const items = this.inventoryService.items();
    const set = new Set<string>();
    items.forEach(i => {
      if (i.category) set.add(i.category);
    });
    return Array.from(set);
  });

  get isEditMode(): boolean {
    return !!this.itemToEdit;
  }

  get selectedUnit(): InventoryUnit {
    return this.form?.get('unit')?.value || 'g';
  }

  ngOnInit(): void {
    const edit = this.itemToEdit;

    // Przeliczanie na przyjazne jednostki w edycji
    let amountMultiplier = 1;
    let displayAmount = edit ? edit.amount : 0;
    if (edit && edit.unit === 'g' && edit.amount >= 1000 && edit.amount % 100 === 0) {
      amountMultiplier = 1000;
      displayAmount = edit.amount / 1000;
    } else if (edit && edit.unit === 'ml' && edit.amount >= 1000 && edit.amount % 100 === 0) {
      amountMultiplier = 1000;
      displayAmount = edit.amount / 1000;
    }

    let minMultiplier = 1;
    let displayMinAmount = edit ? edit.minAmount : 1000;
    if (edit && edit.unit === 'g' && edit.minAmount >= 1000 && edit.minAmount % 100 === 0) {
      minMultiplier = 1000;
      displayMinAmount = edit.minAmount / 1000;
    } else if (edit && edit.unit === 'ml' && edit.minAmount >= 1000 && edit.minAmount % 100 === 0) {
      minMultiplier = 1000;
      displayMinAmount = edit.minAmount / 1000;
    }

    this.form = this.fb.group({
      name: [edit?.name || '', [Validators.required, Validators.minLength(2)]],
      unit: [edit?.unit || 'g', [Validators.required]],
      category: [edit?.category || ''],
      displayAmount: [displayAmount, [Validators.required, Validators.min(0)]],
      displayAmountMultiplier: [amountMultiplier.toString()],
      displayMinAmount: [displayMinAmount, [Validators.required, Validators.min(0)]],
      displayMinAmountMultiplier: [minMultiplier.toString()]
    });

    // Reset mnożników przy zmianie jednostki
    this.form.get('unit')?.valueChanges.subscribe(unit => {
      const mult = unit === 'szt' ? '1' : '1000';
      this.form.patchValue({
        displayAmountMultiplier: mult,
        displayMinAmountMultiplier: mult
      });
    });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const val = this.form.value;
    const amountMult = Number(val.displayAmountMultiplier) || 1;
    const minMult = Number(val.displayMinAmountMultiplier) || 1;

    const baseAmount = Math.round(Number(val.displayAmount) * amountMult);
    const baseMinAmount = Math.round(Number(val.displayMinAmount) * minMult);

    const itemData: Omit<InventoryItem, 'id' | 'restaurantId'> = {
      name: val.name.trim(),
      unit: val.unit,
      amount: baseAmount,
      minAmount: baseMinAmount
    };

    if (val.category && val.category.trim()) {
      itemData.category = val.category.trim();
    }

    this.save.emit(itemData);
  }
}
