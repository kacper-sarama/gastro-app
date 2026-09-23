import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export type StatCardColor = 'blue' | 'emerald' | 'amber' | 'rose';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stat-card.component.html'
})
export class StatCardComponent {
  @Input({ required: true }) title!: string;
  @Input({ required: true }) count!: number | string;
  @Input() subtitle?: string;
  @Input({ required: true }) icon!: string;
  @Input({ required: true }) color: StatCardColor = 'blue';
  @Input() isActive: boolean = false;
  @Input() isClickable: boolean = false;

  @Output() cardClick = new EventEmitter<void>();

  onClick(): void {
    if (this.isClickable) {
      this.cardClick.emit();
    }
  }
}
