import React, { useState, useEffect } from 'react';
import { useUserAuth } from '../hooks/useUserAuth';
import { 
  TrendingUp, 
  Users, 
  ShoppingBag, 
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Truck,
  Phone
} from 'lucide-react';
import { useFormatCurrency } from '../hooks/useFormatCurrency';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';

export default function Dashboard() {
  const { branchId: userBranchId, hasPermission } = useUserAuth();
  const canViewAllBranches = hasPermission('branches.view_all');

  const formatCurrency = useFormatCurrency();
  const [salesData, setSalesData] = useState<any[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [activeDeliveries, setActiveDeliveries] = useState<any[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [period, setPeriod] = useState('اليوم');
  const [stats, setStats] = useState({
    totalSales: 0,
    totalOrders: 0,
    averageOrderValue: 0,
    newCustomers: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('timestamp', 'desc'));
    const unsubscribeOrders = onSnapshot(q, (snapshot) => {
      let orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (!canViewAllBranches && userBranchId) {
        orders = orders.filter((o: any) => o.branchId === userBranchId);
      }
      
      const now = new Date();
      let startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      let endDate = new Date();

      if (period === 'أمس') {
        startDate.setDate(startDate.getDate() - 1);
        endDate = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);
      } else if (period === 'آخر 7 أيام') {
        startDate.setDate(startDate.getDate() - 7);
      } else if (period === 'هذا الشهر') {
        startDate.setDate(1);
      }

      // Filter locally to avoid missing index errors
      orders = orders.filter((order: any) => {
        if (!order.timestamp) return false;
        const date = order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
        if (period === 'أمس') {
          return date >= startDate && date <= endDate;
        }
        return date >= startDate;
      });
      
      // Calculate stats
      const totalSales = orders.reduce((sum, order: any) => sum + (order.total || 0), 0);
      const totalOrders = orders.length;
      const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
      
      setStats(prev => ({
        ...prev,
        totalSales,
        totalOrders,
        averageOrderValue,
      }));

      // Active deliveries (where status is out_for_delivery)
      setActiveDeliveries(orders.filter((o: any) => o.status === 'out_for_delivery'));

      // Recent orders (top 5)
      setRecentOrders(orders.slice(0, 5));

      // Process sales data for chart (group by hour for today, or just simple mock if no data)
      if (orders.length > 0) {
        const hourlyData: Record<string, { sales: number, orders: number }> = {};
        orders.forEach((order: any) => {
          if (order.timestamp) {
            const date = order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
            let key = '';
            if (period === 'اليوم' || period === 'أمس') {
              key = `${date.getHours().toString().padStart(2, '0')}:00`;
            } else {
              key = `${date.getMonth() + 1}/${date.getDate()}`;
            }
            if (!hourlyData[key]) hourlyData[key] = { sales: 0, orders: 0 };
            hourlyData[key].sales += (order.total || 0);
            hourlyData[key].orders += 1;
          }
        });
        
        const chartData = Object.keys(hourlyData).sort().map(key => ({
          time: key,
          sales: hourlyData[key].sales,
          orders: hourlyData[key].orders
        }));
        setSalesData(chartData);
      } else {
        setSalesData([]);
      }
      
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'orders');
      setLoading(false);
    });

    const unsubscribeProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      let products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (!canViewAllBranches && userBranchId) {
        products = products.filter((p: any) => p.branchId === userBranchId);
      }
      const lowStock = products.filter((p: any) => p.stock <= (p.minStock || 0));
      setLowStockProducts(lowStock);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'products');
    });

    const unsubscribeCustomers = onSnapshot(collection(db, 'partners'), (snapshot) => {
      let partners = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const newCustomersCount = partners.filter((p: any) => p.type === 'customer').length;
      setStats(prev => ({
        ...prev,
        newCustomers: newCustomersCount
      }));
    });

    return () => {
      unsubscribeOrders();
      unsubscribeProducts();
      unsubscribeCustomers();
    };
  }, [period, canViewAllBranches, userBranchId]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-full bg-background">
        <div className="text-foreground">جاري تحميل البيانات...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-background min-h-full text-foreground">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-1">نظرة عامة</h2>
          <p className="text-xs text-muted">ملخص أداء المبيعات والطلبات</p>
        </div>
        <div className="flex gap-2">
          <select 
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="bg-surface border border-border text-muted-foreground text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 outline-none"
          >
            <option value="اليوم">اليوم</option>
            <option value="أمس">أمس</option>
            <option value="آخر 7 أيام">آخر 7 أيام</option>
            <option value="هذا الشهر">هذا الشهر</option>
          </select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-surface rounded-2xl p-6 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-primary-500/20 rounded-xl flex items-center justify-center text-primary-400">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>
          <h3 className="text-muted text-xs font-medium mb-1">إجمالي المبيعات</h3>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(stats.totalSales)}</p>
        </div>

        <div className="bg-surface rounded-2xl p-6 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-400">
              <ShoppingBag className="w-6 h-6" />
            </div>
          </div>
          <h3 className="text-muted text-xs font-medium mb-1">إجمالي الطلبات</h3>
          <p className="text-2xl font-bold text-foreground">{stats.totalOrders}</p>
        </div>

        <div className="bg-surface rounded-2xl p-6 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center text-orange-400">
              <Users className="w-6 h-6" />
            </div>
          </div>
          <h3 className="text-muted text-xs font-medium mb-1">العملاء</h3>
          <p className="text-2xl font-bold text-foreground">{stats.newCustomers}</p>
        </div>

        <div className="bg-surface rounded-2xl p-6 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center text-purple-400">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
          <h3 className="text-muted text-xs font-medium mb-1">متوسط قيمة الطلب</h3>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(stats.averageOrderValue)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Low Stock Alerts */}
        {lowStockProducts.length > 0 && (
          <div className="lg:col-span-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center text-red-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-red-400">تنبيه: منتجات منخفضة المخزون</h3>
                <p className="text-sm text-red-400/80">يوجد {lowStockProducts.length} منتجات وصل مخزونها للحد الأدنى أو نفذت.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {lowStockProducts.map(product => (
                <div key={product.id} className="bg-surface border border-red-500/30 rounded-xl p-4 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-foreground text-sm">{product.name}</p>
                    <p className="text-xs text-muted mt-1">الحد الأدنى: {product.minStock || 0}</p>
                  </div>
                  <div className="text-center">
                    <span className={`text-lg font-bold ${product.stock <= 0 ? 'text-red-500' : 'text-orange-400'}`}>
                      {product.stock}
                    </span>
                    <p className="text-[10px] text-muted-foreground">المتبقي</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sales Chart */}
        <div className="lg:col-span-2 bg-surface rounded-2xl p-6 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-foreground">المبيعات اليومية</h3>
            <button className="text-sm text-primary-400 hover:text-primary-300 font-medium">عرض التقرير المفصل</button>
          </div>
          <div className="h-80 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111827', borderRadius: '12px', border: '1px solid #1e293b', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                  formatter={(value: number) => [formatCurrency(value), 'المبيعات']}
                  labelFormatter={(label) => `الوقت: ${label}`}
                />
                <Area type="monotone" dataKey="sales" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Orders */}
        <div className="bg-surface rounded-2xl p-6 border border-border shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-foreground">أحدث الطلبات</h3>
            <button className="text-sm text-primary-400 hover:text-primary-300 font-medium">عرض الكل</button>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 space-y-4 pos-scroll">
            {recentOrders.map((order) => {
              const orderTime = order.timestamp?.toDate ? order.timestamp.toDate().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : 'الآن';
              return (
              <div key={order.id} className="flex items-center justify-between p-3 hover:bg-surface-hover rounded-xl transition-colors border border-transparent hover:border-primary-500/50 cursor-pointer">
                <div>
                  <p className="font-medium text-foreground text-sm">#{order.orderNumber || order.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted mt-1">{orderTime} • {
                    order.type === 'dine_in' ? 'محلي' : 
                    order.type === 'takeaway' ? 'سفري' : 'توصيل'
                  }</p>
                </div>
                <div className="text-left">
                  <p className="font-bold text-primary-400 text-sm">{formatCurrency(order.total || 0)}</p>
                  <span className={`inline-block px-2 py-1 rounded-md text-[10px] font-medium mt-1 ${
                    order.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                    order.status === 'preparing' ? 'bg-orange-500/10 text-orange-400' :
                    order.status === 'ready' ? 'bg-blue-500/10 text-blue-400' :
                    'bg-surface-hover text-muted-foreground'
                  }`}>
                    {
                      order.status === 'completed' ? 'مكتمل' :
                      order.status === 'preparing' ? 'قيد التحضير' :
                      order.status === 'ready' ? 'جاهز' : order.status || 'جديد'
                    }
                  </span>
                </div>
              </div>
            )})}
            {recentOrders.length === 0 && (
              <div className="text-center text-muted-foreground py-8 text-sm">لا توجد طلبات حديثة</div>
            )}
          </div>
        </div>
      </div>

      {/* Active Deliveries */}
      <div className="bg-surface rounded-2xl p-6 border border-border shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-teal-500/20 text-teal-400 p-2 rounded-xl">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">تتبع المندوبين النشطين</h3>
            <p className="text-xs text-muted mt-1">الطلبات الجاري توصيلها حالياً ({activeDeliveries.length})</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeDeliveries.length > 0 ? activeDeliveries.map(delivery => (
            <div key={delivery.id} className="bg-background border border-border rounded-xl p-4 flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-bold text-foreground mb-1">#{delivery.orderId || delivery.id.slice(0, 6)}</p>
                  <p className="text-xs text-muted flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {delivery.customerName || delivery.customer}
                  </p>
                </div>
                <div className="text-left flex flex-col items-end">
                  <span className="text-[10px] font-bold px-2 py-1 bg-teal-500/10 text-teal-500 rounded-md">جاري التوصيل</span>
                  <span className="text-xs text-foreground font-bold mt-1">{formatCurrency(delivery.total || 0)}</span>
                </div>
              </div>
              <div className="bg-surface-hover/50 p-2 rounded-lg border border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-teal-400" />
                  <span className="text-xs font-medium text-foreground">{delivery.driverName || 'مندوب غير محدد'}</span>
                </div>
                {delivery.driverPhone && (
                  <a href={`tel:${delivery.driverPhone}`} className="text-teal-500 hover:text-teal-400 p-1 bg-teal-500/10 rounded-md transition-colors">
                    <Phone className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          )) : (
            <div className="col-span-full text-center py-6 text-muted-foreground border border-dashed border-border rounded-xl">
              لا توجد طلبات جاري توصيلها حالياً
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
