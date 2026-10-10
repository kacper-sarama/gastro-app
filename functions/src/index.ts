import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

admin.initializeApp();
const db = admin.firestore();

// Klucz prywatny pobierany ze zmiennych środowiskowych Firebase Secret Manager / env,
// z bezpiecznym fallbackiem na sandbox/testowy klucz Stripe.
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || 'sk_test_mock_gastro_stripe_secret_key_2026';
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16',
});

/**
 * 1. Tworzenie PaymentIntent w Stripe (dla BLIK, Kart, Apple Pay, Google Pay)
 * Bezpiecznie wywoływane przez aplikację gościa przed finalizacją płatności.
 */
export const createPaymentIntent = functions.https.onRequest(async (req, res) => {
  // CORS nagłówki
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Metoda niedozwolona. Użyj POST.' });
    return;
  }

  try {
    const { 
      amount, 
      currency = 'pln', 
      orderId, 
      orderNumber, 
      restaurantId, 
      tableNumber,
      paymentMethodType = 'blik'
    } = req.body;

    if (!amount || amount <= 0) {
      res.status(400).json({ error: 'Nieprawidłowa kwota zamówienia.' });
      return;
    }

    // Kwota w groszach (np. 35.50 zł -> 3550 gr)
    const amountInCents = Math.round(Number(amount) * 100);

    // Konfiguracja dopuszczalnych typów metod płatności
    const paymentMethodTypes = paymentMethodType === 'blik' 
      ? ['blik'] 
      : ['card', 'blik'];

    // Utwórz transakcję w Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: currency.toLowerCase(),
      payment_method_types: paymentMethodTypes,
      metadata: {
        orderId: orderId || '',
        orderNumber: String(orderNumber || ''),
        restaurantId: restaurantId || '',
        tableNumber: tableNumber || '',
        platform: 'GastroApp'
      },
      description: `GastroApp #${orderNumber} (${tableNumber})`
    });

    res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency
    });

  } catch (error: any) {
    console.error('Błąd tworzenia Stripe PaymentIntent:', error);
    res.status(500).json({
      error: error.message || 'Wystąpił błąd podczas inicjalizacji płatności w Stripe.'
    });
  }
});

/**
 * 2. Webhook Stripe (Powiadomienia o zmianie statusu płatności)
 * Stripe automatycznie wysyła powiadomienie HTTP POST po zatwierdzeniu transakcji (np. w aplikacji banku).
 */
export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event: Stripe.Event;

  try {
    if (stripeWebhookSecret && sig) {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        stripeWebhookSecret
      );
    } else {
      // Dla środowisk lokalnych/deweloperskich bez skonfigurowanego klucza podpisu webhooka
      event = req.body as Stripe.Event;
    }
  } catch (err: any) {
    console.error(`Błąd weryfikacji podpisu webhooka: ${err.message}`);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  // Obsługa zdarzeń ze Stripe
  switch (event.type) {
    // 🟢 Sukces autoryzacji płatności (BLIK zatwierdzony w banku lub karta obciążona)
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const meta = paymentIntent.metadata || {};
      const orderId = meta.orderId;

      console.log(`Płatność zatwierdzona: ${paymentIntent.id} dla zamówienia ${orderId}`);

      if (orderId) {
        try {
          const orderRef = db.collection('orders').doc(orderId);
          await orderRef.update({
            paid: true,
            paidAt: new Date().toISOString(),
            paymentMethod: `Stripe (${paymentIntent.payment_method_types?.[0]?.toUpperCase() || 'ONLINE'})`,
            stripePaymentIntentId: paymentIntent.id,
            status: 'pending' // Zamówienie trafia na tablicę KDS w kuchni
          });
          console.log(`Zaktualizowano status zamówienia ${orderId} na opłacone w Firestore.`);
        } catch (dbErr) {
          console.error(`Błąd aktualizacji zamówienia ${orderId} w Firestore:`, dbErr);
        }
      }
      break;
    }

    // 🔴 Odrzucenie transakcji (np. brak środków, zły kod BLIK, odrzucono w banku)
    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const meta = paymentIntent.metadata || {};
      const orderId = meta.orderId;
      console.warn(`Płatność odrzucona: ${paymentIntent.id} dla zamówienia ${orderId}`, paymentIntent.last_payment_error);

      if (orderId) {
        try {
          await db.collection('orders').doc(orderId).update({
            paid: false,
            paymentError: paymentIntent.last_payment_error?.message || 'Płatność odrzucona'
          });
        } catch (dbErr) {
          console.error(`Błąd aktualizacji nieudanej płatności ${orderId}:`, dbErr);
        }
      }
      break;
    }

    default:
      console.log(`Nieobsługiwany typ zdarzenia Stripe: ${event.type}`);
  }

  res.status(200).json({ received: true });
});
