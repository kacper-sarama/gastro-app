export type TableStatus = 'free' | 'occupied' | 'bill_requested' | 'dirty';

export interface RestaurantTable {
  id: string;
  restaurantId: string;
  number: string;               // np. "Stolik 1", "Stolik 2", "Bar 1", "Ogródek 3"
  zone: string;                 // np. "Sala Główna", "Ogródek Letni", "Bar / Hokeje", "Antresola VIP"
  seats: number;                // Liczba miejsc: 2, 4, 6, 8
  status: TableStatus;
  currentOrderId?: string;      // ID powiązanego zamówienia
  currentOrderNumber?: number;  // np. #106
  currentOrderTotal?: number;   // np. 142.50 zł
  currentOrderItemsCount?: number;
  occupiedSince?: string;       // ISO timestamp rozpoczęcia obsługi
  notes?: string;               // np. "Przy oknie", "Rezerwacja na 20:00"
  createdAt?: string;
  updatedAt?: string;
}

export interface TableZone {
  id: string;
  name: string;
  icon?: string;
}
