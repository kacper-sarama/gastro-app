import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

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

export interface ToastItem {
  id: string;
  data: ToastData;
  createdAt: number;
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
  @Input({ required: true }) toast!: ToastItem;
  @Output() dismiss = new EventEmitter<string>();

  readonly progressWidth = signal<number>(100);
  private progressInterval?: any;

  get data(): ToastData {
    return this.toast.data;
  }

  ngOnInit(): void {
    const duration = this.data.duration || 4500;
    const intervalMs = 40;
    const step = (intervalMs / duration) * 100;

    this.progressInterval = setInterval(() => {
      this.progressWidth.update(w => {
        const next = w - step;
        if (next <= 0) {
          clearInterval(this.progressInterval);
          this.dismiss.emit(this.toast.id);
          return 0;
        }
        return next;
      });
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
      case 'danger': return 'Brak surowca w magazynie';
      case 'success': return 'Sukces';
      case 'info': return 'Powiadomienie';
    }
  }

  onAction(): void {
    if (this.data.actionCallback) {
      this.data.actionCallback();
    }
    this.dismiss.emit(this.toast.id);
  }

  onClose(): void {
    this.dismiss.emit(this.toast.id);
  }
}
