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
 * Oblicza ile porcji danego dania kuchnia może przygotować z aktualnego stanu magazynu,
 * oraz identyfikuje składnik limitujący (wąskie gardło).
 */
export function calculateRecipeCapacity(
  recipe: Recipe,
  inventoryItems: InventoryItem[]
): RecipeCapacityResult {
  if (!recipe.ingredients || recipe.ingredients.length === 0) {
    return {
      maxPortions: 0,
      status: 'blocked',
      ingredientDetails: []
    };
  }

  const itemsMap = new Map<string, InventoryItem>(
    inventoryItems.map(item => [item.id, item])
  );

  let minPortions = Infinity;
  let bottleneckItem: InventoryItem | undefined;
  let bottleneckNeeded = 0;

  const ingredientDetails: IngredientCapacityDetail[] = [];

  for (const ing of recipe.ingredients) {
    const item = itemsMap.get(ing.inventoryItemId);
    const currentStock = item ? Math.max(0, item.amount) : 0;
    const unit: InventoryUnit = item ? item.unit : 'g';
    const needed = Math.max(0.001, ing.amount);

    const possible = Math.floor(currentStock / needed);

    ingredientDetails.push({
      inventoryItem: item,
      neededPerPortion: ing.amount,
      currentStock,
      unit,
      possiblePortions: possible,
      isBottleneck: false
    });

    if (possible < minPortions) {
      minPortions = possible;
      bottleneckItem = item;
      bottleneckNeeded = ing.amount;
    }
  }

  const maxPortions = minPortions === Infinity ? 0 : minPortions;

  // Oznacz składniki będące wąskim gardłem
  ingredientDetails.forEach(detail => {
    if (detail.possiblePortions === maxPortions) {
      detail.isBottleneck = true;
    }
  });

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
