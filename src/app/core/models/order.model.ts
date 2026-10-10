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
  appliedPromotionId?: string;
  appliedPromotionName?: string;
  discountAmount?: number;
  originalPrice?: number;
  notes?: string;
  paid?: boolean;
  paymentMethod?: 'BLIK' | 'Karta' | 'Apple Pay' | 'Google Pay' | 'Gotówka' | string;
  paidAt?: string;
  stripePaymentIntentId?: string;
  paymentError?: string;
  customerName?: string;
  customerPhone?: string;
  isTakeout?: boolean;
}

export interface CreateOrderDto {
  tableNumber?: string;
  items: OrderItem[];
  appliedPromotionId?: string;
  appliedPromotionName?: string;
  discountAmount?: number;
  originalPrice?: number;
  notes?: string;
  paid?: boolean;
  paymentMethod?: 'BLIK' | 'Karta' | 'Apple Pay' | 'Google Pay' | 'Gotówka' | string;
  paidAt?: string;
  stripePaymentIntentId?: string;
  customerName?: string;
  customerPhone?: string;
  isTakeout?: boolean;
}
