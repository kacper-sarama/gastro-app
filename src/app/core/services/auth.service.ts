import { Injectable, inject, signal, computed } from '@angular/core';
import { 
  Auth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  user,
  updateProfile,
  updateEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  User
} from '@angular/fire/auth';
import { Firestore, doc, setDoc } from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { ToastService } from './toast.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private toastService = inject(ToastService);

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
      try {
        const docRef = doc(this.firestore, `restaurant_settings/${credential.user.uid}`);
        await setDoc(docRef, { restaurantName, updatedAt: new Date().toISOString() }, { merge: true });
      } catch (e) {
        console.warn('Nie udało się zapisać nazwy lokalu w ustawieniach Firestore:', e);
      }
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

  /**
   * Zmienia nazwę restauracji w profilu użytkownika oraz w ustawieniach lokalu w Firestore
   */
  async updateRestaurantName(newName: string): Promise<void> {
    const u = this.auth.currentUser;
    if (!u) throw new Error('Brak zalogowanego użytkownika');

    const trimmed = newName.trim();
    if (!trimmed) throw new Error('Nazwa lokalu nie może być pusta');

    await updateProfile(u, { displayName: trimmed });

    try {
      const docRef = doc(this.firestore, `restaurant_settings/${u.uid}`);
      await setDoc(docRef, { 
        restaurantName: trimmed,
        updatedAt: new Date().toISOString() 
      }, { merge: true });
    } catch (e) {
      console.warn('Błąd synchronizacji nazwy restauracji do Firestore:', e);
    }

    this.toastService.success(`Zaktualizowano nazwę lokalu na "${trimmed}".`, 'Profil lokalu');
  }

  /**
   * Zmienia adres e-mail użytkownika wraz z wymaganą re-autentykacją hasłem
   */
  async changeEmail(newEmail: string, currentPassword?: string): Promise<void> {
    const u = this.auth.currentUser;
    if (!u) throw new Error('Brak zalogowanego użytkownika');

    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed) throw new Error('Podaj poprawny adres e-mail');

    if (currentPassword && u.email) {
      const credential = EmailAuthProvider.credential(u.email, currentPassword);
      await reauthenticateWithCredential(u, credential);
    }

    await updateEmail(u, trimmed);
    this.toastService.success(`Adres e-mail został pomyślnie zmieniony na "${trimmed}".`, 'Konto użytkownika');
  }

  /**
   * Zmienia hasło logowania wraz z wymaganą re-autentykacją aktualnym hasłem
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const u = this.auth.currentUser;
    if (!u) throw new Error('Brak zalogowanego użytkownika');

    if (!newPassword || newPassword.length < 6) {
      throw new Error('Nowe hasło musi zawierać co najmniej 6 znaków');
    }

    if (u.email) {
      const credential = EmailAuthProvider.credential(u.email, currentPassword);
      await reauthenticateWithCredential(u, credential);
    }

    await updatePassword(u, newPassword);
    this.toastService.success('Hasło do konta zostało pomyślnie zaktualizowane.', 'Bezpieczeństwo');
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
        return 'Nieprawidłowy adres e-mail lub aktualne hasło.';
      case 'auth/email-already-in-use':
        return 'Konto o podanym adresie e-mail już istnieje w systemie.';
      case 'auth/weak-password':
        return 'Hasło jest zbyt słabe (wymagane min. 6 znaków).';
      case 'auth/requires-recent-login':
        return 'Operacja wymaga potwierdzenia tożsamości. Podaj aktualne hasło.';
      case 'auth/network-request-failed':
        return 'Błąd połączenia z siecią. Sprawdź dostęp do internetu.';
      case 'auth/too-many-requests':
        return 'Zbyt wiele nieudanych prób logowania. Odczekaj chwilę i spróbuj ponownie.';
      default:
        return 'Wystąpił nieoczekiwany błąd uwierzytelniania. Spróbuj ponownie.';
    }
  }
}
