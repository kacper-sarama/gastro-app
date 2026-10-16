import { Component, EventEmitter, Input, Output, OnInit, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { InventoryItem, InventoryUnit } from '../../core/models/inventory-item.model';
import { InventoryService } from '../../core/services/inventory.service';
import { CategorySelectorComponent } from '../../shared/components/category-selector/category-selector.component';

export interface AddEditIngredientModalData {
  itemToEdit?: InventoryItem;
}

@Component({
  selector: 'app-add-edit-ingredient-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CategorySelectorComponent, MatSelectModule, MatFormFieldModule],
  templateUrl: './add-edit-ingredient-modal.component.html'
})
export class AddEditIngredientModalComponent implements OnInit {
  private fb = inject(FormBuilder);
  readonly inventoryService = inject(InventoryService);
  private dialogRef = inject(MatDialogRef<AddEditIngredientModalComponent>, { optional: true });
  readonly dialogData = inject<AddEditIngredientModalData>(MAT_DIALOG_DATA, { optional: true });

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

  get currentItem(): InventoryItem | undefined {
    return this.itemToEdit || this.dialogData?.itemToEdit;
  }

  get isEditMode(): boolean {
    return !!this.currentItem;
  }

  get selectedUnit(): InventoryUnit {
    return this.form?.get('unit')?.value || 'g';
  }

  closeModal(): void {
    this.close.emit();
    this.dialogRef?.close();
  }

  private uniqueNameValidator(control: AbstractControl): ValidationErrors | null {
    if (!control.value) return null;
    const name = control.value.toString().trim().toLowerCase();
    const existing = this.inventoryService.items().find(i => 
      i.id !== this.currentItem?.id && i.name.trim().toLowerCase() === name
    );
    return existing ? { duplicateName: true } : null;
  }

  ngOnInit(): void {
    const edit = this.currentItem;

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
      name: [edit?.name || '', [Validators.required, Validators.minLength(2), (c: AbstractControl) => this.uniqueNameValidator(c)]],
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
    this.dialogRef?.close(itemData);
  }
}
