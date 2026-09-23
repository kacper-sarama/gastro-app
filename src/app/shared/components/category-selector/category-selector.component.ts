import { 
  Component, 
  Input, 
  forwardRef, 
  signal, 
  computed, 
  ElementRef, 
  HostListener, 
  inject 
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';

@Component({
  selector: 'app-category-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CategorySelectorComponent),
      multi: true
    }
  ],
  templateUrl: './category-selector.component.html'
})
export class CategorySelectorComponent implements ControlValueAccessor {
  private elementRef = inject(ElementRef);

  @Input() existingCategories: string[] = [];
  @Input() placeholder = 'Wybierz lub wpisz nową kategorię...';
  @Input() hasError = false;

  // Wartość kontrolki
  readonly selectedValue = signal<string>('');
  readonly isOpen = signal<boolean>(false);
  readonly searchQuery = signal<string>('');
  readonly isDisabled = signal<boolean>(false);

  // Filtrowana lista istniejących kategorii
  readonly filteredCategories = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const categories = this.existingCategories || [];

    if (!query) {
      return categories;
    }
    return categories.filter(c => c.toLowerCase().includes(query));
  });

  // Czy wyszukiwana fraza to nowa kategoria (brak dokładnego dopasowania)
  readonly canCreateNew = computed(() => {
    const query = this.searchQuery().trim();
    if (!query || query.length < 2) {
      return false;
    }
    const categories = this.existingCategories || [];
    return !categories.some(c => c.toLowerCase() === query.toLowerCase());
  });

  // ControlValueAccessor callbacks
  private onChange: (val: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(val: string): void {
    const v = val || '';
    this.selectedValue.set(v);
    this.searchQuery.set(v);
  }

  registerOnChange(fn: (val: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
  }

  openDropdown(): void {
    if (this.isDisabled()) return;
    this.isOpen.set(true);
    // Jeśli mamy już wybraną wartość, zaznacz pole wyszukiwania
    this.searchQuery.set(this.selectedValue());
  }

  closeDropdown(): void {
    this.isOpen.set(false);
    const query = this.searchQuery().trim();
    this.selectedValue.set(query);
    this.onChange(query);
    this.onTouched();
  }

  onInput(e: Event): void {
    const val = (e.target as HTMLInputElement).value;
    this.searchQuery.set(val);
    this.selectedValue.set(val);
    this.onChange(val.trim());
    if (!this.isOpen()) {
      this.isOpen.set(true);
    }
  }

  selectCategory(category: string): void {
    const trimmed = category.trim();
    this.selectedValue.set(trimmed);
    this.searchQuery.set(trimmed);
    this.onChange(trimmed);
    this.isOpen.set(false);
    this.onTouched();
  }

  createNewCategory(): void {
    const query = this.searchQuery().trim();
    if (query) {
      this.selectCategory(query);
    }
  }

  clearValue(e: Event): void {
    e.stopPropagation();
    this.selectedValue.set('');
    this.searchQuery.set('');
    this.onChange('');
    this.closeDropdown();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.closeDropdown();
    }
  }

  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (this.canCreateNew()) {
        this.createNewCategory();
      } else if (this.filteredCategories().length > 0) {
        this.selectCategory(this.filteredCategories()[0]);
      } else if (this.searchQuery().trim()) {
        this.selectCategory(this.searchQuery().trim());
      }
    } else if (e.key === 'Escape') {
      this.closeDropdown();
    }
  }
}
