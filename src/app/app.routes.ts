import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { MainLayoutComponent } from './core/layout/main-layout.component';
import { LoginComponent } from './features/auth/login/login.component';
import { RegisterComponent } from './features/auth/register/register.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { InventoryListComponent } from './features/inventory/inventory-list.component';
import { RecipesListComponent } from './features/recipes/recipes-list.component';
import { MenuManagementComponent } from './features/menu/menu-management.component';
import { GuestMenuComponent } from './features/menu/guest-menu.component';

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
        component: DashboardComponent
      },
      {
        path: 'inventory',
        component: InventoryListComponent
      },
      {
        path: 'recipes',
        component: RecipesListComponent
      },
      {
        path: 'dishes',
        component: MenuManagementComponent
      }
    ]
  },

  // Fallback
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];
