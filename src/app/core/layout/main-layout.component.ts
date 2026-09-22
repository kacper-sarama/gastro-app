import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

interface NavItem {
  label: string;
  route: string;
  icon: string;
}

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './main-layout.component.html'
})
export class MainLayoutComponent {
  readonly authService = inject(AuthService);
  private router = inject(Router);

  isMobileMenuOpen = signal(false);

  readonly navItems: NavItem[] = [
    { label: 'Pulpit / Dashboard', route: '/dashboard', icon: 'dashboard' },
    { label: 'Magazyn Składników', route: '/inventory', icon: 'inventory_2' },
    { label: 'Receptury & Wydajność', route: '/recipes', icon: 'menu_book' },
    { label: 'Karta Dań & Menu', route: '/dishes', icon: 'restaurant_menu' }
  ];

  toggleMobileMenu(): void {
    this.isMobileMenuOpen.update(v => !v);
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen.set(false);
  }

  async logout(): Promise<void> {
    await this.authService.logout();
    await this.router.navigate(['/login']);
  }
}
