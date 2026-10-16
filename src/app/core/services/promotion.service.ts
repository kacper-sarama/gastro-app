import { Injectable, inject, signal, computed, effect } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  onSnapshot,
  getDocs,
  writeBatch,
  Unsubscribe
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { InventoryService } from './inventory.service';
import { RecipeService } from './recipe.service';
import { ToastService } from './toast.service';
import {
  Promotion,
  PromotionRecommendation,
  PromotionValidationResult,
  PromotionType
} from '../models/promotion.model';
import { OrderItem } from '../models/order.model';
import { Recipe } from '../models/recipe.model';
import { InventoryItem } from '../models/inventory-item.model';

@Injectable({
  providedIn: 'root'
})
export class PromotionService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private inventoryService = inject(InventoryService);
  private recipeService = inject(RecipeService);
  private toastService = inject(ToastService);

  readonly promotions = signal<Promotion[]>([]);
  readonly isLoading = signal<boolean>(false);

  private firestoreUnsub: Unsubscribe | null = null;

  // --- Sygnały pomocnicze & KPI ---

  readonly activePromotions = computed(() =>
    this.promotions().filter(p => p.isActive)
  );

  readonly totalPromotionsCount = computed(() => this.promotions().length);

  readonly activePromotionsCount = computed(() => this.activePromotions().length);

  readonly totalUsagesCount = computed(() =>
    this.promotions().reduce((sum, p) => sum + (p.usageCount || 0), 0)
  );

  readonly totalDiscountGiven = computed(() =>
    this.promotions().reduce((sum, p) => sum + (p.totalDiscountGiven || 0), 0)
  );

  readonly totalRevenueGenerated = computed(() =>
    this.promotions().reduce((sum, p) => sum + (p.revenueGenerated || 0), 0)
  );

  // --- Inteligentny Asystent Rekomendacji (Smart Assistant Engine) ---
  readonly smartRecommendations = computed<PromotionRecommendation[]>(() => {
    const recipes = this.recipeService.recipes().filter(r => r.isAvailable !== false);
    const inventory = this.inventoryService.items();
    const currentPromos = this.promotions();
    const existingNames = new Set(currentPromos.map(p => p.name.toLowerCase()));

    const recommendations: PromotionRecommendation[] = [];

    // 1. Rekomendacja ZERO WASTE: Analiza nadmiaru składników w magazynie
    const highStockItem = inventory
      .filter((item: InventoryItem) => item.amount > item.minAmount * 2)
      .sort((a: InventoryItem, b: InventoryItem) => (b.amount / (b.minAmount || 1)) - (a.amount / (a.minAmount || 1)))[0];

    if (highStockItem) {
      // Znajdź przepis wykorzystujący ten surowiec
      const matchingRecipe = recipes.find(r =>
        r.ingredients.some(ing => ing.inventoryItemId === highStockItem.id)
      );

      const promoName = matchingRecipe
        ? `Zero Waste: ${matchingRecipe.name} -20%`
        : `Zero Waste: Extra ${highStockItem.name} za 1 zł`;

      if (!existingNames.has(promoName.toLowerCase())) {
        recommendations.push({
          type: 'happy_hours',
          name: promoName,
          description: `Wykorzystaj nadmiarowy zapas składnika "${highStockItem.name}". Podnieś sprzedaż dań bazujących na tym surowcu przed utratą świeżości.`,
          badgeText: 'ZERO WASTE 🌿',
          reason: `Wysoki stan magazynowy: ${highStockItem.name} (${highStockItem.amount} ${highStockItem.unit}). Zalecane zwiększenie rotacji.`,
          estimatedImpact: `Szybsze zużycie zapasu + szacunkowo ~350 zł obrotu tygodniowo`,
          condition: {
            requiredRecipeIds: matchingRecipe ? [matchingRecipe.id] : undefined,
            requiredQuantity: 1
          },
          reward: {
            rewardType: 'discount_percent',
            discountValue: 20
          }
        });
      }
    }

    // 2. Rekomendacja UPSELL / ZESTAW (Wysoka marża: Desery, Dodatki, Napoje)
    const upsellCandidates = recipes.filter(r => {
      const cat = (r.category || '').toLowerCase();
      return (
        cat.includes('deser') ||
        cat.includes('napój') ||
        cat.includes('napoj') ||
        cat.includes('focaccia') ||
        cat.includes('dodatk') ||
        (r.sellingPrice && r.sellingPrice <= 18)
      );
    });

    const chosenUpsell = upsellCandidates[0];
    if (chosenUpsell) {
      const promoName = `Kombo z Deserem/Dodatkiem: ${chosenUpsell.name} za 4 zł`;
      if (!existingNames.has(promoName.toLowerCase())) {
        recommendations.push({
          type: 'upsell',
          name: promoName,
          description: `Przy zamówieniu dowolnego dania głównego, klient może dobrać "${chosenUpsell.name}" w promocyjnej cenie 4,00 zł.`,
          badgeText: 'HIT MARŻOWY ⭐',
          reason: `Pozycje w kategorii ${chosenUpsell.category || 'dodatków'} mają najwyższą marżę procentową. Podnosi średni rachunek bez zauważalnego kosztu surowców.`,
          estimatedImpact: `Podniesienie średniego koszyka o +4 zł na każde 3. zamówienie`,
          condition: {
            minOrderValue: 25,
            requiredQuantity: 1
          },
          reward: {
            rewardType: 'special_price_item',
            rewardRecipeId: chosenUpsell.id,
            rewardRecipeName: chosenUpsell.name,
            specialPrice: 4.0
          }
        });
      }
    }

    // 3. Rekomendacja BOGO (Drugi produkt -50% / Wtorkowy Hit na wzór gigantów)
    const mainCategories = Array.from(
      new Set(
        recipes
          .filter(r => {
            const cat = (r.category || '').toLowerCase();
            return !cat.includes('deser') && !cat.includes('napój') && (r.sellingPrice || 0) >= 20;
          })
          .map(r => r.category)
      )
    );

    const targetCategory = mainCategories[0] || 'Pizza Rossa';
    const bogoName = `Wtorkowy Hit: Druga ${targetCategory} -50%`;
    if (!existingNames.has(bogoName.toLowerCase())) {
      recommendations.push({
        type: 'bogo',
        name: bogoName,
        description: `Kup 2 pozycje z kategorii "${targetCategory}", a na drugą (tańszą) naliczony zostanie rabat 50%.`,
        badgeText: 'KLASYK GASTRO 🔥',
        reason: `Mechanizm psychologiczny sprawdzony przez KFC i McDonald's – skłania gości do zamawiania w parach i zapełnia lokal w martwe dni.`,
        estimatedImpact: `Zwiększenie wolumenu sprzedaży dań głównych o ~25-35%`,
        condition: {
          requiredCategory: targetCategory,
          requiredQuantity: 2,
          applicableDays: [2] // Wtorki
        },
        reward: {
          rewardType: 'discount_percent',
          discountValue: 50
        }
      });
    }

    // 4. Rekomendacja PRÓG KOSZYKA (Threshold Bonus: Od 85 zł rabat 12 zł)
    const thresholdName = 'Duży Rachunek: Zamów za min. 85 zł, odbierz -12 zł';
    if (!existingNames.has(thresholdName.toLowerCase())) {
      recommendations.push({
        type: 'threshold_bonus',
        name: thresholdName,
        description: 'Zachęć gości do dobrania dodatkowego sosu lub napoju, aby przekroczyć próg 85 zł i odebrać rabat 12 zł.',
        badgeText: 'WZROST KOSZYKA 🚀',
        reason: 'Eliminuje porzucanie dodatków i podbija średnią wartość zamówienia (AOV) w godzinach szczytu.',
        estimatedImpact: 'Wzrost średniego rachunku z ~60 zł na ponad 85 zł',
        condition: {
          minOrderValue: 85
        },
        reward: {
          rewardType: 'discount_amount',
          discountValue: 12
        }
      });
    }

    return recommendations;
  });

  constructor() {
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        this.initFirestoreSubscription(user.uid);
      } else {
        this.cleanupState();
      }
    });
  }

  private cleanupState(): void {
    if (this.firestoreUnsub) {
      this.firestoreUnsub();
      this.firestoreUnsub = null;
    }
    this.promotions.set([]);
    this.isLoading.set(false);
  }

  private initFirestoreSubscription(restaurantId: string): void {
    this.isLoading.set(true);

    try {
      const col = collection(this.firestore, 'promotions');
      const q = query(col, where('restaurantId', '==', restaurantId));

      this.firestoreUnsub = onSnapshot(
        q,
        snapshot => {
          const loaded: Promotion[] = snapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<Promotion, 'id'>)
          }));

          // Sortuj: aktywne na górze, potem najnowsze
          loaded.sort((a, b) => {
            if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
          });

          this.promotions.set(loaded);
          this.isLoading.set(false);
        },
        error => {
          console.error('Błąd pobierania promocji z Firestore:', error);
          this.isLoading.set(false);
        }
      );
    } catch (err) {
      console.error('Błąd inicjalizacji subskrypcji promocji:', err);
      this.isLoading.set(false);
    }
  }

  // --- Walidacja i kalkulator rabatów w zamówieniu (POS) ---

  calculateValidationAndDiscount(
    promo: Promotion,
    items: OrderItem[]
  ): PromotionValidationResult {
    if (!promo.isActive) {
      return { isEligible: false, missingRequirementReason: 'Promocja jest nieaktywna.', discountAmount: 0 };
    }

    const now = new Date();
    const currentDay = now.getDay(); // 0 = niedziela, 1 = poniedziałek itd.

    // 1. Sprawdzenie dni tygodnia
    if (promo.condition.applicableDays && promo.condition.applicableDays.length > 0) {
      if (!promo.condition.applicableDays.includes(currentDay)) {
        const daysMap = ['niedziele', 'poniedziałki', 'wtorki', 'środy', 'czwartki', 'piątki', 'soboty'];
        const allowedDays = promo.condition.applicableDays.map(d => daysMap[d]).join(', ');
        return {
          isEligible: false,
          missingRequirementReason: `Obowiązuje tylko w: ${allowedDays}.`,
          discountAmount: 0
        };
      }
    }

    // 2. Sprawdzenie godzin (Happy Hours)
    if (promo.condition.startTime && promo.condition.endTime) {
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const [startH, startM] = promo.condition.startTime.split(':').map(Number);
      const [endH, endM] = promo.condition.endTime.split(':').map(Number);
      const startMinutes = startH * 60 + (startM || 0);
      const endMinutes = endH * 60 + (endM || 0);

      if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
        return {
          isEligible: false,
          missingRequirementReason: `Aktywna w godz. ${promo.condition.startTime} - ${promo.condition.endTime}.`,
          discountAmount: 0
        };
      }
    }

    // Oblicz sumę bieżących pozycji
    const currentSubtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

    // 3. Sprawdzenie progu kwotowego
    if (promo.condition.minOrderValue && promo.condition.minOrderValue > 0) {
      if (currentSubtotal < promo.condition.minOrderValue) {
        const diff = (promo.condition.minOrderValue - currentSubtotal).toFixed(2);
        return {
          isEligible: false,
          missingRequirementReason: `Brakuje jeszcze ${diff} zł do progu ${promo.condition.minOrderValue} zł.`,
          discountAmount: 0
        };
      }
    }

    // 4. Sprawdzenie wymaganych dań lub kategorii (np. BOGO: min 2 dania)
    let eligibleItems = items;
    if (promo.condition.requiredCategory) {
      eligibleItems = items.filter(
        i => (i.category || '').toLowerCase() === promo.condition.requiredCategory!.toLowerCase()
      );
    } else if (promo.condition.requiredRecipeIds && promo.condition.requiredRecipeIds.length > 0) {
      const allowedIds = new Set(promo.condition.requiredRecipeIds);
      eligibleItems = items.filter(i => allowedIds.has(i.recipeId));
    }

    const totalEligibleCount = eligibleItems.reduce((sum, i) => sum + i.quantity, 0);

    if (promo.condition.requiredQuantity && promo.condition.requiredQuantity > 0) {
      if (totalEligibleCount < promo.condition.requiredQuantity) {
        const missing = promo.condition.requiredQuantity - totalEligibleCount;
        const targetDesc = promo.condition.requiredCategory
          ? `dań z kategorii "${promo.condition.requiredCategory}"`
          : 'wymaganych dań';
        return {
          isEligible: false,
          missingRequirementReason: `Dodaj jeszcze ${missing} szt. ${targetDesc}.`,
          discountAmount: 0
        };
      }
    }

    // --- Wszystkie warunki spełnione! Oblicz rabat wg typu nagrody ---
    let discount = 0;
    let bonusCandidate: PromotionValidationResult['bonusItemCandidate'] = undefined;

    if (promo.type === 'bogo') {
      // BOGO: rabat na najtańsze danie z kwalifikujących się pozycji
      if (eligibleItems.length > 0) {
        // Rozwiń do pojedynczych sztuk, by znaleźć najtańszy pojedynczy egzemplarz
        const prices: number[] = [];
        eligibleItems.forEach(i => {
          for (let q = 0; q < i.quantity; q++) {
            prices.push(i.unitPrice);
          }
        });
        prices.sort((a, b) => a - b);
        const cheapestPrice = prices[0] || 0;
        const percent = promo.reward.discountValue || 50;
        discount = Math.round((cheapestPrice * (percent / 100)) * 100) / 100;
      }
    } else if (promo.reward.rewardType === 'discount_percent') {
      const percent = promo.reward.discountValue || 10;
      discount = Math.round((currentSubtotal * (percent / 100)) * 100) / 100;
    } else if (promo.reward.rewardType === 'discount_amount') {
      discount = Math.min(currentSubtotal, promo.reward.discountValue || 0);
    } else if (promo.reward.rewardType === 'special_price_item' || promo.reward.rewardType === 'free_item') {
      // Upsell / bonusowy produkt
      if (promo.reward.rewardRecipeId) {
        const recipe = this.recipeService.recipes().find(r => r.id === promo.reward.rewardRecipeId);
        const regularPrice = recipe?.sellingPrice || 12;
        const specialPrice = promo.reward.rewardType === 'free_item' ? 0 : (promo.reward.specialPrice ?? 4);

        bonusCandidate = {
          recipeId: promo.reward.rewardRecipeId,
          recipeName: promo.reward.rewardRecipeName || recipe?.name || 'Dodatek promocyjny',
          unitPrice: regularPrice,
          specialPrice: specialPrice,
          category: recipe?.category
        };

        // Jeśli produkt jest już w zamówieniu, rabatujemy różnicę do ceny specjalnej
        const itemAlreadyInCart = items.find(i => i.recipeId === promo.reward.rewardRecipeId);
        if (itemAlreadyInCart) {
          discount = Math.max(0, regularPrice - specialPrice);
        }
      }
    }

    return {
      isEligible: true,
      discountAmount: discount,
      bonusItemCandidate: bonusCandidate
    };
  }

  // --- Operacje CRUD ---

  async createPromotion(dto: Partial<Promotion>): Promise<string> {
    const user = this.authService.currentUser();
    if (!user) throw new Error('Musisz być zalogowany.');

    const now = new Date().toISOString();
    const data: Omit<Promotion, 'id'> = {
      restaurantId: user.uid,
      name: dto.name?.trim() || 'Nowa Promocja',
      description: dto.description?.trim() || '',
      code: dto.code ? dto.code.trim().toUpperCase() : '',
      badgeText: dto.badgeText || 'PROMOCJA 🏷️',
      type: dto.type || 'upsell',
      condition: dto.condition || {},
      reward: dto.reward || { rewardType: 'discount_percent', discountValue: 10 },
      isActive: dto.isActive !== false,
      usageCount: 0,
      totalDiscountGiven: 0,
      revenueGenerated: 0,
      isSmartRecommendation: !!dto.isSmartRecommendation,
      recommendationReason: dto.recommendationReason || '',
      createdAt: now,
      updatedAt: now
    };

    try {
      const col = collection(this.firestore, 'promotions');
      const docRef = await addDoc(col, this.cleanObject(data));
      this.toastService.success(`Dodano promocję: "${data.name}"`, 'Promocje');
      return docRef.id;
    } catch (e) {
      console.error('Błąd zapisu promocji:', e);
      this.toastService.danger('Nie udało się zapisać promocji.', 'Błąd');
      throw e;
    }
  }

  async updatePromotion(id: string, partial: Partial<Promotion>): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) throw new Error('Musisz być zalogowany.');

    const docRef = doc(this.firestore, `promotions/${id}`);
    const dataToSave = this.cleanObject({
      ...partial,
      updatedAt: new Date().toISOString()
    });

    try {
      await updateDoc(docRef, dataToSave);
      this.toastService.info('Zaktualizowano promocję.', 'Promocje');
    } catch (e) {
      console.error('Błąd aktualizacji promocji:', e);
      this.toastService.danger('Nie udało się zaktualizować promocji.', 'Błąd');
      throw e;
    }
  }

  async togglePromotion(id: string, currentStatus: boolean): Promise<void> {
    const nextStatus = !currentStatus;
    const docRef = doc(this.firestore, `promotions/${id}`);
    try {
      await updateDoc(docRef, {
        isActive: nextStatus,
        updatedAt: new Date().toISOString()
      });
      this.toastService.info(
        nextStatus ? 'Promocja została aktywowana.' : 'Promocja została wstrzymana.',
        'Status promocji'
      );
    } catch (e) {
      console.error('Błąd przełączania promocji:', e);
      this.toastService.danger('Błąd zmiany statusu.', 'Błąd');
    }
  }

  async deletePromotion(id: string): Promise<void> {
    try {
      const docRef = doc(this.firestore, `promotions/${id}`);
      await deleteDoc(docRef);
      this.toastService.warning('Usunięto promocję.', 'Promocje');
    } catch (e) {
      console.error('Błąd usuwania promocji:', e);
      this.toastService.danger('Nie udało się usunąć promocji.', 'Błąd');
    }
  }

  /**
   * Zwiększa licznik użyć i wygenerowany obrót po zrealizowaniu zamówienia
   */
  async recordPromotionUsage(
    promotionId: string,
    discountAmount: number,
    orderTotal: number
  ): Promise<void> {
    const target = this.promotions().find(p => p.id === promotionId);
    if (!target) return;

    const docRef = doc(this.firestore, `promotions/${promotionId}`);
    try {
      await updateDoc(docRef, {
        usageCount: (target.usageCount || 0) + 1,
        totalDiscountGiven: (target.totalDiscountGiven || 0) + (discountAmount || 0),
        revenueGenerated: (target.revenueGenerated || 0) + (orderTotal || 0),
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.warn('Nie udało się zapisać statystyk użycia promocji:', err);
    }
  }

  /**
   * Inicjalizuje lub resetuje zestaw przykładowych promocji dla konta demo lub nowego lokalu
   */
  async resetToStarter(restaurantId: string, recipes: Recipe[] = []): Promise<void> {
    const col = collection(this.firestore, 'promotions');
    const existingSnap = await getDocs(query(col, where('restaurantId', '==', restaurantId)));

    const batch = writeBatch(this.firestore);
    existingSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();

    // Wyszukaj potencjalne dania z menu lokalu do szablonów
    const pizzaRecipe = recipes.find(r => (r.category || '').toLowerCase().includes('pizza')) || recipes[0];
    const dessertRecipe = recipes.find(r => (r.category || '').toLowerCase().includes('deser')) || recipes[recipes.length - 1];

    const now = new Date().toISOString();
    const starterPromotions: Omit<Promotion, 'id'>[] = [
      {
        restaurantId,
        name: 'Wtorkowy Hit: Druga Pizza -50%',
        description: 'Kup 2 dowolne pizze, drugą (tańszą) otrzymasz za połowę ceny.',
        code: 'WTOR50',
        badgeText: 'HIT TYGODNIA 🔥',
        type: 'bogo',
        condition: {
          requiredCategory: pizzaRecipe?.category || 'Pizza Rossa (na czerwono)',
          requiredQuantity: 2,
          applicableDays: [2] // Wtorek
        },
        reward: {
          rewardType: 'discount_percent',
          discountValue: 50
        },
        isActive: true,
        usageCount: 28,
        totalDiscountGiven: 462.0,
        revenueGenerated: 2190.0,
        isSmartRecommendation: true,
        recommendationReason: 'Inspiracja Wtorkowym Kubełkiem KFC – zapełnia lokal w najspokojniejszy dzień tygodnia.',
        createdAt: now,
        updatedAt: now
      },
      {
        restaurantId,
        name: dessertRecipe ? `Zestaw Słodki: ${dessertRecipe.name} za 4 zł` : 'Zestaw Słodki: Deser za 4 zł',
        description: 'Przy zamówieniu dania głównego powyżej 30 zł, dobierz deser za jedyne 4,00 zł.',
        code: 'DESER4',
        badgeText: 'UPSELL GIGANTÓW ⭐',
        type: 'upsell',
        condition: {
          minOrderValue: 30,
          requiredQuantity: 1
        },
        reward: {
          rewardType: 'special_price_item',
          rewardRecipeId: dessertRecipe?.id || '',
          rewardRecipeName: dessertRecipe?.name || 'Włoski Deser',
          specialPrice: 4.0
        },
        isActive: true,
        usageCount: 44,
        totalDiscountGiven: 396.0,
        revenueGenerated: 1840.0,
        isSmartRecommendation: true,
        recommendationReason: 'Inspiracja McDonald\'s – dodatki o wysokiej marży podnoszą średni koszyk bez straty rentowności.',
        createdAt: now,
        updatedAt: now
      },
      {
        restaurantId,
        name: 'Duży Koszyk: Od 90 zł rabat 15 zł',
        description: 'Dla zamówień rodzinnych i grup – automatyczna zniżka 15 zł przy rachunku powyżej 90 zł.',
        code: 'DUZY90',
        badgeText: 'EKSTRA KOSZYK 🚀',
        type: 'threshold_bonus',
        condition: {
          minOrderValue: 90
        },
        reward: {
          rewardType: 'discount_amount',
          discountValue: 15
        },
        isActive: true,
        usageCount: 19,
        totalDiscountGiven: 285.0,
        revenueGenerated: 2050.0,
        isSmartRecommendation: false,
        createdAt: now,
        updatedAt: now
      },
      {
        restaurantId,
        name: 'Happy Hours: -15% w godz. 14:00 - 17:00',
        description: 'Ożyw popołudniowy dołek sprzedażowy. Rabat na całe zamówienie w godzinach 14:00-17:00.',
        code: 'HAPPY15',
        badgeText: 'HAPPY HOURS ⏰',
        type: 'happy_hours',
        condition: {
          startTime: '14:00',
          endTime: '17:00'
        },
        reward: {
          rewardType: 'discount_percent',
          discountValue: 15
        },
        isActive: true,
        usageCount: 31,
        totalDiscountGiven: 320.0,
        revenueGenerated: 2130.0,
        isSmartRecommendation: true,
        recommendationReason: 'Wypełnia martwe godziny między lunchem a kolacją.',
        createdAt: now,
        updatedAt: now
      }
    ];

    const newBatch = writeBatch(this.firestore);
    for (const promo of starterPromotions) {
      const newDocRef = doc(col);
      newBatch.set(newDocRef, this.cleanObject(promo));
    }
    await newBatch.commit();
  }

  private cleanObject(obj: any): any {
    const cleaned: any = {};
    for (const key of Object.keys(obj)) {
      if (obj[key] !== undefined) {
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          cleaned[key] = this.cleanObject(obj[key]);
        } else {
          cleaned[key] = obj[key];
        }
      }
    }
    return cleaned;
  }
}
