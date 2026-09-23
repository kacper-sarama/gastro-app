import { InventoryItem, InventoryUnit, formatStockAmount } from './inventory-item.model';

export interface RecipeIngredient {
  inventoryItemId: string; // ID powiązanego surowca z magazynu
  amount: number;          // Wymagana ilość na 1 porcję w jednostce bazowej (g, ml, szt)
}

export interface Recipe {
  id: string;
  restaurantId: string;
  name: string;             // np. "Pizza Margherita 32cm"
  category: string;         // np. "Pizza", "Makarony", "Sosy", "Desery", "Napoje"
  description?: string;
  sellingPrice?: number;    // Cena w karcie menu (PLN)
  ingredients: RecipeIngredient[];
  createdAt?: string;
  updatedAt: string;
}

/**
 * Prosty model danych przesyłanych z formularza receptury (bez id i metadanych)
 */
export interface RecipeFormData {
  name: string;
  category: string;
  description?: string;
  sellingPrice?: number;
  ingredients: RecipeIngredient[];
}

export interface IngredientCapacityDetail {
  inventoryItem?: InventoryItem;
  neededPerPortion: number;
  currentStock: number;
  unit: InventoryUnit;
  possiblePortions: number;
  isBottleneck: boolean;
}

export type RecipePortionStatus = 'available' | 'low' | 'blocked';

export interface RecipeCapacityResult {
  maxPortions: number;
  status: RecipePortionStatus;
  bottleneckIngredient?: {
    name: string;
    currentStock: number;
    neededPerPortion: number;
    unit: InventoryUnit;
  };
  ingredientDetails: IngredientCapacityDetail[];
}

/**
 * Symulator wydajności kuchni:
 * Oblicza, ile porcji danego dania kuchnia może przygotować z aktualnego stanu magazynu
 * i wskazuje składnik, którego brakuje najbardziej (wąskie gardło).
 */
export function calculateRecipeCapacity(
  recipe: Recipe,
  inventoryItems: InventoryItem[]
): RecipeCapacityResult {
  // Jeśli receptura nie ma składników, nie można wydać żadnej porcji
  if (!recipe.ingredients || recipe.ingredients.length === 0) {
    return {
      maxPortions: 0,
      status: 'blocked',
      ingredientDetails: []
    };
  }

  // 1. Stwórz szybki słownik surowców [id -> surowiec]
  const itemsMap = new Map<string, InventoryItem>(
    inventoryItems.map(item => [item.id, item])
  );

  // 2. Przelicz wydajność dla każdego składnika z osobna
  const ingredientDetails: IngredientCapacityDetail[] = recipe.ingredients.map(ing => {
    const item = itemsMap.get(ing.inventoryItemId);
    const currentStock = item ? Math.max(0, item.amount) : 0;
    const unit: InventoryUnit = item ? item.unit : 'g';
    const needed = Math.max(0.001, ing.amount); // zapobieganie dzieleniu przez zero

    const possiblePortions = Math.floor(currentStock / needed);

    return {
      inventoryItem: item,
      neededPerPortion: ing.amount,
      currentStock,
      unit,
      possiblePortions,
      isBottleneck: false
    };
  });

  // 3. Maksymalna liczba gotowych porcji to NAJMNIEJSZA wartość ze wszystkich składników
  const portionsList = ingredientDetails.map(d => d.possiblePortions);
  const maxPortions = portionsList.length > 0 ? Math.min(...portionsList) : 0;

  // 4. Oznacz składniki, które są wąskim gardłem (blokują lub limitują wydanie)
  let bottleneckItem: InventoryItem | undefined;
  let bottleneckNeeded = 0;

  for (const detail of ingredientDetails) {
    if (detail.possiblePortions === maxPortions) {
      detail.isBottleneck = true;
      if (!bottleneckItem && detail.inventoryItem) {
        bottleneckItem = detail.inventoryItem;
        bottleneckNeeded = detail.neededPerPortion;
      }
    }
  }

  // 5. Określ status dostępności dania
  let status: RecipePortionStatus = 'available';
  if (maxPortions === 0) {
    status = 'blocked';
  } else if (maxPortions <= 5) {
    status = 'low';
  }

  return {
    maxPortions,
    status,
    bottleneckIngredient: bottleneckItem ? {
      name: bottleneckItem.name,
      currentStock: bottleneckItem.amount,
      neededPerPortion: bottleneckNeeded,
      unit: bottleneckItem.unit
    } : undefined,
    ingredientDetails
  };
}
