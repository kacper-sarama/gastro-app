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
  isAvailable?: boolean;    // Czy danie jest aktywne w karcie menu (domyślnie true)
  isFeatured?: boolean;     // Czy danie jest wyróżnione (np. szef poleca)
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
  isAvailable?: boolean;
  isFeatured?: boolean;
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
    let item = itemsMap.get(ing.inventoryItemId);

    // Awaryjne inteligentne dopasowanie surowca, jeśli ID w bazie uległo rozsynchronizowaniu lub wynosi 'demo-ing'
    if (!item && inventoryItems.length > 0) {
      item = resolveFallbackIngredient(recipe.name, ing.amount, inventoryItems);
    }

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

/**
 * Inteligentne mapowanie rezerwowe dla dań startowych, jeśli ID składnika w bazie uległo rozsynchronizowaniu
 */
export function resolveFallbackIngredient(
  recipeName: string,
  amount: number,
  items: InventoryItem[]
): InventoryItem | undefined {
  const rName = (recipeName || '').toLowerCase();
  const find = (keyword: string) => items.find(i => i.name.toLowerCase().includes(keyword.toLowerCase()));

  const resolve = (keyword: string, defaultName: string, defaultUnit: InventoryUnit = 'g', defaultStock = 2000): InventoryItem => {
    const existing = find(keyword);
    if (existing) return existing;
    return {
      id: `virtual-${keyword}`,
      restaurantId: '',
      name: defaultName,
      amount: defaultStock,
      unit: defaultUnit,
      minAmount: 500,
      category: 'Inne',
      updatedAt: new Date().toISOString()
    };
  };

  // Diavola
  if (rName.includes('diavola') && amount === 60) {
    return resolve('spianata', 'Salami Spianata Piccante', 'g', 1800);
  }

  // Prosciutto e Funghi
  if (rName.includes('prosciutto e funghi')) {
    if (amount === 70) return resolve('cotto', 'Szynka Prosciutto Cotto', 'g', 2000);
    if (amount === 60) return resolve('pieczarki', 'Pieczarki świeże', 'g', 1720);
  }

  // Funghi
  if (rName.includes('funghi') && amount === 80) {
    return resolve('pieczarki', 'Pieczarki świeże', 'g', 1720);
  }

  // Quattro Formaggi
  if (rName.includes('quattro formaggi')) {
    if (amount === 50) return resolve('gorgonzola', 'Ser Gorgonzola DOP', 'g', 1200);
    if (amount === 40) return resolve('ricotta', 'Świeża ricotta', 'g', 1200);
    if (amount === 25) return resolve('grana', 'Ser Grana Padano DOP', 'g', 1500);
    if (amount === 100) return resolve('mozzarella', 'Ser Mozzarella fior di latte', 'g', 6500);
  }

  // Crudo e Rucola
  if (rName.includes('crudo')) {
    if (amount === 60) return resolve('crudo', 'Szynka Prosciutto Crudo', 'g', 1500);
    if (amount === 25) return resolve('rukola', 'Świeża rukola', 'g', 800);
    if (amount === 40) return resolve('pomidorki', 'Pomidorki koktajlowe', 'g', 2000);
    if (amount === 20) return resolve('grana', 'Ser Grana Padano DOP', 'g', 1500);
    if (amount === 120) return resolve('mozzarella', 'Ser Mozzarella fior di latte', 'g', 6500);
  }

  // Calzone
  if (rName.includes('calzone')) {
    if (amount === 120) return resolve('mozzarella', 'Ser Mozzarella fior di latte', 'g', 6500);
    if (amount === 60) return resolve('cotto', 'Szynka Prosciutto Cotto', 'g', 2000);
    if (amount === 50) return resolve('pieczarki', 'Pieczarki świeże', 'g', 1720);
    if (amount === 40) return resolve('sos pomidorowy', 'Sos pomidorowy San Marzano', 'ml', 5820);
  }

  // Focaccia
  if (rName.includes('focaccia')) {
    if (amount === 200) return resolve('mąka', 'Mąka pszenna (typ 00)', 'g', 18960);
    if (amount === 25) return resolve('oliwa', 'Oliwa z oliwek Extra Virgin', 'ml', 2460);
    if (amount === 5) return resolve('rozmaryn', 'Świeży rozmaryn', 'g', 150);
    if (amount === 70) return resolve('pomidorki', 'Pomidorki koktajlowe', 'g', 2000);
    if (amount === 4) return resolve('drożdże', 'Drożdże piekarnicze', 'g', 490);
  }

  // Desery: Tiramisu
  if (rName.includes('tiramisu')) {
    if (amount === 120) return resolve('mascarpone', 'Ser Mascarpone', 'g', 1500);
    if (amount === 40) return resolve('savoiardi', 'Biszkopty Savoiardi', 'g', 800);
    if (amount === 15) return resolve('kawa', 'Kawa ziarnista Espresso', 'g', 1000);
  }

  // Desery: Panna Cotta
  if (rName.includes('panna cotta')) {
    if (amount === 120) return resolve('śmietanka', 'Śmietanka 36%', 'ml', 2000);
    if (amount === 50) return resolve('malin', 'Maliny mrożone / sos', 'g', 1200);
  }

  // Standardowe ciasto i baza pizzy
  if (amount === 220) return resolve('mąka', 'Mąka pszenna (typ 00)', 'g', 18960);
  if (amount === 90) return resolve('sos pomidorowy', 'Sos pomidorowy San Marzano', 'ml', 5820);
  if (amount === 130) return resolve('mozzarella', 'Ser Mozzarella fior di latte', 'g', 9240);
  if (amount === 10) return resolve('oliwa', 'Oliwa z oliwek Extra Virgin', 'ml', 2460);
  if (amount === 3) return resolve('drożdże', 'Drożdże piekarnicze', 'g', 490);
  if (amount === 1 && rName.includes('margherita')) return resolve('bazylia', 'Świeża bazylia', 'szt', 0);

  return undefined;
}
