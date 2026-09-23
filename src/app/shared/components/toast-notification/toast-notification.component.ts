import { Component, Inject, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';

export type ToastType = 'warning' | 'danger' | 'success' | 'info';

export interface ToastData {
  title?: string;
  message: string;
  type: ToastType;
  icon?: string;
  actionText?: string;
  actionCallback?: () => void;
  duration?: number;
}

@Component({
  selector: 'app-toast-notification',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast-notification.component.html',
  styles: [`
    :host {
      display: block;
      width: 100%;
    }
  `]
})
export class ToastNotificationComponent implements OnInit, OnDestroy {
  readonly progressWidth = signal<number>(100);
  private progressInterval?: any;

  constructor(
    @Inject(MAT_SNACK_BAR_DATA) public data: ToastData,
    public snackBarRef: MatSnackBarRef<ToastNotificationComponent>
  ) {}

  ngOnInit(): void {
    const duration = this.data.duration || 5000;
    const intervalMs = 50;
    const step = (intervalMs / duration) * 100;

    this.progressInterval = setInterval(() => {
      this.progressWidth.update(w => Math.max(0, w - step));
    }, intervalMs);
  }

  ngOnDestroy(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
    }
  }

  get defaultIcon(): string {
    if (this.data.icon) return this.data.icon;
    switch (this.data.type) {
      case 'warning': return 'warning_amber';
      case 'danger': return 'error_outline';
      case 'success': return 'check_circle';
      case 'info': return 'info';
    }
  }

  get defaultTitle(): string {
    if (this.data.title) return this.data.title;
    switch (this.data.type) {
      case 'warning': return 'Ostrzeżenie magazynu';
      case 'danger': return 'Alert krytyczny';
      case 'success': return 'Sukces';
      case 'info': return 'Powiadomienie';
    }
  }

  onAction(): void {
    if (this.data.actionCallback) {
      this.data.actionCallback();
    }
    this.snackBarRef.dismissWithAction();
  }

  onClose(): void {
    this.snackBarRef.dismiss();
  }
}
