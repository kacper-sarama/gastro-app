import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { MainLayoutComponent } from './core/layout/main-layout.component';
import { LoginComponent } from './features/auth/login/login.component';
import { RegisterComponent } from './features/auth/register/register.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { InventoryListComponent } from './features/inventory/inventory-list.component';
import { RecipesListComponent } from './features/recipes/recipes-list.component';
import { MenuManagementComponent } from './features/menu/menu-management.component';
import { GuestMenuComponent } from './features/menu/guest-menu.component';
import { OrdersKanbanComponent } from './features/orders/orders-kanban.component';
import { PromotionsListComponent } from './features/promotions/promotions-list.component';
import { TablesFloorPlanComponent } from './features/tables/tables-floor-plan.component';
import { StaffManagementComponent } from './features/staff/staff-management.component';

export const routes: Routes = [
  // Public auth routes
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [guestGuard]
  },
  {
    path: 'register',
    component: RegisterComponent,
    canActivate: [guestGuard]
  },

  // Public guest menu route (accessible without login, via QR code)
  {
    path: 'menu/:restaurantId',
    component: GuestMenuComponent
  },

  // Protected application routes inside MainLayout
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard'
      },
      {
        path: 'dashboard',
        component: DashboardComponent,
        canActivate: [roleGuard]
      },
      {
        path: 'tables',
        component: TablesFloorPlanComponent,
        canActivate: [roleGuard]
      },
      {
        path: 'orders',
        component: OrdersKanbanComponent,
        canActivate: [roleGuard]
      },
      {
        path: 'promotions',
        component: PromotionsListComponent,
        canActivate: [roleGuard]
      },
      {
        path: 'inventory',
        component: InventoryListComponent,
        canActivate: [roleGuard]
      },
      {
        path: 'recipes',
        component: RecipesListComponent,
        canActivate: [roleGuard]
      },
      {
        path: 'dishes',
        component: MenuManagementComponent,
        canActivate: [roleGuard]
      },
      {
        path: 'staff',
        component: StaffManagementComponent,
        canActivate: [roleGuard]
      }
    ]
  },

  // Fallback
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];
