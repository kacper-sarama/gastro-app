import { InventoryItem, getStockStatus, formatStockAmount } from './inventory-item.model';

describe('Inventory Item Logic & Formatting', () => {
  describe('getStockStatus', () => {
    it('powinien zwrócić status "out", gdy stan wynosi 0 lub mniej', () => {
      const itemZero: InventoryItem = {
        id: '1',
        restaurantId: 'rest1',
        name: 'Mąka Caputo',
        amount: 0,
        unit: 'g',
        minAmount: 5000
      };
      expect(getStockStatus(itemZero)).toBe('out');

      const itemNegative: InventoryItem = { ...itemZero, amount: -100 };
      expect(getStockStatus(itemNegative)).toBe('out');
    });

    it('powinien zwrócić status "low", gdy stan jest większy od zera, ale mniejszy bądź równy minAmount', () => {
      const itemLow: InventoryItem = {
        id: '2',
        restaurantId: 'rest1',
        name: 'Mozzarella fior di latte',
        amount: 2000,
        unit: 'g',
        minAmount: 3000
      };
      expect(getStockStatus(itemLow)).toBe('low');

      const itemExactLimit: InventoryItem = { ...itemLow, amount: 3000 };
      expect(getStockStatus(itemExactLimit)).toBe('low');
    });

    it('powinien zwrócić status "ok", gdy stan przekracza minAmount', () => {
      const itemOk: InventoryItem = {
        id: '3',
        restaurantId: 'rest1',
        name: 'Sos pomidorowy San Marzano',
        amount: 15000,
        unit: 'ml',
        minAmount: 5000
      };
      expect(getStockStatus(itemOk)).toBe('ok');
    });
  });

  describe('formatStockAmount', () => {
    it('powinien sformatować gramy na kilogramy, gdy wartość >= 1000g', () => {
      const result = formatStockAmount(3500, 'g');
      expect(result.display).toContain('kg');
      expect(result.raw).toBe('3500 g');
    });

    it('powinien zachować format gramów, gdy wartość < 1000g', () => {
      const result = formatStockAmount(750, 'g');
      expect(result.display).toBe('750 g');
      expect(result.raw).toBe('750 g');
    });

    it('powinien sformatować mililitry na litry, gdy wartość >= 1000ml', () => {
      const result = formatStockAmount(2500, 'ml');
      expect(result.display).toContain('l');
      expect(result.raw).toBe('2500 ml');
    });

    it('powinien formatować sztuki bez przeliczania', () => {
      const result = formatStockAmount(24, 'szt');
      expect(result.display).toBe('24 szt');
      expect(result.raw).toBe('24 szt');
    });
  });
});
