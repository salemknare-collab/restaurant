import { Category, Product, Order, User } from '../types';

export const mockCategories: Category[] = [
  { id: 'c1', name: 'المشروبات الساخنة', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { id: 'c2', name: 'المشروبات الباردة', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { id: 'c3', name: 'الحلويات', color: 'bg-pink-100 text-pink-700 border-pink-200' },
  { id: 'c4', name: 'الساندويتشات', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { id: 'c5', name: 'السلطات', color: 'bg-green-100 text-green-700 border-green-200' },
];

export const mockProducts: Product[] = [
  { id: 'p1', categoryId: 'c1', name: 'قهوة عربية', price: 15, isAvailable: true, image: 'https://images.unsplash.com/photo-1578314675249-a6910f80cc4e?w=500&auto=format&fit=crop&q=60' },
  { id: 'p2', categoryId: 'c1', name: 'كابتشينو', price: 18, isAvailable: true, image: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=500&auto=format&fit=crop&q=60' },
  { id: 'p3', categoryId: 'c1', name: 'لاتيه', price: 19, isAvailable: true, image: 'https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?w=500&auto=format&fit=crop&q=60' },
  { id: 'p4', categoryId: 'c1', name: 'إسبريسو', price: 12, isAvailable: true, image: 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=500&auto=format&fit=crop&q=60' },
  { id: 'p5', categoryId: 'c1', name: 'شاي أحمر', price: 8, isAvailable: true, image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=500&auto=format&fit=crop&q=60' },
  { id: 'p6', categoryId: 'c1', name: 'شاي أخضر', price: 10, isAvailable: true, image: 'https://images.unsplash.com/photo-1627492276010-4ce268d234c9?w=500&auto=format&fit=crop&q=60' },

  { id: 'p7', categoryId: 'c2', name: 'عصير برتقال طازج', price: 16, isAvailable: true, image: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=500&auto=format&fit=crop&q=60' },
  { id: 'p8', categoryId: 'c2', name: 'عصير ليمون بالنعناع', price: 15, isAvailable: true, image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&auto=format&fit=crop&q=60' },
  { id: 'p9', categoryId: 'c2', name: 'موهيتو فراولة', price: 22, isAvailable: true, image: 'https://images.unsplash.com/photo-1556881286-fc6915169721?w=500&auto=format&fit=crop&q=60' },
  { id: 'p10', categoryId: 'c2', name: 'آيس لاتيه', price: 20, isAvailable: true, image: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=500&auto=format&fit=crop&q=60' },
  { id: 'p11', categoryId: 'c2', name: 'مياه معدنية', price: 3, isAvailable: true, image: 'https://images.unsplash.com/photo-1523362628745-0c100150b504?w=500&auto=format&fit=crop&q=60' },

  { id: 'p12', categoryId: 'c3', name: 'كيكة الشوكولاتة', price: 25, isAvailable: true, image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=500&auto=format&fit=crop&q=60' },
  { id: 'p13', categoryId: 'c3', name: 'تشيز كيك فراولة', price: 28, isAvailable: true, image: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=500&auto=format&fit=crop&q=60' },
  { id: 'p14', categoryId: 'c3', name: 'تيراميسو', price: 26, isAvailable: true, image: 'https://images.unsplash.com/photo-1571115177098-24ec42ed204d?w=500&auto=format&fit=crop&q=60' },
  { id: 'p15', categoryId: 'c3', name: 'كوكيز', price: 12, isAvailable: true, image: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=500&auto=format&fit=crop&q=60' },

  { id: 'p16', categoryId: 'c4', name: 'كلوب ساندويتش', price: 32, isAvailable: true, image: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=500&auto=format&fit=crop&q=60' },
  { id: 'p17', categoryId: 'c4', name: 'ساندويتش دجاج مشوي', price: 28, isAvailable: true, image: 'https://images.unsplash.com/photo-1619881589316-56c7f9e6b587?w=500&auto=format&fit=crop&q=60' },
  { id: 'p18', categoryId: 'c4', name: 'كرواسون جبنة', price: 16, isAvailable: true, image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500&auto=format&fit=crop&q=60' },
  
  { id: 'p19', categoryId: 'c5', name: 'سلطة سيزر', price: 35, isAvailable: true, image: 'https://images.unsplash.com/photo-1550304943-4f24f54ddde9?w=500&auto=format&fit=crop&q=60' },
  { id: 'p20', categoryId: 'c5', name: 'سلطة يونانية', price: 30, isAvailable: true, image: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=500&auto=format&fit=crop&q=60' },
];

export const mockUser: User = {
  id: 'u1',
  name: 'أحمد محمد',
  email: 'ahmed@restaurant.com',
  role: 'cashier',
  avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026024d'
};

export const generateOrderNumber = () => {
  const date = new Date();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `ORD-${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}-${random}`;
};
