import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/services/auth.service';

import { PaymentService } from '../../core/services/payment.service';
import { PaymentSettings, DEFAULT_PAYMENT_SETTINGS } from '../../core/models/payment.model';

export type AccountTab = 'profile' | 'payments' | 'email' | 'password';

@Component({
  selector: 'app-account-settings-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, MatTooltipModule],
  templateUrl: './account-settings-modal.component.html'
})
export class AccountSettingsModalComponent {
  readonly authService = inject(AuthService);
  readonly paymentService = inject(PaymentService);
  private dialogRef = inject<MatDialogRef<AccountSettingsModalComponent>>(MatDialogRef, { optional: true });

  @Output() close = new EventEmitter<void>();

  closeModal(): void {
    this.close.emit();
    this.dialogRef?.close();
  }

  activeTab = signal<AccountTab>('profile');
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  // Formularz 1: Profil lokalu
  restaurantName = signal<string>(this.authService.restaurantName());

  // Formularz 2: Płatności Online (Stripe Sandbox)
  paymentSettings = signal<PaymentSettings>({ ...DEFAULT_PAYMENT_SETTINGS });

  constructor() {
    const uid = this.authService.currentUserId;
    if (uid) {
      this.paymentService.loadSettings(uid).then(s => {
        this.paymentSettings.set({ ...s });
      });
    }
  }

  fillDefaultStripeKey(): void {
    this.paymentSettings.update(s => ({
      ...s,
      isTestMode: true,
      stripePublishableKey: 'pk_test_51MockGastroStripeSandboxKey2026'
    }));
  }

  async savePaymentSettings(): Promise<void> {
    const uid = this.authService.currentUserId;
    if (!uid) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      await this.paymentService.saveSettings(uid, this.paymentSettings());
      this.closeModal();
    } catch (err: any) {
      this.errorMessage.set('Nie udało się zapisać konfiguracji płatności.');
    } finally {
      this.isLoading.set(false);
    }
  }

  // Formularz 3: Zmiana e-mail
  newEmail = signal<string>('');
  emailCurrentPassword = signal<string>('');

  // Formularz 4: Zmiana hasła
  currentPassword = signal<string>('');
  newPassword = signal<string>('');
  confirmPassword = signal<string>('');
  showPasswords = signal<boolean>(false);

  setTab(tab: AccountTab): void {
    this.activeTab.set(tab);
    this.errorMessage.set(null);
  }

  toggleShowPasswords(): void {
    this.showPasswords.update(v => !v);
  }

  async saveRestaurantName(): Promise<void> {
    const name = this.restaurantName().trim();
    if (!name) {
      this.errorMessage.set('Podaj poprawną nazwę restauracji.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      await this.authService.updateRestaurantName(name);
      this.closeModal();
    } catch (err: any) {
      this.errorMessage.set(this.authService.formatFirebaseError(err.code || err.message));
    } finally {
      this.isLoading.set(false);
    }
  }

  async saveEmail(): Promise<void> {
    const email = this.newEmail().trim();
    const pass = this.emailCurrentPassword();

    if (!email) {
      this.errorMessage.set('Wprowadź nowy adres e-mail.');
      return;
    }

    if (!pass) {
      this.errorMessage.set('Wprowadź aktualne hasło, aby potwierdzić zmianę adresu e-mail.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      await this.authService.changeEmail(email, pass);
      this.newEmail.set('');
      this.emailCurrentPassword.set('');
      this.closeModal();
    } catch (err: any) {
      this.errorMessage.set(this.authService.formatFirebaseError(err.code || err.message));
    } finally {
      this.isLoading.set(false);
    }
  }

  async savePassword(): Promise<void> {
    const currentPass = this.currentPassword();
    const newPass = this.newPassword();
    const confirmPass = this.confirmPassword();

    if (!currentPass) {
      this.errorMessage.set('Wprowadź aktualne hasło.');
      return;
    }

    if (!newPass || newPass.length < 6) {
      this.errorMessage.set('Nowe hasło musi mieć co najmniej 6 znaków.');
      return;
    }

    if (newPass !== confirmPass) {
      this.errorMessage.set('Nowe hasła nie są identyczne.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      await this.authService.changePassword(currentPass, newPass);
      this.currentPassword.set('');
      this.newPassword.set('');
      this.confirmPassword.set('');
      this.closeModal();
    } catch (err: any) {
      this.errorMessage.set(this.authService.formatFirebaseError(err.code || err.message));
    } finally {
      this.isLoading.set(false);
    }
  }
}
