import React, { useState, useEffect } from 'react';
import { useUserAuth } from '../hooks/useUserAuth';

import { Search, Filter, Eye, MoreVertical, Download, X, CheckCircle, Clock, XCircle, Trash2 } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { useFormatCurrency } from '../hooks/useFormatCurrency';
import { db } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, getDocs, getDoc, setDoc, query, where, increment } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { ExportButtons } from '../components/ExportButtons';
import { exportToExcel, printTable } from '../lib/exportUtils';

export default function Orders() {
  const { branchId: userBranchId, hasPermission } = useUserAuth();
  const canViewAllBranches = hasPermission('branches.view_all');
  useEffect(() => {
    // Branch permissions check hook dependency
  }, [canViewAllBranches, userBranchId]);

  const { storeSettings } = useSettings();
  const formatCurrency = useFormatCurrency();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'orders'), (snapshot) => {
      const ordersData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          customer: data.customerName || 'عميل غير معروف',
          time: data.createdAt ? new Date(data.createdAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : 'الآن',
          type: data.orderType || 'dine_in',
          itemsCount: data.items ? data.items.reduce((sum: number, item: any) => sum + item.quantity, 0) : 0,
          total: data.total || 0,
          status: data.status || 'new',
          ...data
        };
      });
      // Sort by createdAt descending
      ordersData.sort((a: any, b: any) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
      setOrders(ordersData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'orders');
    });

    return () => unsubscribe();
  }, []);

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      
      if (newStatus === 'completed') {
        const orderSnap = await getDoc(orderRef);
        if (orderSnap.exists()) {
          const orderData = orderSnap.data();
          if (!orderData.financeAdded) {
            const isCash = orderData.paymentMethod === 'cash' || orderData.paymentMethod === 'نقدي';
            const isDelivery = orderData.orderType === 'delivery' || orderData.type === 'توصيل';
            
            if (isDelivery && isCash && orderData.driverId) {
               // Divert cash to Driver Wallet
               const driverRef = doc(db, 'users', orderData.driverId);
               try {
                 await updateDoc(driverRef, { cashOnHand: increment(orderData.total || 0) });
               } catch (e: any) {
                 if (e.code === 'not-found') {
                   await setDoc(driverRef, { cashOnHand: orderData.total || 0 }, { merge: true });
                 }
               }
               await updateDoc(orderRef, { status: newStatus, financeAdded: true });
            } else if (orderData.branchId) {
               // Normal: Divert to safe or bank
               const isCard = orderData.paymentMethod === 'card';
               const accountsQuery = query(
                 collection(db, 'accounts'),
                 where('branchId', '==', orderData.branchId),
                 where('type', '==', isCard ? 'bank' : 'safe')
               );
               const accountsSnap = await getDocs(accountsQuery);
               if (!accountsSnap.empty) {
                  const accountDoc = accountsSnap.docs[0];
                  await updateDoc(doc(db, 'accounts', accountDoc.id), {
                    balance: increment(orderData.total || 0)
                  });
                  await updateDoc(orderRef, { status: newStatus, financeAdded: true });
               } else {
                  await updateDoc(orderRef, { status: newStatus });
               }
            } else {
               await updateDoc(orderRef, { status: newStatus });
            }
          } else {
            await updateDoc(orderRef, { status: newStatus });
          }
        }
      } else {
        updateDoc(orderRef, { status: newStatus }).catch(error => {
          console.error("Error updating order status (might be offline):", error);
        });
      }

      // Also update kitchen_orders if exists
      const kitchenOrdersRef = collection(db, 'kitchen_orders');
      const q = query(kitchenOrdersRef, where('orderRefId', '==', orderId));
      getDocs(q).then(snapshot => {
        snapshot.docs.forEach(kDoc => {
          updateDoc(doc(db, 'kitchen_orders', kDoc.id), { status: newStatus }).catch(error => {
            console.error("Error updating kitchen order status (might be offline):", error);
          });
        });
      }).catch(error => {
        console.error("Error fetching kitchen orders:", error);
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'orders');
    }
  };

  const handleDeleteOrder = (orderId: string) => {
    setOrderToDelete(orderId);
    setIsDeleteModalOpen(true);
  };

  const executeDeleteOrder = async () => {
    if (!orderToDelete) return;
    try {
      await deleteDoc(doc(db, 'orders', orderToDelete));
      // Also delete from kitchen_orders if exists
      const kitchenOrdersRef = collection(db, 'kitchen_orders');
      const q = query(kitchenOrdersRef, where('orderRefId', '==', orderToDelete));
      getDocs(q).then(snapshot => {
        snapshot.docs.forEach(kDoc => {
          deleteDoc(doc(db, 'kitchen_orders', kDoc.id)).catch(error => {
            console.error("Error deleting kitchen order:", error);
          });
        });
      }).catch(error => {
         console.error("Error fetching kitchen orders:", error);
      });
      setIsDeleteModalOpen(false);
      setOrderToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'orders');
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = (order.id && order.id.toLowerCase().includes(searchTerm.toLowerCase())) || 
                          (order.customer && order.customer.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || 
                          order.status === statusFilter ||
                          (statusFilter === 'pending' && order.status === 'new');
    const matchesBranch = canViewAllBranches || order.branchId === userBranchId;
    return matchesSearch && matchesStatus && matchesBranch;
  });

  return (
    <div className="p-6 space-y-6 bg-background min-h-full text-foreground">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-1">إدارة الطلبات</h2>
          <p className="text-xs text-muted">عرض وإدارة جميع الطلبات</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-surface border border-border text-muted-foreground rounded-lg hover:bg-surface-hover transition-colors text-sm font-medium">
            <Download className="w-4 h-4" />
            <span>تصدير</span>
          </button>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
        {/* Filters */}
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
            <input
              type="text"
              placeholder="ابحث برقم الطلب أو اسم العميل..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-4 pr-10 py-2 bg-background border border-border rounded-lg text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-muted" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-background border border-border text-foreground text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2 outline-none"
            >
              <option value="all">جميع الحالات</option>
              <option value="pending">قيد الانتظار</option>
              <option value="preparing">قيد التحضير</option>
              <option value="ready">جاهز</option>
              <option value="completed">مكتمل</option>
              <option value="cancelled">ملغي</option>
            </select>
            <ExportButtons 
              onExport={() => exportToExcel(filteredOrders, 'الطلبات')}
              onPrint={() => printTable('orders-table', 'سجل الطلبات')}
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table id="orders-table" className="w-full text-sm text-right text-muted-foreground">
            <thead className="text-xs text-muted uppercase bg-background border-b border-border">
              <tr>
                <th scope="col" className="px-6 py-4 font-medium">رقم الطلب</th>
                <th scope="col" className="px-6 py-4 font-medium">العميل</th>
                <th scope="col" className="px-6 py-4 font-medium">الفرع</th>
                <th scope="col" className="px-6 py-4 font-medium">الوقت</th>
                <th scope="col" className="px-6 py-4 font-medium">النوع</th>
                <th scope="col" className="px-6 py-4 font-medium">العناصر</th>
                <th scope="col" className="px-6 py-4 font-medium">الإجمالي</th>
                <th scope="col" className="px-6 py-4 font-medium">الحالة</th>
                <th scope="col" className="px-6 py-4 font-medium text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id} className="border-b border-border hover:bg-surface-hover/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-foreground">#{order.id.slice(0, 8)}</td>
                  <td className="px-6 py-4">{order.customer}</td>
                  <td className="px-6 py-4 text-primary-600 font-medium">{order.branchName || 'جميع الفروع'}</td>
                  <td className="px-6 py-4">{order.time}</td>
                  <td className="px-6 py-4">
                    <span className="capitalize">
                      {order.type === 'dine_in' ? 'محلي' : 
                       order.type === 'takeaway' ? 'سفري' : 
                       order.type === 'delivery' ? 'توصيل' : order.type}
                    </span>
                  </td>
                  <td className="px-6 py-4">{order.itemsCount}</td>
                  <td className="px-6 py-4 font-bold text-primary-400">{formatCurrency(order.total)}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                      order.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                      order.status === 'preparing' ? 'bg-orange-500/10 text-orange-400' :
                      order.status === 'ready' ? 'bg-blue-500/10 text-blue-400' :
                      order.status === 'cancelled' ? 'bg-red-500/10 text-red-400' :
                      order.status === 'pending' || order.status === 'new' ? 'bg-slate-500/10 text-muted' :
                      'bg-slate-800 text-muted-foreground'
                    }`}>
                      {order.status === 'completed' ? 'مكتمل' :
                       order.status === 'preparing' ? 'قيد التحضير' :
                       order.status === 'ready' ? 'جاهز' : 
                       order.status === 'cancelled' ? 'ملغي' :
                       order.status === 'pending' || order.status === 'new' ? 'قيد الانتظار' : order.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button 
                        onClick={() => setSelectedOrder(order)}
                        className="p-1.5 text-muted hover:text-primary-400 hover:bg-primary-500/10 rounded-lg transition-colors" 
                        title="عرض التفاصيل"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      
                      {order.status === 'new' || order.status === 'pending' ? (
                        <button 
                          onClick={() => handleUpdateStatus(order.id, 'preparing')}
                          className="p-1.5 text-orange-400 hover:bg-orange-500/10 rounded-lg transition-colors"
                          title="بدء التحضير"
                        >
                          <Clock className="w-4 h-4" />
                        </button>
                      ) : order.status === 'preparing' ? (
                        <button 
                          onClick={() => handleUpdateStatus(order.id, 'ready')}
                          className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                          title="تجهيز الطلب"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      ) : order.status === 'ready' ? (
                        <button 
                          onClick={() => handleUpdateStatus(order.id, 'completed')}
                          className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                          title="إكمال الطلب"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      ) : null}

                      {(order.status !== 'completed' && order.status !== 'cancelled') && (
                        <button 
                          onClick={() => handleUpdateStatus(order.id, 'cancelled')}
                          className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="إلغاء الطلب"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}

                      <button 
                        onClick={() => handleDeleteOrder(order.id)}
                        className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors" 
                        title="حذف الطلب"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {filteredOrders.length === 0 && (
            <div className="p-8 text-center text-muted">
              لا توجد طلبات مطابقة للبحث
            </div>
          )}
        </div>
        
        {/* Pagination (Mock) */}
        <div className="p-4 border-t border-border flex items-center justify-between text-sm text-muted">
          <div>
            عرض 1 إلى {filteredOrders.length} من {orders.length} طلب
          </div>
          <div className="flex gap-1">
            <button className="px-3 py-1 bg-background border border-border rounded hover:bg-surface-hover disabled:opacity-50" disabled>السابق</button>
            <button className="px-3 py-1 bg-primary-600 text-white rounded">1</button>
            <button className="px-3 py-1 bg-background border border-border rounded hover:bg-surface-hover">2</button>
            <button className="px-3 py-1 bg-background border border-border rounded hover:bg-surface-hover">التالي</button>
          </div>
        </div>
      </div>

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedOrder(null)}>
          <div className="bg-surface border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-border flex items-center justify-between bg-background">
              <div>
                <h3 className="text-xl font-bold text-foreground">تفاصيل الطلب #{selectedOrder.id.slice(0, 8)}</h3>
                <p className="text-sm text-muted mt-1">{selectedOrder.time}</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="p-2 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div className="bg-background p-4 rounded-xl border border-border">
                  <p className="text-xs text-muted mb-1">العميل</p>
                  <p className="font-bold text-foreground">{selectedOrder.customer}</p>
                  {selectedOrder.customerPhone && <p className="text-sm text-muted-foreground mt-1">{selectedOrder.customerPhone}</p>}
                </div>
                <div className="bg-background p-4 rounded-xl border border-border">
                  <p className="text-xs text-muted mb-1">الفرع</p>
                  <p className="font-bold text-primary-600">{selectedOrder.branchName || 'غير محدد'}</p>
                </div>
                <div className="bg-background p-4 rounded-xl border border-border">
                  <p className="text-xs text-muted mb-1">نوع الطلب</p>
                  <p className="font-bold text-foreground">
                    {selectedOrder.type === 'dine_in' ? 'محلي' : 
                     selectedOrder.type === 'takeaway' ? 'سفري' : 
                     selectedOrder.type === 'delivery' ? 'توصيل' : selectedOrder.type}
                  </p>
                  {selectedOrder.tableNumber && <p className="text-sm text-muted-foreground mt-1">طاولة: {selectedOrder.tableNumber}</p>}
                </div>
              </div>

              <h4 className="font-bold text-foreground mb-4">العناصر</h4>
              <div className="space-y-3">
                {selectedOrder.items?.map((item: any, idx: number) => (
                  <div key={idx} className="bg-background border border-border rounded-xl p-4 flex justify-between items-center gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-surface-hover shrink-0">
                        {item.image ? (
                          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            <Utensils className="w-6 h-6 opacity-30" />
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground bg-surface-hover w-6 h-6 flex items-center justify-center rounded text-xs">
                            {item.quantity}
                          </span>
                          <span className="font-bold text-slate-200">{item.name}</span>
                        </div>
                        {item.notes && (
                          <p className="text-sm text-red-400 mt-1 pr-8">ملاحظة: {item.notes}</p>
                        )}
                      </div>
                    </div>
                    <span className="font-bold text-primary-400">{formatCurrency(item.price * item.quantity)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 border-t border-border bg-background">
              <div className="flex justify-between items-center mb-2 text-muted">
                <span>المجموع الفرعي</span>
                <span>{formatCurrency(selectedOrder.subtotal || 0)}</span>
              </div>
              {selectedOrder.deliveryFee > 0 && (
                <div className="flex justify-between items-center mb-4 text-muted">
                  <span>رسوم التوصيل</span>
                  <span>{formatCurrency(selectedOrder.deliveryFee || 0)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-4 border-t border-border">
                <span className="text-lg font-bold text-foreground">الإجمالي</span>
                <span className="text-xl font-bold text-primary-400">{formatCurrency(selectedOrder.total)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && orderToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-sm flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">تأكيد الحذف</h3>
              <p className="text-muted mb-6">
                هل أنت متأكد من رغبتك في حذف هذا الطلب؟ لا يمكن التراجع عن هذا الإجراء.
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setOrderToDelete(null);
                  }}
                  className="flex-1 py-3 bg-surface-hover hover:bg-slate-700 text-foreground rounded-xl font-bold transition-colors"
                >
                  إلغاء
                </button>
                <button
                  onClick={executeDeleteOrder}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors"
                >
                  حذف
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
