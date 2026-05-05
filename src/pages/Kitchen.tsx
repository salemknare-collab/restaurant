import React, { useState, useEffect } from 'react';
import { useUserAuth } from '../hooks/useUserAuth';

import { useNavigate } from 'react-router-dom';
import { ArrowRight, Clock, ChefHat, CheckCircle, AlertCircle, LogOut, Utensils, X } from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';

interface OrderItem {
  name: string;
  image?: string;
  quantity: number;
  notes?: string;
  kitchenId?: string;
}

interface Order {
  id: string;
  type: 'داخلي' | 'توصيل' | 'سفري';
  source?: 'pos' | 'customer';
  orderRefId?: string;
  branchId?: string;
  branchName?: string;
  table?: string;
  customer?: string;
  status: 'new' | 'preparing' | 'ready' | 'out_for_delivery' | 'completed';
  time: string;
  createdAt?: string;
  items: OrderItem[];
}

export default function Kitchen() {
  const { branchId: userBranchId, hasPermission } = useUserAuth();
  const canViewAllBranches = hasPermission('branches.view_all');
  useEffect(() => {
    // Branch permissions check hook dependency
  }, [canViewAllBranches, userBranchId]);

  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [allBranches, setBranches] = useState<any[]>([]);
  const branches = canViewAllBranches ? allBranches : allBranches.filter(b => b.id === userBranchId);
  const [kitchens, setKitchens] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedKitchen, setSelectedKitchen] = useState<string>('all');
  const [isMenuModalOpen, setIsMenuModalOpen] = useState(false);
  const [showProductToggleConfirm, setShowProductToggleConfirm] = useState<{ productId: string, currentStatus: boolean, name?: string } | null>(null);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  const handleLogout = async () => {
    try {
      await signOut(auth).catch(e => console.error("Sign out error:", e));
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  useEffect(() => {
    const fetchPermissions = async () => {
      const directSessionStr = localStorage.getItem('direct_employee_session');
      if (directSessionStr) {
        try {
          const session = JSON.parse(directSessionStr);
          setUserPermissions(session.permissions || []);
          if (session.roleId === 'admin') setIsAdmin(true);
        } catch(e) {}
      }

      const user = auth.currentUser;
      if (!user) return;
      const email = user.email || '';
      if (!email) return;
      if (!email) return;

      if (email === 'salem.sam59@gmail.com' || email.endsWith('@restaurant.internal')) {
        setIsAdmin(true);
        return;
      }
      try {
        const { getDoc } = await import('firebase/firestore');
        const userDoc = await getDoc(doc(db, 'users', email));
        if (userDoc.exists()) {
          const roleId = userDoc.data().roleId;
          const userPermissions = userDoc.data().permissions;
          if (userPermissions && userPermissions.length > 0) {
            setUserPermissions(userPermissions);
          } else if (roleId) {
            const roleDoc = await getDoc(doc(db, 'roles', roleId));
            if (roleDoc.exists()) {
              setUserPermissions(roleDoc.data().permissions || []);
            } else {
              if (roleId === 'chef') setUserPermissions(['kitchen.access', 'product.availability']);
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchPermissions();

    const unsubscribeOrders = onSnapshot(collection(db, 'kitchen_orders'), (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      setOrders(ordersData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'kitchen_orders');
    });

    const unsubscribeProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const productsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(productsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'products');
    });

    const unsubscribeBranches = onSnapshot(collection(db, 'branches'), (snapshot) => {
      const branchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBranches(branchesData.filter((b: any) => b.status === 'نشط'));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'branches');
    });

    const unsubscribeKitchens = onSnapshot(collection(db, 'kitchen_stations'), (snapshot) => {
      const kitchensData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setKitchens(kitchensData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'kitchen_stations');
    });

    return () => {
      unsubscribeOrders();
      unsubscribeProducts();
      unsubscribeBranches();
      unsubscribeKitchens();
    };
  }, []);

  const updateOrderStatus = async (order: Order, newStatus: Order['status']) => {
    try {
      updateDoc(doc(db, 'kitchen_orders', order.id), { status: newStatus }).catch(error => {
        console.error("Error updating kitchen order (might be offline):", error);
      });
      
      // Sync status to the main orders collection so other screens (Orders, Driver) can see it
      if (order.orderRefId) {
        const isDelivery = order.type === 'توصيل' || (order.type as string) === 'delivery';
        const shouldSyncMainOrder = !(isDelivery && newStatus === 'completed');

        if (shouldSyncMainOrder) {
          updateDoc(doc(db, 'orders', order.orderRefId), { status: newStatus }).catch(error => {
            console.error("Error syncing main order (might be offline):", error);
          });
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `kitchen_orders/${order.id}`);
    }
  };

  const toggleProductAvailability = async (product: any, currentStatus: boolean) => {
    setShowProductToggleConfirm({
      productId: product.id,
      name: product.name,
      currentStatus: currentStatus
    });
  };

  const executeToggleAvailability = async () => {
    if (!showProductToggleConfirm) return;
    try {
      await updateDoc(doc(db, 'products', showProductToggleConfirm.productId), {
        isAvailable: !showProductToggleConfirm.currentStatus
      });
      setShowProductToggleConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `products/${showProductToggleConfirm.productId}`);
    }
  };

  const filteredOrders = orders.filter(o => {
    const matchesBranch = selectedBranch === 'all' || o.branchId === selectedBranch;
    const matchesKitchen = selectedKitchen === 'all' || o.items.some(item => item.kitchenId === selectedKitchen);
    return matchesBranch && matchesKitchen;
  });

  const newOrders = filteredOrders.filter(o => o.status === 'new');
  const preparingOrders = filteredOrders.filter(o => o.status === 'preparing');
  const readyOrders = filteredOrders.filter(o => o.status === 'ready' || o.status === 'out_for_delivery');

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans" dir="rtl">
      {/* Header */}
      <header className="h-16 bg-surface border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/hub')} className="p-2 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors">
            <ArrowRight className="w-5 h-5" />
          </button>
          <button 
            onClick={handleLogout}
            className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
            title="تسجيل الخروج"
          >
            <LogOut className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="bg-orange-500 text-foreground p-1.5 rounded-lg">
              <ChefHat className="w-4 h-4" />
            </div>
            <div>
              <h1 className="font-bold text-sm">شاشة المطبخ</h1>
              <p className="text-[10px] text-muted">إدارة الطلبات والتحضير</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsMenuModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-surface-hover border border-border rounded-lg text-sm font-medium hover:bg-primary-500 hover:text-white hover:border-primary-500 transition-colors"
          >
            <Utensils className="w-4 h-4" />
            إدارة القائمة
          </button>
          <div className="mr-4 border-l border-gray-200 pl-4 flex gap-2">
            <select
              value={selectedKitchen}
              onChange={(e) => setSelectedKitchen(e.target.value)}
              className="bg-surface border border-border text-foreground text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block w-full p-2"
            >
              <option value="all">جميع المطابخ (المحطات)</option>
              {kitchens.map(kitchen => (
                <option key={kitchen.id} value={kitchen.id}>{kitchen.name}</option>
              ))}
            </select>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="bg-surface border border-border text-foreground text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block w-full p-2"
            >
              {canViewAllBranches && <option value="all">جميع الفروع</option>}
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-foreground">
              {new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
            </p>
            <p className="text-[10px] text-muted">
              {new Date().toLocaleDateString('ar-SA', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 overflow-hidden flex gap-4">
        
        {/* Column 1: New Orders */}
        <div className="flex-1 flex flex-col bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="h-12 glass border-b border-blue-500/20 flex items-center justify-between px-4 shrink-0">
            <h2 className="font-bold text-blue-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>طلبات جديدة</span>
            </h2>
            <span className="bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full glow-primary">{newOrders.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 pos-scroll">
            {newOrders.map(order => (
              <OrderCard key={order.id} order={order} selectedKitchen={selectedKitchen} onAction={() => updateOrderStatus(order, 'preparing')} actionText="بدء التحضير" actionColor="bg-orange-500 hover:bg-orange-600" />
            ))}
          </div>
        </div>

        {/* Column 2: Preparing */}
        <div className="flex-1 flex flex-col bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="h-12 glass border-b border-orange-500/20 flex items-center justify-between px-4 shrink-0">
            <h2 className="font-bold text-orange-400 text-sm flex items-center gap-2">
              <ChefHat className="w-4 h-4" />
              <span>قيد التحضير</span>
            </h2>
            <span className="bg-orange-500 text-foreground text-xs font-bold px-2 py-0.5 rounded-full glow-primary">{preparingOrders.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 pos-scroll">
            {preparingOrders.map(order => (
              <OrderCard key={order.id} order={order} selectedKitchen={selectedKitchen} onAction={() => updateOrderStatus(order, 'ready')} actionText="جاهز للتسليم" actionColor="bg-emerald-500 hover:bg-emerald-600" />
            ))}
          </div>
        </div>

        {/* Column 3: Ready */}
        <div className="flex-1 flex flex-col bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="h-12 glass border-b border-emerald-500/20 flex items-center justify-between px-4 shrink-0">
            <h2 className="font-bold text-emerald-400 text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              <span>جاهز للتسليم</span>
            </h2>
            <span className="bg-emerald-500 text-white text-xs font-bold px-2 py-0.5 rounded-full glow-emerald">{readyOrders.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 pos-scroll">
            {readyOrders.map(order => (
              <OrderCard 
                key={order.id} 
                order={order} 
                selectedKitchen={selectedKitchen}
                onAction={() => updateOrderStatus(order, 'completed')} 
                actionText={
                  order.status === 'out_for_delivery' ? 'مع المندوب (إنهاء)' :
                  order.type === 'توصيل' ? 'بانتظار المندوب (إنهاء)' : 'تم التسليم (إخفاء)'
                } 
                actionColor={
                  order.status === 'out_for_delivery' ? 'bg-teal-600 hover:bg-teal-500' :
                  order.type === 'توصيل' ? 'bg-purple-600 hover:bg-purple-500' : 'bg-slate-600 hover:bg-slate-500'
                } 
              />
            ))}
          </div>
        </div>

      </main>

      {/* Menu Management Modal */}
      {isMenuModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden max-h-[90vh]">
            <div className="p-4 border-b border-border flex justify-between items-center bg-surface-hover/50">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Utensils className="w-5 h-5 text-primary-500" />
                إدارة توفر المنتجات
              </h2>
              <button onClick={() => setIsMenuModalOpen(false)} className="p-2 hover:bg-surface rounded-lg transition-colors text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 pos-scroll">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {products.filter(p => selectedBranch === 'all' || !p.branchId || p.branchId === selectedBranch).map(product => {
                  const isAvailable = product.isAvailable !== false;
                  const hasPermission = isAdmin || userPermissions.includes('product.availability');
                  
                  return (
                    <div key={product.id} className={`flex items-center justify-between p-3 rounded-xl border ${isAvailable ? 'bg-surface border-border' : 'bg-red-500/5 border-red-500/20'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isAvailable ? 'bg-surface-hover text-primary-400' : 'bg-red-500/10 text-red-400'}`}>
                          <Utensils className="w-5 h-5" />
                        </div>
                        <div>
                          <p className={`font-bold text-sm ${!isAvailable && 'text-muted-foreground line-through'}`}>{product.name}</p>
                          <p className="text-xs text-muted">{product.category || 'بدون تصنيف'}</p>
                        </div>
                      </div>
                      
                      {hasPermission ? (
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="sr-only peer"
                            checked={isAvailable}
                            onChange={() => toggleProductAvailability(product, isAvailable)}
                          />
                          <div className="w-9 h-5 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-500"></div>
                        </label>
                      ) : (
                        <span className={`text-xs font-bold px-2 py-1 rounded-md ${isAvailable ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                          {isAvailable ? 'متاح' : 'غير متاح'}
                        </span>
                      )}
                    </div>
                  );
                })}
                {products.length === 0 && (
                  <div className="col-span-full text-center py-8 text-muted-foreground">
                    لا توجد منتجات
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-4 border-t border-border bg-surface-hover/50 flex justify-end">
              <button onClick={() => setIsMenuModalOpen(false)} className="px-6 py-2 bg-primary-600 hover:bg-primary-500 text-white font-medium rounded-xl transition-colors">
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Product Toggle Confirm Modal */}
      {showProductToggleConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={(e) => e.stopPropagation()}>
          <div className="bg-surface border border-border rounded-xl w-full max-w-sm flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-primary-500/20 text-primary-500 rounded-full flex items-center justify-center mb-4">
                 <Utensils className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">تأكيد الإجراء</h3>
              <p className="text-muted mb-6">
                هل أنت متأكد من تغيير حالة المنتج "{showProductToggleConfirm.name}" إلى {showProductToggleConfirm.currentStatus ? 'غير متاح' : 'متاح'}؟
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setShowProductToggleConfirm(null)}
                  className="flex-1 py-3 bg-surface-hover hover:bg-slate-700 text-foreground rounded-xl font-bold transition-colors"
                >
                  إلغاء
                </button>
                <button
                  onClick={executeToggleAvailability}
                  className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold transition-colors"
                >
                  تأكيد
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const OrderTimer: React.FC<{ createdAt?: string, status: string }> = ({ createdAt, status }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!createdAt || status === 'ready') return;

    const calculateElapsed = () => {
      const start = new Date(createdAt).getTime();
      const now = Date.now();
      setElapsed(Math.max(0, Math.floor((now - start) / 1000)));
    };

    calculateElapsed();
    const interval = setInterval(calculateElapsed, 1000);

    return () => clearInterval(interval);
  }, [createdAt, status]);

  if (!createdAt || status === 'ready') return null;

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  
  // Highlight if taking longer than 15 minutes
  const isLate = minutes >= 15;

  return (
    <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md ${isLate ? 'bg-red-500/20 text-red-500 animate-pulse' : 'bg-surface-hover text-muted-foreground'}`}>
      <Clock className="w-3 h-3" />
      <span dir="ltr">{minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}</span>
    </div>
  );
};

const OrderCard: React.FC<{ 
  order: Order, 
  selectedKitchen?: string,
  onAction: () => void, 
  actionText: string, 
  actionColor: string,
  disabled?: boolean
}> = ({ order, selectedKitchen, onAction, actionText, actionColor, disabled }) => {
  const [isLate, setIsLate] = useState(false);

  useEffect(() => {
    if (!order.createdAt || order.status === 'ready') return;

    const checkLate = () => {
      const start = new Date(order.createdAt!).getTime();
      const now = Date.now();
      const minutes = Math.floor((now - start) / 60000);
      setIsLate(minutes >= 15);
    };

    checkLate();
    const interval = setInterval(checkLate, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [order.createdAt, order.status]);

  const displayItems = selectedKitchen && selectedKitchen !== 'all' 
    ? order.items.filter(item => item.kitchenId === selectedKitchen)
    : order.items;

  if (displayItems.length === 0) return null;

  return (
    <div className={`glass rounded-xl p-4 shadow-lg transition-all hover:scale-[1.01] auto-fade-in-up ${
      isLate 
        ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.3)] bg-red-500/5' 
        : 'border-white/10'
    }`}>
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="font-bold text-foreground text-sm">#{order.id.split('-')[1] || order.id.substring(0, 6)}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
            order.type === 'داخلي' ? 'bg-blue-500/20 text-blue-400' :
            order.type === 'توصيل' ? 'bg-purple-500/20 text-purple-400' :
            'bg-orange-500/20 text-orange-400'
          }`}>
            {order.type}
          </span>
          {order.source && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
              order.source === 'customer' ? 'bg-teal-500/20 text-teal-400' : 'bg-slate-500/20 text-muted'
            }`}>
              {order.source === 'customer' ? 'تطبيق الزبائن' : 'الكاشير'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {order.createdAt && order.status !== 'ready' && (
            <OrderTimer createdAt={order.createdAt} status={order.status} />
          )}
          <div className="flex items-center gap-1 text-muted text-xs">
            <Clock className="w-3 h-3" />
            <span>{order.time}</span>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <p className="text-xs text-muted mb-2">
          {order.branchName && <span className="block text-primary-400 mb-1">الفرع: {order.branchName}</span>}
          {order.table ? `الطاولة: ${order.table}` : `العميل: ${order.customer}`}
        </p>
        <ul className="space-y-2">
          {displayItems.map((item, idx) => (
            <li key={idx} className="flex flex-col text-sm bg-white/5 p-3 rounded-xl border border-white/5">
              <div className="flex-1">
                <div className="flex justify-between items-start gap-4">
                  <span className="text-white font-bold text-xl leading-tight">{item.name}</span>
                  <span className="font-black text-white bg-primary-600 w-12 h-12 min-w-[3rem] flex items-center justify-center rounded-xl text-2xl shadow-lg shadow-primary-500/30 glow-primary">
                    {item.quantity}
                  </span>
                </div>
                {item.notes && (
                  <div className="mt-2 p-2 bg-red-500/10 rounded-lg border border-red-500/20">
                    <p className="text-xs text-red-400 flex items-center gap-2 font-bold">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                      ملاحظة: {item.notes}
                    </p>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <button 
        onClick={onAction}
        disabled={disabled}
        className={`w-full py-2 rounded-lg text-foreground text-xs font-bold transition-colors ${actionColor} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {actionText}
      </button>
    </div>
  );
}
