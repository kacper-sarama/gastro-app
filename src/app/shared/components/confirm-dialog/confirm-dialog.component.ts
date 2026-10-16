import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  icon?: string;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirm-dialog.component.html'
})
export class ConfirmDialogComponent {
  readonly dialogRef = inject(MatDialogRef<ConfirmDialogComponent>);
  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);

  get isDestructive(): boolean {
    return this.data.isDestructive !== false;
  }

  get icon(): string {
    return this.data.icon || (this.isDestructive ? 'warning' : 'help_outline');
  }

  get confirmText(): string {
    return this.data.confirmText || (this.isDestructive ? 'Usuń' : 'Potwierdź');
  }

  get cancelText(): string {
    return this.data.cancelText || 'Anuluj';
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }

  onConfirm(): void {
    this.dialogRef.close(true);
  }
}
