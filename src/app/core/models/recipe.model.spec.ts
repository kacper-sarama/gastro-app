import { Recipe, calculateRecipeCapacity } from './recipe.model';
import { InventoryItem } from './inventory-item.model';

describe('calculateRecipeCapacity (Kitchen Capacity Simulator)', () => {
  const mockInventory: InventoryItem[] = [
    { id: 'ing-flour', restaurantId: 'r1', name: 'Mąka typ 00', amount: 5000, unit: 'g', minAmount: 1000 },
    { id: 'ing-sauce', restaurantId: 'r1', name: 'Sos pomidorowy', amount: 2000, unit: 'ml', minAmount: 500 },
    { id: 'ing-mozzarella', restaurantId: 'r1', name: 'Mozzarella', amount: 3000, unit: 'g', minAmount: 1000 }
  ];

  const margheritaRecipe: Recipe = {
    id: 'rec-1',
    restaurantId: 'r1',
    name: 'Pizza Margherita',
    category: 'Pizza Rossa',
    sellingPrice: 34,
    ingredients: [
      { inventoryItemId: 'ing-flour', amount: 250 },      // 5000 / 250 = 20 porcji
      { inventoryItemId: 'ing-sauce', amount: 100 },      // 2000 / 100 = 20 porcji
      { inventoryItemId: 'ing-mozzarella', amount: 150 }  // 3000 / 150 = 20 porcji
    ],
    updatedAt: new Date().toISOString()
  };

  it('powinien zwrócić status "blocked" i 0 porcji, gdy receptura nie ma zdefiniowanych składników', () => {
    const emptyRecipe: Recipe = { ...margheritaRecipe, ingredients: [] };
    const result = calculateRecipeCapacity(emptyRecipe, mockInventory);

    expect(result.maxPortions).toBe(0);
    expect(result.status).toBe('blocked');
    expect(result.ingredientDetails.length).toBe(0);
  });

  it('powinien poprawnie wyliczyć maksymalną liczbę dań, gdy stan magazynowy jest wysoki', () => {
    const result = calculateRecipeCapacity(margheritaRecipe, mockInventory);

    expect(result.maxPortions).toBe(20);
    expect(result.status).toBe('available');
    expect(result.ingredientDetails.length).toBe(3);
  });

  it('powinien precyzyjnie zidentyfikować wąskie gardło (bottleneck), gdy jeden ze składników jest na wyczerpaniu', () => {
    // Zmniejszamy stan mozzarelli do 300g (300 / 150 = 2 porcje)
    const limitedInventory: InventoryItem[] = [
      mockInventory[0], // mąka -> 20 porcji
      mockInventory[1], // sos -> 20 porcji
      { ...mockInventory[2], amount: 300 } // mozzarella -> 2 porcje
    ];

    const result = calculateRecipeCapacity(margheritaRecipe, limitedInventory);

    expect(result.maxPortions).toBe(2);
    expect(result.status).toBe('low'); // <= 5 porcji to status 'low'
    expect(result.bottleneckIngredient).toBeDefined();
    expect(result.bottleneckIngredient?.name).toBe('Mozzarella');
    expect(result.bottleneckIngredient?.currentStock).toBe(300);
  });

  it('powinien zablokować danie (status "blocked"), gdy choć jeden kluczowy składnik ma stan 0', () => {
    const zeroInventory: InventoryItem[] = [
      mockInventory[0],
      mockInventory[1],
      { ...mockInventory[2], amount: 0 } // brak sera!
    ];

    const result = calculateRecipeCapacity(margheritaRecipe, zeroInventory);

    expect(result.maxPortions).toBe(0);
    expect(result.status).toBe('blocked');
    expect(result.bottleneckIngredient?.name).toBe('Mozzarella');
  });
});
