import { Injectable, inject } from '@angular/core';
import { MatSnackBar, MatSnackBarRef } from '@angular/material/snack-bar';
import { ToastData, ToastNotificationComponent, ToastType } from '../../shared/components/toast-notification/toast-notification.component';

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private snackBar = inject(MatSnackBar);

  show(data: ToastData): MatSnackBarRef<ToastNotificationComponent> {
    const duration = data.duration ?? 5000;

    return this.snackBar.openFromComponent(ToastNotificationComponent, {
      data: { ...data, duration },
      duration,
      verticalPosition: 'bottom',
      horizontalPosition: 'center',
      panelClass: ['custom-toast-pane']
    });
  }

  warning(message: string, title?: string, actionText?: string, actionCallback?: () => void): MatSnackBarRef<ToastNotificationComponent> {
    return this.show({
      type: 'warning',
      title: title || 'Ostrzeżenie',
      message,
      actionText,
      actionCallback
    });
  }

  danger(message: string, title?: string, actionText?: string, actionCallback?: () => void): MatSnackBarRef<ToastNotificationComponent> {
    return this.show({
      type: 'danger',
      title: title || 'Alert magazynu',
      message,
      actionText,
      actionCallback
    });
  }

  success(message: string, title?: string, actionText?: string, actionCallback?: () => void): MatSnackBarRef<ToastNotificationComponent> {
    return this.show({
      type: 'success',
      title: title || 'Sukces',
      message,
      actionText,
      actionCallback
    });
  }

  info(message: string, title?: string, actionText?: string, actionCallback?: () => void): MatSnackBarRef<ToastNotificationComponent> {
    return this.show({
      type: 'info',
      title: title || 'Powiadomienie',
      message,
      actionText,
      actionCallback
    });
  }
}
