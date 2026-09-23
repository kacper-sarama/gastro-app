import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-qr-code-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './qr-code-modal.component.html'
})
export class QrCodeModalComponent {
  @Input() restaurantName = 'Nasz Lokal';
  @Input() menuUrl = '';
  @Output() close = new EventEmitter<void>();

  copied = signal<boolean>(false);

  get qrCodeImageUrl(): string {
    const encoded = encodeURIComponent(this.menuUrl || window.location.origin);
    return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data=${encoded}`;
  }

  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.menuUrl);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2500);
    } catch {
      // Fallback kopiowania jeśli clipboard API jest zablokowane
      const input = document.createElement('input');
      input.value = this.menuUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2500);
    }
  }

  printTableCard(): void {
    window.print();
  }
}
