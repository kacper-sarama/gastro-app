import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../shared/components/confirm-dialog/confirm-dialog.component';

@Injectable({
  providedIn: 'root'
})
export class ConfirmDialogService {
  private dialog = inject(MatDialog);

  async confirm(data: ConfirmDialogData): Promise<boolean> {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data,
      panelClass: 'gastro-dialog-panel'
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    return !!result;
  }
}
