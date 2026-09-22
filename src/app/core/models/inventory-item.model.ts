export type InventoryUnit = 'g' | 'ml' | 'szt';

export interface InventoryItem {
  id: string;
  restaurantId: string;
  name: string;
  amount: number;       // Zawsze w jednostce bazowej: g, ml, szt
  unit: InventoryUnit;  // 'g' | 'ml' | 'szt'
  minAmount: number;    // Próg alarmowy w jednostce bazowej
  category?: string;    // Opcjonalna kategoria magazynowa (np. Nabiał, Suche, Warzywa)
  updatedAt?: string | Date;
}

export type StockStatus = 'ok' | 'low' | 'out';

export function getStockStatus(item: InventoryItem): StockStatus {
  if (item.amount <= 0) {
    return 'out';
  }
  if (item.amount <= item.minAmount) {
    return 'low';
  }
  return 'ok';
}

/**
 * Inteligentne formatowanie jednostek dla czytelności w UI
 * np. 3500g -> "3.5 kg" (3500 g)
 * np. 2000ml -> "2 l" (2000 ml)
 */
export function formatStockAmount(amount: number, unit: InventoryUnit): { display: string; raw: string } {
  if (unit === 'g') {
    if (amount >= 1000) {
      const kg = (amount / 1000).toLocaleString('pl-PL', { maximumFractionDigits: 2 });
      return { display: `${kg} kg`, raw: `${amount} g` };
    }
    return { display: `${amount} g`, raw: `${amount} g` };
  }

  if (unit === 'ml') {
    if (amount >= 1000) {
      const l = (amount / 1000).toLocaleString('pl-PL', { maximumFractionDigits: 2 });
      return { display: `${l} l`, raw: `${amount} ml` };
    }
    return { display: `${amount} ml`, raw: `${amount} ml` };
  }

  return { display: `${amount} szt`, raw: `${amount} szt` };
}
