export type OrderStatus = 'pending' | 'in_progress' | 'ready' | 'completed' | 'cancelled';

export interface OrderItem {
  recipeId: string;
  recipeName: string;
  quantity: number;
  unitPrice: number;
  category?: string;
  notes?: string;
}

export interface Order {
  id: string;
  restaurantId: string;
  orderNumber: number;        // np. 101, 102
  tableNumber: string;        // np. "Stolik 3", "Bar", "Wynos"
  items: OrderItem[];
  totalPrice: number;
  status: OrderStatus;
  stockDeducted: boolean;     // Zabezpieczenie przed podwójnym odpisaniem składników
  createdAt: string;          // ISO timestamp
  updatedAt: string;          // ISO timestamp
}

export interface CreateOrderDto {
  tableNumber?: string;
  items: OrderItem[];
}
