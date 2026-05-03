export type Category = {
  id: string;
  name: string;
  icon?: string;
  color?: string;
};

export type Product = {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  image?: string;
  description?: string;
  isAvailable: boolean;
  ingredients?: any[];
};

export type CartItem = {
  product: Product;
  quantity: number;
  notes?: string;
};

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
export type PaymentMethod = 'cash' | 'card' | 'online';
export type OrderType = 'dine_in' | 'takeaway' | 'delivery';

export type Order = {
  id: string;
  orderNumber: string;
  items: CartItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: OrderStatus;
  paymentMethod?: PaymentMethod;
  orderType: OrderType;
  tableNumber?: string;
  customerName?: string;
  customerPhone?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type UserRole = 'admin' | 'manager' | 'cashier' | 'waiter' | 'kitchen';

export type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
};
