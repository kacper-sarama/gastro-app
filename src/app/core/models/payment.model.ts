export type PaymentGatewayType = 'stripe' | 'mock';

export interface PaymentSettings {
  enabled: boolean;
  gateway: PaymentGatewayType;
  isTestMode: boolean; // Sandbox vs Live
  stripePublishableKey: string;
  enabledMethods: {
    blik: boolean;
    card: boolean;
    googlePay: boolean;
    applePay: boolean;
    cash: boolean;
  };
}

export interface PaymentTransaction {
  id: string;
  orderId: string;
  amount: number;
  currency: 'pln';
  paymentMethod: 'BLIK' | 'Karta' | 'Apple Pay' | 'Google Pay' | 'Gotówka';
  gateway: PaymentGatewayType;
  status: 'succeeded' | 'failed' | 'timeout' | 'pending';
  blikCode?: string;
  createdAt: string;
}

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  enabled: true,
  gateway: 'stripe',
  isTestMode: true, // Domyślnie Sandbox dla bezpieczeństwa
  stripePublishableKey: 'pk_test_51MockGastroStripeSandboxKey2026',
  enabledMethods: {
    blik: true,
    card: true,
    googlePay: true,
    applePay: true,
    cash: true
  }
};
