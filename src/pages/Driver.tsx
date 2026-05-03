import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Truck, MapPin, Phone, CheckCircle, Clock, User, Check, X, LogOut } from 'lucide-react';
import { useFormatCurrency } from '../hooks/useFormatCurrency';
import { db, auth } from '../firebase';
import { collection, onSnapshot, query, where, doc, updateDoc, setDoc, orderBy, getDocs, getDoc, increment } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { useUserAuth } from '../hooks/useUserAuth';

interface DeliveryOrder {
  id: string;
  customer: string;
  phone: string;
  address: string;
  status: string;
  price: number;
  time: string;
  items: { name: string; quantity: number }[];
  driverId?: string;
  location?: { lat: number; lng: number };
  branchId?: string;
  branchName?: string;
}

export default function Driver() {
  const formatCurrency = useFormatCurrency();
  const navigate = useNavigate();
  const { branchId: userBranchId, hasPermission } = useUserAuth();
  const canViewAllBranches = hasPermission('branches.view_all');
  
  const [activeTab, setActiveTab] = useState<'available' | 'active' | 'completed'>('available');
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [driverProfile, setDriverProfile] = useState<any>(null);

  useEffect(() => {
    if (!canViewAllBranches && userBranchId) {
      setSelectedBranchFilter(userBranchId);
    }
  }, [canViewAllBranches, userBranchId]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'branches'), (snapshot) => {
      const branchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBranches(branchesData.filter((b: any) => b.status === 'نشط'));
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth).catch(e => console.error("Sign out error:", e));
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        if (user.email) {
           setUserEmail(user.email);
        } else {
           const directSessionStr = localStorage.getItem('direct_employee_session');
           if (directSessionStr) {
             try {
               const session = JSON.parse(directSessionStr);
               setUserEmail(session.uid);
             } catch(e) {}
           }
        }
      } else {
        setUserEmail(null);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!userEmail) return;
    const unsubscribeUser = onSnapshot(doc(db, 'users', userEmail), (docSnap) => {
      if (docSnap.exists()) {
        setDriverProfile({ id: docSnap.id, ...docSnap.data() });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${userEmail}`);
    });
    return () => unsubscribeUser();
  }, [userEmail]);

  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      where('orderType', '==', 'delivery')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedDeliveries = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          customer: data.customerName || 'عميل غير معروف',
          phone: data.customerPhone || 'لا يوجد رقم',
          address: data.deliveryAddress || 'العنوان غير متوفر',
          status: data.status,
          price: data.total || 0,
          time: data.createdAt ? new Date(data.createdAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : 'الآن',
          items: data.items || [],
          driverId: data.driverId,
          location: data.location,
          branchId: data.branchId,
          branchName: data.branchName
        } as DeliveryOrder;
      });
      // Sort manually since we can't easily compound order by with where without index
      fetchedDeliveries.sort((a, b) => b.time.localeCompare(a.time));
      setDeliveries(fetchedDeliveries);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'orders');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredDeliveries = deliveries.filter(d => 
    selectedBranchFilter === 'all' || d.branchId === selectedBranchFilter
  );

  const availableDeliveries = filteredDeliveries.filter(d => !['out_for_delivery', 'completed'].includes(d.status));
  const activeDeliveries = filteredDeliveries.filter(d => d.status === 'out_for_delivery' && d.driverId === userEmail);
  const completedDeliveries = filteredDeliveries.filter(d => d.status === 'completed' && d.driverId === userEmail);

  const totalEarnings = completedDeliveries.reduce((sum, d) => sum + d.price, 0);

  const [error, setError] = useState<string | null>(null);

  const acceptOrder = async (id: string) => {
    if (!userEmail) {
      setError('يجب تسجيل الدخول أولاً');
      setTimeout(() => setError(null), 3000);
      return;
    }
    try {
      updateDoc(doc(db, 'orders', id), {
        status: 'out_for_delivery',
        driverId: userEmail,
        driverName: driverProfile?.name || 'مندوب',
        driverPhone: driverProfile?.phone || ''
      }).catch(error => console.error("Error updating order (might be offline):", error));

      // Also update kitchen_orders if it exists
      const kitchenQuery = query(collection(db, 'kitchen_orders'), where('orderRefId', '==', id));
      getDocs(kitchenQuery).then(kitchenSnapshot => {
        if (!kitchenSnapshot.empty) {
          const kitchenDoc = kitchenSnapshot.docs[0];
          if (kitchenDoc.data().status !== 'completed') {
            updateDoc(doc(db, 'kitchen_orders', kitchenDoc.id), { status: 'out_for_delivery' }).catch(error => console.error("Error updating kitchen order (might be offline):", error));
          }
        }
      }).catch(error => console.error("Error fetching kitchen orders (might be offline):", error));

      setDoc(doc(db, 'users', userEmail), {
        driverStatus: 'مشغول'
      }, { merge: true }).catch(error => console.error("Error updating driver status (might be offline):", error));
      
      setActiveTab('active');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${id}`);
    }
  };

  const markAsCompleted = async (id: string) => {
    try {
      const orderRef = doc(db, 'orders', id);
      const orderSnap = await getDoc(orderRef);
      
      if (orderSnap.exists()) {
        const orderData = orderSnap.data();
        if (!orderData.financeAdded) {
          const isCash = orderData.paymentMethod === 'cash' || orderData.paymentMethod === 'نقدي' || !orderData.paymentMethod;
          
          if (isCash && userEmail) {
             // Divert cash to Driver Wallet
             const driverRef = doc(db, 'users', userEmail);
             try {
               await updateDoc(driverRef, { cashOnHand: increment(orderData.total || 0) });
             } catch (e: any) {
               if (e.code === 'not-found') {
                 await setDoc(driverRef, { cashOnHand: orderData.total || 0 }, { merge: true });
               }
             }
             await updateDoc(orderRef, { status: 'completed', financeAdded: true });
          } else if (orderData.branchId) {
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
                await updateDoc(orderRef, { status: 'completed', financeAdded: true });
             } else {
                await updateDoc(orderRef, { status: 'completed' });
             }
          } else {
            await updateDoc(orderRef, { status: 'completed' });
          }
        } else {
          await updateDoc(orderRef, { status: 'completed' });
        }
      } else {
        await updateDoc(orderRef, { status: 'completed' });
      }

      // Also update kitchen_orders if it exists
      const kitchenQuery = query(collection(db, 'kitchen_orders'), where('orderRefId', '==', id));
      getDocs(kitchenQuery).then(kitchenSnapshot => {
        if (!kitchenSnapshot.empty) {
          const kitchenDoc = kitchenSnapshot.docs[0];
          updateDoc(doc(db, 'kitchen_orders', kitchenDoc.id), { status: 'completed' }).catch(error => console.error("Error updating kitchen order (might be offline):", error));
        }
      }).catch(error => console.error("Error fetching kitchen orders (might be offline):", error));

      if (userEmail) {
        setDoc(doc(db, 'users', userEmail), {
          driverStatus: 'متاح'
        }, { merge: true }).catch(error => console.error("Error updating driver status (might be offline):", error));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${id}`);
    }
  };

  const toggleDriverStatus = async () => {
    if (!userEmail || !driverProfile) return;
    const newStatus = driverProfile.driverStatus === 'مشغول' ? 'متاح' : 'مشغول';
    try {
      setDoc(doc(db, 'users', userEmail), {
        driverStatus: newStatus
      }, { merge: true }).catch(error => console.error("Error toggling driver status (might be offline):", error));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userEmail}`);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans" dir="rtl">
      {/* Header */}
      <header className="h-16 bg-surface border-b border-border flex items-center justify-between px-4 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/hub')} className="p-2 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors">
            <ArrowRight className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="bg-teal-500 text-foreground p-1.5 rounded-lg">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <h1 className="font-bold text-sm">شاشة المندوب</h1>
              <p className="text-[10px] text-muted">إدارة طلبات التوصيل</p>
            </div>
          </div>
          
          <div className="mr-4 border-r border-border pr-4 flex items-center">
             <select
               value={selectedBranchFilter}
               onChange={(e) => setSelectedBranchFilter(e.target.value)}
               disabled={!canViewAllBranches && !!userBranchId}
               className="bg-input-bg border border-border text-foreground text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block w-full p-2 disabled:opacity-50 disabled:cursor-not-allowed hidden sm:block"
             >
               {canViewAllBranches && <option value="all">جميع الفروع</option>}
               {branches.map(branch => (
                 <option key={branch.id} value={branch.id}>{branch.name}</option>
               ))}
             </select>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {driverProfile && (
             <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg">
               <span className="text-xs text-muted-foreground hidden sm:inline">إجمالي العهدة:</span>
               <span className="text-sm font-bold text-emerald-500">{formatCurrency(driverProfile.cashOnHand || 0)}</span>
             </div>
          )}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-1.5 rounded-lg text-sm">
              {error}
            </div>
          )}
          {driverProfile && (
            <button
              onClick={toggleDriverStatus}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold transition-colors ${
                driverProfile.driverStatus === 'مشغول' 
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/50' 
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${driverProfile.driverStatus === 'مشغول' ? 'bg-rose-400' : 'bg-emerald-400'}`} />
              {driverProfile.driverStatus === 'مشغول' ? 'مشغول' : 'متاح'}
            </button>
          )}
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

      <main className="flex-1 p-4 max-w-3xl mx-auto w-full">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-muted">جاري تحميل الطلبات...</div>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-surface border border-border rounded-2xl p-4 flex flex-col items-center justify-center">
            <span className="text-xs text-muted mb-1">الطلبات المتاحة</span>
            <span className="text-2xl font-bold text-blue-400">{availableDeliveries.length}</span>
          </div>
          <div className="bg-surface border border-border rounded-2xl p-4 flex flex-col items-center justify-center">
            <span className="text-xs text-muted mb-1">طلباتي النشطة</span>
            <span className="text-2xl font-bold text-teal-400">{activeDeliveries.length}</span>
          </div>
          <div className="bg-surface border border-border rounded-2xl p-4 flex flex-col items-center justify-center">
            <span className="text-xs text-muted mb-1">المكتملة اليوم</span>
            <span className="text-2xl font-bold text-emerald-400">{completedDeliveries.length}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-surface border border-border rounded-xl p-1 mb-6">
          <button
            onClick={() => setActiveTab('available')}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${
              activeTab === 'available' ? 'bg-blue-500 text-white shadow-md' : 'text-muted hover:text-white'
            }`}
          >
            الطلبات المتاحة
          </button>
          <button
            onClick={() => setActiveTab('active')}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${
              activeTab === 'active' ? 'bg-teal-500 text-foreground shadow-md' : 'text-muted hover:text-foreground'
            }`}
          >
            طلباتي النشطة
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${
              activeTab === 'completed' ? 'bg-emerald-500 text-white shadow-md' : 'text-muted hover:text-white'
            }`}
          >
            المكتملة
          </button>
        </div>

        {/* List */}
        <div className="space-y-4">
          {activeTab === 'available' ? (
            availableDeliveries.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Truck className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>لا توجد طلبات متاحة حالياً</p>
              </div>
            ) : (
              availableDeliveries.map(delivery => (
                <div key={delivery.id} className="bg-surface border border-border rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground text-sm">#{delivery.id.split('-')[1] || delivery.id.substring(0, 6)}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          delivery.status === 'ready' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {delivery.status === 'ready' ? 'جاهز للتوصيل' : 'قيد التجهيز'}
                        </span>
                      </div>
                      {delivery.branchName && (
                        <span className="text-[10px] text-primary-400">{delivery.branchName}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-muted text-xs">
                      <Clock className="w-3 h-3" />
                      <span>{delivery.time}</span>
                    </div>
                  </div>

                  <div className="space-y-3 mb-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center shrink-0">
                        <MapPin className="w-4 h-4 text-muted" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-muted mb-0.5">العنوان</p>
                        <p className="text-sm text-foreground font-medium">{delivery.address}</p>
                        {delivery.location && (
                          <a 
                            href={`https://www.google.com/maps/search/?api=1&query=${delivery.location.lat},${delivery.location.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-1"
                          >
                            <MapPin className="w-3 h-3" />
                            عرض على الخريطة
                          </a>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center shrink-0">
                        <Phone className="w-4 h-4 text-muted" />
                      </div>
                      <div>
                        <p className="text-xs text-muted mb-0.5">العميل</p>
                        <p className="text-sm text-foreground font-medium">{delivery.customer} - <span dir="ltr">{delivery.phone}</span></p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-background rounded-xl p-3 mb-4">
                    <p className="text-xs text-muted mb-2 font-bold">تفاصيل الطلب</p>
                    <ul className="space-y-1">
                      {delivery.items.map((item, idx) => (
                        <li key={idx} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{item.quantity}x {item.name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <div>
                      <p className="text-xs text-muted mb-0.5">المبلغ المطلوب</p>
                      <p className="text-lg font-bold text-foreground">{formatCurrency(delivery.price)}</p>
                    </div>
                    <button
                      onClick={() => acceptOrder(delivery.id)}
                      disabled={delivery.status !== 'ready'}
                      className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors"
                    >
                      <Check className="w-5 h-5" />
                      <span>استلام الطلب</span>
                    </button>
                  </div>
                </div>
              ))
            )
          ) : activeTab === 'active' ? (
            activeDeliveries.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Truck className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>لا توجد طلبات نشطة حالياً</p>
              </div>
            ) : (
              activeDeliveries.map(delivery => (
                <div key={delivery.id} className="bg-surface border border-border rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground text-sm">#{delivery.id.split('-')[1] || delivery.id.substring(0, 6)}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-teal-500/20 text-teal-400">
                          جاري التوصيل
                        </span>
                      </div>
                      {delivery.branchName && (
                        <span className="text-[10px] text-primary-400">{delivery.branchName}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-muted text-xs">
                      <Clock className="w-3 h-3" />
                      <span>{delivery.time}</span>
                    </div>
                  </div>

                  <div className="space-y-3 mb-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center shrink-0">
                        <MapPin className="w-4 h-4 text-muted" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-muted mb-0.5">العنوان</p>
                        <p className="text-sm text-foreground font-medium">{delivery.address}</p>
                        {delivery.location && (
                          <a 
                            href={`https://www.google.com/maps/search/?api=1&query=${delivery.location.lat},${delivery.location.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-1"
                          >
                            <MapPin className="w-3 h-3" />
                            عرض على الخريطة
                          </a>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center shrink-0">
                        <Phone className="w-4 h-4 text-muted" />
                      </div>
                      <div>
                        <p className="text-xs text-muted mb-0.5">العميل</p>
                        <p className="text-sm text-foreground font-medium">{delivery.customer} - <span dir="ltr">{delivery.phone}</span></p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-background rounded-xl p-3 mb-4">
                    <p className="text-xs text-muted mb-2 font-bold">تفاصيل الطلب</p>
                    <ul className="space-y-1">
                      {delivery.items.map((item, idx) => (
                        <li key={idx} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{item.quantity}x {item.name}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 pt-2 border-t border-border flex justify-between items-center">
                      <span className="text-xs text-muted">المبلغ المطلوب تحصيله</span>
                      <span className="text-sm font-bold text-teal-400">{formatCurrency(delivery.price)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <a 
                      href={`tel:${delivery.phone}`}
                      className="flex-1 py-2.5 bg-surface-hover hover:bg-slate-700 text-foreground rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      <Phone className="w-4 h-4" />
                      <span>اتصال</span>
                    </a>
                    <button 
                      onClick={() => markAsCompleted(delivery.id)}
                      className="flex-[2] py-2.5 bg-teal-500 hover:bg-teal-600 text-foreground rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>تم التوصيل</span>
                    </button>
                  </div>
                </div>
              ))
            )
          ) : (
            completedDeliveries.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>لا توجد طلبات مكتملة حالياً</p>
              </div>
            ) : (
              completedDeliveries.map(delivery => (
                <div key={delivery.id} className="bg-surface border border-border rounded-2xl p-4 shadow-sm opacity-75">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground text-sm">#{delivery.id.split('-')[1]}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-400 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          مكتمل
                        </span>
                      </div>
                      {delivery.branchName && (
                        <span className="text-[10px] text-primary-400">{delivery.branchName}</span>
                      )}
                    </div>
                    <span className="text-muted text-xs">{delivery.time}</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-sm text-foreground">{delivery.customer}</p>
                      <p className="text-xs text-muted">{delivery.address}</p>
                      {delivery.location && (
                        <a 
                          href={`https://www.google.com/maps/search/?api=1&query=${delivery.location.lat},${delivery.location.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-1"
                        >
                          <MapPin className="w-3 h-3" />
                          عرض على الخريطة
                        </a>
                      )}
                    </div>
                    <span className="text-sm font-bold text-emerald-400">{formatCurrency(delivery.price)}</span>
                  </div>
                </div>
              ))
            )
          )}
        </div>
        </>
        )}
      </main>
    </div>
  );
}
