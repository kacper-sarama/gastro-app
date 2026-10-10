import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const roleGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.canAccessRoute(state.url)) {
    return true;
  }

  // Jeśli użytkownik próbuje wejść na stronę niedostępną dla jego roli,
  // przekieruj go na domyślny pulpit roboczy dla tej roli:
  const role = authService.currentUserRole();
  if (role === 'kitchen') {
    return router.createUrlTree(['/orders']);
  }
  if (role === 'waiter') {
    return router.createUrlTree(['/tables']);
  }

  return router.createUrlTree(['/dashboard']);
};
