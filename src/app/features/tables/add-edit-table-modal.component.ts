import { Component, EventEmitter, Input, Output, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { RestaurantTable, TableStatus } from '../../core/models/table.model';
import { TableService } from '../../core/services/table.service';

export interface AddEditTableModalData {
  tableToEdit?: RestaurantTable | null;
}

@Component({
  selector: 'app-add-edit-table-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-edit-table-modal.component.html'
})
export class AddEditTableModalComponent implements OnInit {
  private tableService = inject(TableService);
  private dialogRef = inject<MatDialogRef<AddEditTableModalComponent>>(MatDialogRef, { optional: true });
  private dialogData = inject<AddEditTableModalData>(MAT_DIALOG_DATA, { optional: true });

  @Input() tableToEdit: RestaurantTable | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  number = signal<string>('');
  zone = signal<string>('Sala Główna');
  seats = signal<number>(4);
  notes = signal<string>('');
  status = signal<TableStatus>('free');

  isSaving = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  readonly defaultZones: string[] = ['Sala Główna', 'Ogródek Letni', 'Bar', 'Antresola VIP', 'Taras'];
  readonly seatOptions: number[] = [1, 2, 3, 4, 6, 8, 10, 12];

  ngOnInit(): void {
    if (this.dialogData?.tableToEdit !== undefined) {
      this.tableToEdit = this.dialogData.tableToEdit;
    }

    if (this.tableToEdit) {
      this.number.set(this.tableToEdit.number);
      this.zone.set(this.tableToEdit.zone || 'Sala Główna');
      this.seats.set(this.tableToEdit.seats || 4);
      this.notes.set(this.tableToEdit.notes || '');
      this.status.set(this.tableToEdit.status || 'free');
    } else {
      // Zaproponuj kolejny numer stolika
      const existing = this.tableService.tables();
      const count = existing.length + 1;
      this.number.set(`Stolik ${count}`);
    }
  }

  closeModal(): void {
    this.close.emit();
    this.dialogRef?.close();
  }

  setZone(z: string): void {
    this.zone.set(z);
  }

  setSeats(s: number): void {
    this.seats.set(s);
  }

  async onSave(): Promise<void> {
    const num = this.number().trim();
    if (!num) {
      this.errorMessage.set('Wprowadź oznaczenie lub numer stolika.');
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);

    try {
      if (this.tableToEdit) {
        await this.tableService.updateTable(this.tableToEdit.id, {
          number: num,
          zone: this.zone().trim() || 'Sala Główna',
          seats: Number(this.seats()) || 4,
          notes: this.notes().trim(),
          status: this.status()
        });
      } else {
        await this.tableService.addTable({
          number: num,
          zone: this.zone().trim() || 'Sala Główna',
          seats: Number(this.seats()) || 4,
          notes: this.notes().trim(),
          status: 'free'
        });
      }
      this.saved.emit();
      this.close.emit();
      this.dialogRef?.close(true);
    } catch {
      this.errorMessage.set('Wystąpił błąd podczas zapisywania stolika.');
    } finally {
      this.isSaving.set(false);
    }
  }

  async onDelete(): Promise<void> {
    if (!this.tableToEdit) return;
    try {
      await this.tableService.deleteTable(this.tableToEdit.id);
      this.saved.emit();
      this.close.emit();
      this.dialogRef?.close(true);
    } catch {
      // obsłużone w serwisie
    }
  }
}
