export type PromotionType = 
  | 'upsell'            // Dodatek za grosze (np. Do dania głównego frytki/napój za 4 zł)
  | 'bogo'              // Drugi produkt za pół ceny / 1 zł (np. Druga pizza -50%)
  | 'combo'             // Zestaw kombo w stałej cenie (np. Pizza + Deser za 45 zł)
  | 'threshold_bonus'   // Próg koszyka (np. Od 80 zł deser gratis / -15 zł)
  | 'happy_hours'       // Happy Hours / Wybrane godziny (np. Wtorki 14:00-17:00 rabat 20%)
  | 'code_discount';    // Kod rabatowy (np. START15 - 15% rabatu)

export interface PromotionCondition {
  minOrderValue?: number;          // Min. wartość zamówienia w PLN
  requiredRecipeIds?: string[];    // Konkretne pozycje wymagane w zamówieniu
  requiredCategory?: string;       // Wymagana kategoria (np. "Pizza Rossa", "Burgery")
  requiredQuantity?: number;       // Wymagana min. liczba dań z kategorii/listy (np. 2)
  applicableDays?: number[];       // Dni tygodnia (0 = niedziela, 1 = poniedziałek, 2 = wtorek itd.)
  startTime?: string;              // Format "HH:mm", np. "14:00"
  endTime?: string;                // Format "HH:mm", np. "17:00"
}

export interface PromotionReward {
  rewardType: 'discount_percent' | 'discount_amount' | 'special_price_item' | 'free_item';
  discountValue?: number;          // np. 20 (dla 20%) lub 15 (dla 15 zł)
  rewardRecipeId?: string;         // ID dania bonusowego/dodawanego
  rewardRecipeName?: string;       // Nazwa dania bonusowego
  specialPrice?: number;           // Promocyjna cena (np. 1 zł lub 3 zł)
}

export interface Promotion {
  id: string;
  restaurantId: string;
  name: string;                    // np. "Wtorkowy Hit: Druga Pizza -50%"
  description: string;             // Opis dla kelnera / klienta
  code?: string;                   // Opcjonalny krótki kod np. "BOGO50"
  badgeText?: string;              // Etykieta, np. "HOT 🔥", "ZERO WASTE 🌿", "ZESTAW ⭐", "HAPPY HOURS ⏰"
  type: PromotionType;
  condition: PromotionCondition;
  reward: PromotionReward;
  isActive: boolean;
  usageCount: number;              // Licznik użyć w zamówieniach
  totalDiscountGiven: number;      // Łączna wartość udzielonych rabatów w PLN
  revenueGenerated: number;        // Łączny obrót zamówień z tą promocją w PLN
  isSmartRecommendation?: boolean; // Czy wygenerowane przez inteligentnego asystenta
  recommendationReason?: string;   // Uzasadnienie biznesowe
  createdAt: string;
  updatedAt: string;
}

export interface PromotionRecommendation {
  type: PromotionType;
  name: string;
  description: string;
  badgeText: string;
  reason: string;
  estimatedImpact: string;
  condition: PromotionCondition;
  reward: PromotionReward;
}

export interface PromotionValidationResult {
  isEligible: boolean;
  missingRequirementReason?: string;
  discountAmount: number;
  bonusItemCandidate?: {
    recipeId: string;
    recipeName: string;
    unitPrice: number;
    specialPrice: number;
    category?: string;
  };
}
