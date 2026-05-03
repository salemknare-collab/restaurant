import React from 'react';
import { useSettings } from '../context/SettingsContext';

export const useCart = () => {
  const { storeSettings } = useSettings();
  const [items, setItems] = React.useState<any[]>([]);
  const [orderType, setOrderType] = React.useState<'dine_in' | 'takeaway' | 'delivery'>('dine_in');
  const [tableNumber, setTableNumber] = React.useState('');
  const [customerName, setCustomerName] = React.useState('');
  const [customerPhone, setCustomerPhone] = React.useState('');

  const addItem = (product: any) => {
    setItems((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (existing) {
        return current.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...current, { product, quantity: 1 }];
    });
  };

  const removeItem = (productId: string) => {
    setItems((current) => current.filter((item) => item.product.id !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }
    setItems((current) =>
      current.map((item) =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  };

  const updateNote = (productId: string, note: string) => {
    setItems((current) =>
      current.map((item) =>
        item.product.id === productId ? { ...item, note } : item
      )
    );
  };

  const clearCart = () => {
    setItems([]);
    setTableNumber('');
    setCustomerName('');
    setCustomerPhone('');
  };

  const subtotal = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );
  
  const deliveryFee = orderType === 'delivery' ? (storeSettings?.deliveryFee || 0) : 0;
  const total = subtotal + deliveryFee;

  return {
    items,
    addItem,
    removeItem,
    updateQuantity,
    updateNote,
    clearCart,
    subtotal,
    deliveryFee,
    total,
    orderType,
    setOrderType,
    tableNumber,
    setTableNumber,
    customerName,
    setCustomerName,
    customerPhone,
    setCustomerPhone,
  };
};
