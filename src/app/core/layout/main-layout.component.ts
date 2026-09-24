import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ThemeService } from '../services/theme.service';
import { AccountSettingsModalComponent } from '../../features/account/account-settings-modal.component';

interface NavItem {
  label: string;
  route: string;
  icon: string;
}

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, AccountSettingsModalComponent],
  templateUrl: './main-layout.component.html'
})
export class MainLayoutComponent {
  readonly authService = inject(AuthService);
  readonly themeService = inject(ThemeService);
  private router = inject(Router);

  isMobileMenuOpen = signal(false);
  isUserMenuOpen = signal(false);
  isAccountModalOpen = signal(false);

  readonly navItems: NavItem[] = [
    { label: 'Pulpit / Dashboard', route: '/dashboard', icon: 'dashboard' },
    { label: 'Zamówienia & Kuchnia (KDS)', route: '/orders', icon: 'view_kanban' },
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

  toggleUserMenu(): void {
    this.isUserMenuOpen.update(v => !v);
  }

  closeUserMenu(): void {
    this.isUserMenuOpen.set(false);
  }

  openAccountModal(): void {
    this.isUserMenuOpen.set(false);
    this.isAccountModalOpen.set(true);
  }

  closeAccountModal(): void {
    this.isAccountModalOpen.set(false);
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  async logout(): Promise<void> {
    this.closeUserMenu();
    await this.authService.logout();
    await this.router.navigate(['/login']);
  }
}
