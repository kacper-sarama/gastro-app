import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MainLayoutComponent } from './main-layout.component';
import { AuthService } from '../services/auth.service';
import { ThemeService } from '../services/theme.service';
import { InventoryService } from '../services/inventory.service';
import { RecipeService } from '../services/recipe.service';
import { OrderService } from '../services/order.service';
import { PromotionService } from '../services/promotion.service';
import { TableService } from '../services/table.service';
import { StaffService } from '../services/staff.service';
import { ToastService } from '../services/toast.service';
import { RoleNotificationService } from '../services/role-notification.service';
import { Router, provideRouter } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { signal, computed } from '@angular/core';
import { of } from 'rxjs';
import { UserRole, ROLE_DEFINITIONS } from '../models/staff.model';

describe('MainLayoutComponent (Navigation & Dynamic RBAC Menu)', () => {
  let component: MainLayoutComponent;
  let fixture: ComponentFixture<MainLayoutComponent>;
  let router: Router;
  let currentRoleSignal: ReturnType<typeof signal<UserRole>>;
  let mockAuthService: any;

  beforeEach(async () => {
    currentRoleSignal = signal<UserRole>('owner');

    mockAuthService = {
      currentUserRole: currentRoleSignal,
      currentRoleDefinition: computed(() => ROLE_DEFINITIONS[currentRoleSignal()]),
      canAccessRoute: jasmine.createSpy('canAccessRoute').and.callFake((route: string) => {
        const allowed = ROLE_DEFINITIONS[currentRoleSignal()].allowedRoutes;
        const cleanRoute = route.split('?')[0];
        return allowed.some(r => cleanRoute === r || cleanRoute.startsWith(r + '/'));
      }),
      setSimulatedRole: jasmine.createSpy('setSimulatedRole').and.callFake((role: UserRole | null) => {
        currentRoleSignal.set(role || 'owner');
      }),
      currentUser: signal({ uid: 'test-user', email: 'owner@gastro.pl', displayName: 'Pizzeria Bella' }),
      isDemoAccount: signal(false),
      displayName: signal('Pizzeria Bella'),
      restaurantName: signal('Pizzeria Bella'),
      roleBadgeClass: signal('badge-purple'),
      logout: jasmine.createSpy('logout').and.resolveTo()
    };

    const mockBreakpointObserver = {
      observe: jasmine.createSpy('observe').and.returnValue(of({
        matches: false,
        breakpoints: {}
      }))
    };

    const mockThemeService = {
      isDarkMode: signal(false),
      toggleTheme: jasmine.createSpy('toggleTheme')
    };

    const mockInventoryService = {
      criticalAlertsCount: signal(0)
    };

    const mockRecipeService = {};

    const mockOrderService = {
      activeOrdersCount: signal(2)
    };

    const mockPromotionService = {};

    const mockTableService = {
      occupiedTablesCount: signal(3)
    };

    const mockStaffService = {
      totalStaffCount: signal(4)
    };

    const mockToastService = {
      success: jasmine.createSpy('success'),
      info: jasmine.createSpy('info'),
      warning: jasmine.createSpy('warning'),
      danger: jasmine.createSpy('danger')
    };

    const mockRoleNotificationService = {
      unreadCount: signal(1),
      tooltipLabel: signal('1 nowe zamówienie'),
      activeAlertItems: signal([])
    };

    await TestBed.configureTestingModule({
      imports: [MainLayoutComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
        { provide: BreakpointObserver, useValue: mockBreakpointObserver },
        { provide: ThemeService, useValue: mockThemeService },
        { provide: InventoryService, useValue: mockInventoryService },
        { provide: RecipeService, useValue: mockRecipeService },
        { provide: OrderService, useValue: mockOrderService },
        { provide: PromotionService, useValue: mockPromotionService },
        { provide: TableService, useValue: mockTableService },
        { provide: StaffService, useValue: mockStaffService },
        { provide: ToastService, useValue: mockToastService },
        { provide: RoleNotificationService, useValue: mockRoleNotificationService }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);

    fixture = TestBed.createComponent(MainLayoutComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('powinien poprawnie zainicjalizować komponent głównego szablonu (MainLayout)', () => {
    expect(component).toBeTruthy();
  });

  it('właściciel (owner) powinien widzieć wszystkie 8 zakładek w menu bocznym', () => {
    currentRoleSignal.set('owner');
    fixture.detectChanges();

    const items = component.filteredNavItems();
    expect(items.length).toBe(8);
    const routes = items.map(i => i.route);
    expect(routes).toContain('/dashboard');
    expect(routes).toContain('/tables');
    expect(routes).toContain('/orders');
    expect(routes).toContain('/promotions');
    expect(routes).toContain('/inventory');
    expect(routes).toContain('/recipes');
    expect(routes).toContain('/dishes');
    expect(routes).toContain('/staff');
  });

  it('kucharz (kitchen) powinien widzieć w menu WYŁĄCZNIE zamówienia KDS i receptury', () => {
    currentRoleSignal.set('kitchen');
    fixture.detectChanges();

    const items = component.filteredNavItems();
    expect(items.length).toBe(2);

    const routes = items.map(i => i.route);
    expect(routes).toContain('/orders');
    expect(routes).toContain('/recipes');

    expect(routes).not.toContain('/dashboard');
    expect(routes).not.toContain('/tables');
    expect(routes).not.toContain('/staff');
    expect(routes).not.toContain('/inventory');
  });

  it('kelner (waiter) powinien widzieć w menu tylko stoliki, zamówienia i kartę dań', () => {
    currentRoleSignal.set('waiter');
    fixture.detectChanges();

    const items = component.filteredNavItems();
    expect(items.length).toBe(3);

    const routes = items.map(i => i.route);
    expect(routes).toContain('/tables');
    expect(routes).toContain('/orders');
    expect(routes).toContain('/dishes');

    expect(routes).not.toContain('/staff');
    expect(routes).not.toContain('/inventory');
    expect(routes).not.toContain('/dashboard');
  });

  it('przełączenie roli na kuchnię w symulatorze powinno przekierować na /orders, jeśli obecna trasa była niedozwolona', () => {
    spyOnProperty(router, 'url', 'get').and.returnValue('/staff');
    // Ustaw rolę kuchni i uruchom selectRole
    component.selectRole('kitchen');

    expect(mockAuthService.setSimulatedRole).toHaveBeenCalledWith('kitchen');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/orders');
  });

  it('przełączenie roli na kelnera w symulatorze powinno przekierować na /tables, jeśli obecna trasa była niedozwolona', () => {
    spyOnProperty(router, 'url', 'get').and.returnValue('/inventory');
    component.selectRole('waiter');

    expect(mockAuthService.setSimulatedRole).toHaveBeenCalledWith('waiter');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/tables');
  });

  it('powinien poprawnie zwijać i rozwijać menu boczne (toggleSidebar)', () => {
    expect(component.isSidebarCollapsed()).toBeFalse();
    component.toggleSidebar();
    expect(component.isSidebarCollapsed()).toBeTrue();
    component.toggleSidebar();
    expect(component.isSidebarCollapsed()).toBeFalse();
  });
});
