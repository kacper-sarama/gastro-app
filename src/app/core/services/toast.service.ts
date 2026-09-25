import { Injectable, signal } from '@angular/core';
import { ToastData, ToastItem, ToastType } from '../../shared/components/toast-notification/toast-notification.component';

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  // Stos aktywnych powiadomień wyświetlanych jednocześnie
  readonly toasts = signal<ToastItem[]>([]);

  show(data: ToastData): string {
    const id = 'toast_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const duration = data.duration ?? 4500;
    const item: ToastItem = {
      id,
      data: { ...data, duration },
      createdAt: Date.now()
    };

    // Dodaj powiadomienie do stosu (maksymalnie 4 jednocześnie, by nie przysłaniać ekranu)
    this.toasts.update(list => [...list.slice(-3), item]);
    return id;
  }

  dismiss(id: string): void {
    this.toasts.update(list => list.filter(t => t.id !== id));
  }

  warning(message: string, title?: string, actionText?: string, actionCallback?: () => void): string {
    return this.show({
      type: 'warning',
      title: title || 'Ostrzeżenie magazynu',
      message,
      actionText,
      actionCallback
    });
  }

  danger(message: string, title?: string, actionText?: string, actionCallback?: () => void): string {
    return this.show({
      type: 'danger',
      title: title || 'Brak surowca w magazynie',
      message,
      actionText,
      actionCallback
    });
  }

  success(message: string, title?: string, actionText?: string, actionCallback?: () => void): string {
    return this.show({
      type: 'success',
      title: title || 'Sukces',
      message,
      actionText,
      actionCallback
    });
  }

  info(message: string, title?: string, actionText?: string, actionCallback?: () => void): string {
    return this.show({
      type: 'info',
      title: title || 'Powiadomienie',
      message,
      actionText,
      actionCallback
    });
  }
}
