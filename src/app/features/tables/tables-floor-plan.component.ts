import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableService } from '../../core/services/table.service';
import { OrderService } from '../../core/services/order.service';
import { AuthService } from '../../core/services/auth.service';
import { RestaurantTable, TableStatus } from '../../core/models/table.model';
import { AddEditTableModalComponent } from './add-edit-table-modal.component';
import { TableDetailsModalComponent } from './table-details-modal.component';
import { NewOrderModalComponent } from '../orders/new-order-modal.component';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { StatCardComponent } from '../../shared/components/stat-card/stat-card.component';

@Component({
  selector: 'app-tables-floor-plan',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    StatCardComponent,
    MatDialogModule,
    MatTooltipModule
  ],
  templateUrl: './tables-floor-plan.component.html'
})
export class TablesFloorPlanComponent {
  readonly tableService = inject(TableService);
  readonly orderService = inject(OrderService);
  readonly authService = inject(AuthService);
  private dialog = inject(MatDialog);

  // Filtry
  statusFilter = signal<TableStatus | 'all'>('all');
  searchQuery = signal<string>('');

  // Modale
  selectedTableForDetails = signal<RestaurantTable | null>(null);
  readonly currentDetailsTable = computed<RestaurantTable | null>(() => {
    const selected = this.selectedTableForDetails();
    if (!selected) return null;
    return this.tableService.tablesWithLiveStatus().find(t => t.id === selected.id) || selected;
  });
  selectedTableForEdit = signal<RestaurantTable | null>(null);
  isAddModalOpen = signal<boolean>(false);
  isNewOrderModalOpen = signal<boolean>(false);
  tableForNewOrder = signal<string | undefined>(undefined);

  // Wyliczona lista stolików po wszystkich filtrach (strefa, status, wyszukiwarka)
  readonly displayedTables = computed<RestaurantTable[]>(() => {
    const raw = this.tableService.filteredTables();
    const status = this.statusFilter();
    const query = this.searchQuery().trim().toLowerCase();

    return raw.filter(tbl => {
      // Filtr statusu
      if (status !== 'all' && tbl.status !== status) {
        return false;
      }
      // Wyszukiwarka
      if (query) {
        const matchesNumber = tbl.number.toLowerCase().includes(query);
        const matchesZone = (tbl.zone || '').toLowerCase().includes(query);
        const matchesNotes = (tbl.notes || '').toLowerCase().includes(query);
        if (!matchesNumber && !matchesZone && !matchesNotes) {
          return false;
        }
      }
      return true;
    });
  });

  // Liczby stolików w poszczególnych strefach
  readonly zoneCounts = computed<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    const all = this.tableService.tablesWithLiveStatus();
    for (const t of all) {
      const z = t.zone || 'Sala Główna';
      map[z] = (map[z] || 0) + 1;
    }
    return map;
  });

  selectZone(zone: string): void {
    this.tableService.selectedZone.set(zone);
  }

  toggleStatusFilter(status: TableStatus): void {
    if (this.statusFilter() === status) {
      this.statusFilter.set('all');
    } else {
      this.statusFilter.set(status);
    }
  }

  setStatusFilter(status: TableStatus | 'all'): void {
    this.statusFilter.set(status);
  }

  onTableClick(tbl: RestaurantTable): void {
    if (tbl.status === 'free') {
      // Dla wolnego stolika od razu proponujemy otwarcie nowego zamówienia lub podgląd
      this.openTableDetails(tbl);
    } else {
      this.openTableDetails(tbl);
    }
  }

  openTableDetails(tbl: RestaurantTable): void {
    const dialogRef = this.dialog.open(TableDetailsModalComponent, {
      data: { table: tbl },
      panelClass: 'gastro-dialog-panel'
    });

    dialogRef.afterClosed().subscribe((res?: { action: string; table?: RestaurantTable }) => {
      if (res?.action === 'newOrder' && res.table) {
        this.openNewOrderModal(res.table);
      } else if (res?.action === 'edit' && res.table) {
        this.openEditTableModal(res.table);
      }
    });
  }

  closeTableDetails(): void {
    this.selectedTableForDetails.set(null);
  }

  openAddTableModal(): void {
    this.dialog.open(AddEditTableModalComponent, {
      data: { tableToEdit: null },
      panelClass: 'gastro-dialog-panel'
    });
  }

  openEditTableModal(tbl: RestaurantTable): void {
    this.dialog.open(AddEditTableModalComponent, {
      data: { tableToEdit: tbl },
      panelClass: 'gastro-dialog-panel'
    });
  }

  closeAddEditModal(): void {
    this.isAddModalOpen.set(false);
    this.selectedTableForEdit.set(null);
  }

  openNewOrderModal(tbl?: RestaurantTable): void {
    this.tableForNewOrder.set(tbl ? tbl.number : undefined);
    this.dialog.open(NewOrderModalComponent, {
      data: { initialTableNumber: tbl ? tbl.number : undefined },
      panelClass: 'gastro-dialog-panel'
    });
  }

  closeNewOrderModal(): void {
    this.isNewOrderModalOpen.set(false);
    this.tableForNewOrder.set(undefined);
  }

  async quickClean(tbl: RestaurantTable, event: Event): Promise<void> {
    event.stopPropagation();
    await this.tableService.cleanAndFreeTable(tbl.id);
  }

  async quickRequestBill(tbl: RestaurantTable, event: Event): Promise<void> {
    event.stopPropagation();
    await this.tableService.requestBill(tbl.id);
  }

  quickStartOrder(tbl: RestaurantTable, event: Event): void {
    event.stopPropagation();
    this.openNewOrderModal(tbl);
  }

  getElapsedTime(occupiedSince?: string): string {
    return this.tableService.getElapsedTime(occupiedSince);
  }
}
