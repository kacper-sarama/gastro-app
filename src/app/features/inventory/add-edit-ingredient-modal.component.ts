import { Component, EventEmitter, Input, Output, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { InventoryItem, InventoryUnit } from '../../core/models/inventory-item.model';

@Component({
  selector: 'app-add-edit-ingredient-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div class="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <!-- Header -->
        <div class="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-400 flex items-center justify-center border border-orange-500/20">
              <span class="material-icons-round text-xl">{{ isEditMode ? 'edit' : 'add_box' }}</span>
            </div>
            <div>
              <h3 class="text-lg font-bold text-white leading-tight">
                {{ isEditMode ? 'Edytuj Składnik' : 'Dodaj Nowy Składnik' }}
              </h3>
              <p class="text-xs text-slate-400 mt-0.5">
                Wprowadź dane surowca magazynowego
              </p>
            </div>
          </div>
          <button (click)="close.emit()" class="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800">
            <span class="material-icons-round text-2xl">close</span>
          </button>
        </div>

        <!-- Form Body -->
        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="p-6 space-y-4 overflow-y-auto flex-1">
          <!-- Nazwa składnika -->
          <div>
            <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5" for="name">
              Nazwa surowca *
            </label>
            <input
              id="name"
              type="text"
              formControlName="name"
              placeholder="np. Ser Mozzarella fior di latte"
              class="gastro-input"
              [class.border-rose-500]="form.get('name')?.touched && form.get('name')?.invalid"
            />
            @if (form.get('name')?.touched && form.get('name')?.invalid) {
              <p class="text-rose-400 text-xs mt-1">Nazwa składnika jest wymagana (min. 2 znaki).</p>
            }
          </div>

          <!-- Kategoria i Jednostka Bazowa -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5" for="unit">
                Jednostka Bazowa *
              </label>
              <select id="unit" formControlName="unit" class="gastro-input">
                <option value="g">Gramy (g / kg)</option>
                <option value="ml">Mililitry (ml / l)</option>
                <option value="szt">Sztuki (szt)</option>
              </select>
              <p class="text-[11px] text-slate-500 mt-1">Standaryzacja w bazie do g/ml/szt</p>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5" for="category">
                Kategoria Magazynu
              </label>
              <input
                id="category"
                type="text"
                formControlName="category"
                placeholder="np. Nabiał, Suche, Warzywa"
                class="gastro-input"
              />
            </div>
          </div>

          <!-- Ilość bieżąca -->
          <div>
            <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5" for="amount">
              Bieżący Stan Magazynowy *
            </label>
            <div class="flex gap-2">
              <input
                id="amount"
                type="number"
                step="any"
                min="0"
                formControlName="displayAmount"
                placeholder="0"
                class="gastro-input flex-1"
                [class.border-rose-500]="form.get('displayAmount')?.touched && form.get('displayAmount')?.invalid"
              />
              <select formControlName="displayAmountMultiplier" class="gastro-input w-28 shrink-0">
                @if (selectedUnit === 'g') {
                  <option value="1000">kg</option>
                  <option value="1">g</option>
                } @else if (selectedUnit === 'ml') {
                  <option value="1000">litry (l)</option>
                  <option value="1">ml</option>
                } @else {
                  <option value="1">szt</option>
                }
              </select>
            </div>
            @if (form.get('displayAmount')?.touched && form.get('displayAmount')?.invalid) {
              <p class="text-rose-400 text-xs mt-1">Podaj prawidłową ilość (min. 0).</p>
            }
          </div>

          <!-- Próg minimalny (alert) -->
          <div>
            <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5" for="minAmount">
              Minimalny Próg Ostrzegawczy (Alert) *
            </label>
            <div class="flex gap-2">
              <input
                id="minAmount"
                type="number"
                step="any"
                min="0"
                formControlName="displayMinAmount"
                placeholder="0"
                class="gastro-input flex-1"
                [class.border-rose-500]="form.get('displayMinAmount')?.touched && form.get('displayMinAmount')?.invalid"
              />
              <select formControlName="displayMinAmountMultiplier" class="gastro-input w-28 shrink-0">
                @if (selectedUnit === 'g') {
                  <option value="1000">kg</option>
                  <option value="1">g</option>
                } @else if (selectedUnit === 'ml') {
                  <option value="1000">litry (l)</option>
                  <option value="1">ml</option>
                } @else {
                  <option value="1">szt</option>
                }
              </select>
            </div>
            <p class="text-[11px] text-slate-400 mt-1">
              Gdy stan spadnie poniżej tej wartości, otrzymasz pomarańczowy alert o konieczności zamówienia.
            </p>
          </div>
        </form>

        <!-- Footer Actions -->
        <div class="px-6 py-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-end gap-3">
          <button (click)="close.emit()" type="button" class="gastro-btn-secondary">
            Anuluj
          </button>
          <button (click)="onSubmit()" type="button" class="gastro-btn-primary">
            <span class="material-icons-round text-lg">check</span>
            <span>{{ isEditMode ? 'Zapisz zmiany' : 'Dodaj surowiec' }}</span>
          </button>
        </div>
      </div>
    </div>
  `
})
export class AddEditIngredientModalComponent implements OnInit {
  private fb = inject(FormBuilder);

  @Input() itemToEdit?: InventoryItem;
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<Omit<InventoryItem, 'id' | 'restaurantId'>>();

  form!: FormGroup;

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

    this.save.emit({
      name: val.name.trim(),
      unit: val.unit,
      category: val.category ? val.category.trim() : undefined,
      amount: baseAmount,
      minAmount: baseMinAmount
    });
  }
}
