import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InventoryService } from '../../core/services/inventory.service';
import { InventoryItem, StockStatus, formatStockAmount, getStockStatus } from '../../core/models/inventory-item.model';
import { AddEditIngredientModalComponent } from './add-edit-ingredient-modal.component';
import { QuickDeliveryModalComponent } from './quick-delivery-modal.component';
import { ManageInventoryCategoriesModalComponent } from './manage-inventory-categories-modal.component';

@Component({
  selector: 'app-inventory-list',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    AddEditIngredientModalComponent, 
    QuickDeliveryModalComponent,
    ManageInventoryCategoriesModalComponent
  ],
  templateUrl: './inventory-list.component.html'
})
export class InventoryListComponent {
  readonly inventoryService = inject(InventoryService);

  // Filtry
  searchQuery = signal<string>('');
  selectedStatusFilter = signal<string>('all'); // 'all' | 'ok' | 'low' | 'out'
  selectedCategory = signal<string>('all');

  // Stan modali
  isAddEditModalOpen = signal(false);
  itemToEdit = signal<InventoryItem | undefined>(undefined);

  isDeliveryModalOpen = signal(false);
  deliveryTargetItem = signal<InventoryItem | null>(null);

  isManageCategoriesModalOpen = signal(false);

  itemToDelete = signal<InventoryItem | null>(null);

  // Unikalne kategorie
  readonly categories = computed(() => this.inventoryService.allCategories());

  // Filtrowane surowce
  readonly filteredItems = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const statusFilter = this.selectedStatusFilter();
    const categoryFilter = this.selectedCategory();

    return this.inventoryService.items().filter(item => {
      // Wyszukiwanie tekstowe
      const matchesSearch = !query || item.name.toLowerCase().includes(query) || (item.category?.toLowerCase().includes(query) ?? false);

      // Filtr statusu
      const status = getStockStatus(item);
      const matchesStatus = statusFilter === 'all' || status === statusFilter;

      // Filtr kategorii
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;

      return matchesSearch && matchesStatus && matchesCategory;
    });
  });

  // Pomocniki do widoku
  formatAmount(amount: number, unit: any) {
    return formatStockAmount(amount, unit);
  }

  getItemStatus(item: InventoryItem): StockStatus {
    return getStockStatus(item);
  }

  // Akcje modali
  openAddModal(): void {
    this.itemToEdit.set(undefined);
    this.isAddEditModalOpen.set(true);
  }

  openEditModal(item: InventoryItem): void {
    this.itemToEdit.set(item);
    this.isAddEditModalOpen.set(true);
  }

  closeAddEditModal(): void {
    this.isAddEditModalOpen.set(false);
    this.itemToEdit.set(undefined);
  }

  async onSaveItem(data: Omit<InventoryItem, 'id' | 'restaurantId'>): Promise<void> {
    const edit = this.itemToEdit();
    if (edit) {
      await this.inventoryService.updateItem(edit.id, data);
    } else {
      await this.inventoryService.addItem(data);
    }
    this.closeAddEditModal();
  }

  openDeliveryModal(item: InventoryItem): void {
    this.deliveryTargetItem.set(item);
    this.isDeliveryModalOpen.set(true);
  }

  closeDeliveryModal(): void {
    this.isDeliveryModalOpen.set(false);
    this.deliveryTargetItem.set(null);
  }

  async onConfirmDelivery(addedAmount: number): Promise<void> {
    const target = this.deliveryTargetItem();
    if (target) {
      await this.inventoryService.quickAdjustStock(target.id, addedAmount);
    }
    this.closeDeliveryModal();
  }

  openManageCategoriesModal(): void {
    this.isManageCategoriesModalOpen.set(true);
  }

  closeManageCategoriesModal(): void {
    this.isManageCategoriesModalOpen.set(false);
  }

  promptDeleteItem(item: InventoryItem): void {
    this.itemToDelete.set(item);
  }

  cancelDeleteItem(): void {
    this.itemToDelete.set(null);
  }

  async confirmDeleteItem(): Promise<void> {
    const target = this.itemToDelete();
    if (target) {
      await this.inventoryService.deleteItem(target.id);
      this.itemToDelete.set(null);
    }
  }
}
