import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
export class MainLayoutComponent implements OnInit {
  readonly authService = inject(AuthService);
  readonly themeService = inject(ThemeService);
  private router = inject(Router);
  private breakpointObserver = inject(BreakpointObserver);
  private destroyRef = inject(DestroyRef);

  isMobileMenuOpen = signal(false);
  isSidebarCollapsed = signal(false);
  isUserMenuOpen = signal(false);
  isAccountModalOpen = signal(false);

  private userHasManuallyToggled = false;

  readonly navItems: NavItem[] = [
    { label: 'Pulpit / Dashboard', route: '/dashboard', icon: 'dashboard' },
    { label: 'Zamówienia & Kuchnia (KDS)', route: '/orders', icon: 'view_kanban' },
    { label: 'Magazyn Składników', route: '/inventory', icon: 'inventory_2' },
    { label: 'Receptury & Wydajność', route: '/recipes', icon: 'menu_book' },
    { label: 'Karta Dań & Menu', route: '/dishes', icon: 'restaurant_menu' }
  ];

  ngOnInit(): void {
    // Oficjalny reaktywny mechanizm Angular CDK BreakpointObserver
    this.breakpointObserver
      .observe(['(max-width: 899.98px)', '(max-width: 767.98px)'])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => {
        const isMobile = result.breakpoints['(max-width: 767.98px)'];
        const isUnder900 = result.breakpoints['(max-width: 899.98px)'];

        if (isMobile) {
          // Na mobilkach domyślnie zamykamy wysuwane menu drawer
          this.isMobileMenuOpen.set(false);
        } else if (isUnder900) {
          // Pomiędzy 768px a 900px automatycznie aktywuj tryb kompaktowy (same ikony)
          if (!this.userHasManuallyToggled) {
            this.isSidebarCollapsed.set(true);
          }
        } else {
          // Powyżej 900px powrót do pełnego menu
          if (!this.userHasManuallyToggled) {
            this.isSidebarCollapsed.set(false);
          }
        }
      });
  }

  toggleSidebar(): void {
    const isMobile = this.breakpointObserver.isMatched('(max-width: 767.98px)');
    if (isMobile) {
      this.toggleMobileMenu();
    } else {
      this.userHasManuallyToggled = true;
      this.isSidebarCollapsed.update(v => !v);
    }
  }

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
