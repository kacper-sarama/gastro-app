import { Injectable, inject, signal, computed } from '@angular/core';
import { 
  Auth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  user,
  updateProfile,
  User
} from '@angular/fire/auth';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth = inject(Auth);

  // Observable strumienia użytkownika
  readonly user$: Observable<User | null> = user(this.auth);

  // Signal reprezentujący aktualnie zalogowanego użytkownika
  readonly currentUser = toSignal(this.user$, { initialValue: null });

  // Signal określający stan zalogowania
  readonly isLoggedIn = computed(() => !!this.currentUser());

  // Nazwa restauracji lub wyświetlana nazwa
  readonly restaurantName = computed(() => {
    const u = this.currentUser();
    return u?.displayName || 'Mój Lokal';
  });

  // Rejestracja nowego restauratora
  async register(email: string, pass: string, restaurantName: string): Promise<User> {
    const credential = await createUserWithEmailAndPassword(this.auth, email, pass);
    if (restaurantName) {
      await updateProfile(credential.user, {
        displayName: restaurantName
      });
    }
    return credential.user;
  }

  // Logowanie
  async login(email: string, pass: string): Promise<User> {
    const credential = await signInWithEmailAndPassword(this.auth, email, pass);
    return credential.user;
  }

  // Wylogowanie
  async logout(): Promise<void> {
    await signOut(this.auth);
  }

  // Pomocnicza metoda tłumaczenia kodów błędów Firebase na przyjazny język polski
  formatFirebaseError(code: string): string {
    switch (code) {
      case 'auth/invalid-email':
        return 'Niepoprawny format adresu e-mail.';
      case 'auth/user-disabled':
        return 'To konto zostało zablokowane.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Nieprawidłowy adres e-mail lub hasło.';
      case 'auth/email-already-in-use':
        return 'Konto o podanym adresie e-mail już istnieje.';
      case 'auth/weak-password':
        return 'Hasło jest zbyt słabe (wymagane min. 6 znaków).';
      case 'auth/network-request-failed':
        return 'Błąd połączenia z siecią. Sprawdź dostęp do internetu.';
      case 'auth/too-many-requests':
        return 'Zbyt wiele nieudanych prób logowania. Spróbuj ponownie później.';
      default:
        return 'Wystąpił nieoczekiwany błąd uwierzytelniania. Spróbuj ponownie.';
    }
  }
}
