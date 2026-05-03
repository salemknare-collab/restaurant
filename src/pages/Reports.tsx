import React, { useState, useEffect } from 'react';
import { useUserAuth } from '../hooks/useUserAuth';

import { BarChart3, PieChart, TrendingUp, Calendar, Download, MapPin, User, Filter } from 'lucide-react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { ExportButtons } from '../components/ExportButtons';
import { exportToExcel, printTable } from '../lib/exportUtils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

export default function Reports() {
  const { branchId: userBranchId, hasPermission } = useUserAuth();
  const canViewAllBranches = hasPermission('branches.view_all');
  useEffect(() => {
    // Branch permissions check hook dependency
  }, [canViewAllBranches, userBranchId]);

  const [orders, setOrders] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [allBranches, setBranches] = useState<any[]>([]);
  const branches = canViewAllBranches ? allBranches : allBranches.filter(b => b.id === userBranchId);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'year' | 'all' | 'custom'>('week');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedEmployee, setSelectedEmployee] = useState('all');

  useEffect(() => {
    const unsubscribeOrders = onSnapshot(collection(db, 'orders'), (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOrders(ordersData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'orders');
    });

    const unsubscribeTransactions = onSnapshot(collection(db, 'dailyTransactions'), (snapshot) => {
      const transactionsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTransactions(transactionsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'dailyTransactions');
    });

    const unsubscribeBranches = onSnapshot(collection(db, 'branches'), (snapshot) => {
      const branchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBranches(branchesData);
    }, (error) => {
      console.error("Error fetching branches:", error);
    });

    const unsubscribeEmployees = onSnapshot(collection(db, 'employees'), (snapshot) => {
      const employeesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEmployees(employeesData);
    }, (error) => {
      console.error("Error fetching employees:", error);
    });

    return () => {
      unsubscribeOrders();
      unsubscribeTransactions();
      unsubscribeBranches();
      unsubscribeEmployees();
    };
  }, []);

  const getDateString = (dateVal: any): string => {
    if (!dateVal) return '';
    if (typeof dateVal === 'string') return dateVal;
    if (dateVal.toDate && typeof dateVal.toDate === 'function') {
      return dateVal.toDate().toISOString();
    }
    if (dateVal instanceof Date) {
      return dateVal.toISOString();
    }
    if (typeof dateVal === 'number') {
      return new Date(dateVal).toISOString();
    }
    return String(dateVal);
  };

  const applyFilters = (items: any[], type: 'order' | 'transaction') => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    return items.filter(item => {
      // 1. Date Filter
      let passesDate = true;
      const dateVal = item.date || item.createdAt;
      
      if (dateVal) {
        const itemDateStr = getDateString(dateVal);
        const itemDate = new Date(itemDateStr);
        
        if (dateRange === 'today') {
          passesDate = itemDateStr.startsWith(today);
        } else if (dateRange === 'week') {
          const weekAgo = new Date();
          weekAgo.setDate(now.getDate() - 7);
          passesDate = itemDate >= weekAgo;
        } else if (dateRange === 'month') {
          const monthAgo = new Date();
          monthAgo.setMonth(now.getMonth() - 1);
          passesDate = itemDate >= monthAgo;
        } else if (dateRange === 'year') {
          const yearAgo = new Date();
          yearAgo.setFullYear(now.getFullYear() - 1);
          passesDate = itemDate >= yearAgo;
        } else if (dateRange === 'custom') {
          if (startDate && endDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            passesDate = itemDate >= start && itemDate <= end;
          }
        }
      }

      // 2. Branch Filter
      let passesBranch = true;
      if (selectedBranch !== 'all') {
        if (type === 'order') {
          passesBranch = item.branchId === selectedBranch || item.branchName === branches.find(b => b.id === selectedBranch)?.name;
        } else if (type === 'transaction') {
          passesBranch = item.branchId === selectedBranch;
        }
      }

      // 3. Employee Filter
      let passesEmployee = true;
      if (selectedEmployee !== 'all') {
        const empName = employees.find(e => e.id === selectedEmployee)?.name;
        if (type === 'order') {
          passesEmployee = item.cashierId === selectedEmployee || item.cashierName === empName;
        } else if (type === 'transaction') {
          passesEmployee = item.createdBy === empName;
        }
      }

      return passesDate && passesBranch && passesEmployee;
    });
  };

  const filteredOrders = applyFilters(orders, 'order');
  const filteredTransactions = applyFilters(transactions, 'transaction');

  // Calculate Stats
  const totalSales = filteredOrders.reduce((sum, order) => sum + (order.total || 0), 0);
  
  const totalIncome = filteredTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + (t.amount || 0), 0);
    
  const totalExpense = filteredTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + (t.amount || 0), 0);
    
  const netProfit = totalIncome - totalExpense;
  
  const totalOrdersCount = filteredOrders.length;
  const averageOrderValue = totalOrdersCount > 0 ? totalSales / totalOrdersCount : 0;

  // Prepare data for Sales Chart (Last 7 days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split('T')[0];
  }).reverse();

  const salesData = last7Days.map(date => {
    const dayOrders = orders.filter(order => {
      const dateStr = getDateString(order.createdAt);
      return dateStr.startsWith(date);
    });
    const dayTotal = dayOrders.reduce((sum, order) => sum + (order.total || 0), 0);
    return {
      name: new Date(date).toLocaleDateString('ar-SA', { weekday: 'short' }),
      المبيعات: dayTotal
    };
  });

  // Prepare data for Top Products Chart
  const productSales: Record<string, number> = {};
  filteredOrders.forEach(order => {
    if (order.items && Array.isArray(order.items)) {
      order.items.forEach((item: any) => {
        if (item.name) {
          productSales[item.name] = (productSales[item.name] || 0) + (item.quantity || 1);
        }
      });
    }
  });

  const topProductsData = Object.entries(productSales)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

  // Calculate Daily Stats
  const todayStr = new Date().toISOString().split('T')[0];
  const todayOrders = orders.filter(order => {
    const dateStr = getDateString(order.createdAt);
    return dateStr.startsWith(todayStr);
  });
  const todaySales = todayOrders.reduce((sum, order) => sum + (order.total || 0), 0);
  const todayOrdersCount = todayOrders.length;
  const todayAverageOrderValue = todayOrdersCount > 0 ? todaySales / todayOrdersCount : 0;

// Prepare data for Sales by Employee
  const employeeSales: Record<string, { 
    id: string,
    sales: number, 
    orders: number,
    methods: { cash: number, card: number, unknown: number },
    types: { dine_in: number, takeaway: number, delivery: number },
    itemsSold: number,
    orderList: any[]
  }> = {};
  
  filteredOrders.forEach(order => {
    const empName = order.cashierName || 'موظف غير معروف';
    if (!employeeSales[empName]) {
      employeeSales[empName] = { 
        id: order.cashierId || 'unknown',
        sales: 0, 
        orders: 0,
        methods: { cash: 0, card: 0, unknown: 0 },
        types: { dine_in: 0, takeaway: 0, delivery: 0 },
        itemsSold: 0,
        orderList: []
      };
    }
    const empStats = employeeSales[empName];
    empStats.sales += (order.total || 0);
    empStats.orders += 1;
    empStats.orderList.push(order);
    
    // Method
    const methodStr = (order.method || '').toLowerCase();
    if (methodStr === 'cash' || methodStr === 'نقدي' || methodStr === 'كاش') empStats.methods.cash += (order.total || 0);
    else if (methodStr === 'card' || methodStr === 'بطاقة') empStats.methods.card += (order.total || 0);
    else empStats.methods.unknown += (order.total || 0);
    
    // Type
    const typeStr = (order.orderType || '').toLowerCase();
    if (typeStr === 'dine_in') empStats.types.dine_in += 1;
    else if (typeStr === 'takeaway') empStats.types.takeaway += 1;
    else if (typeStr === 'delivery') empStats.types.delivery += 1;
    
    // Items sold
    if (order.items && Array.isArray(order.items)) {
      empStats.itemsSold += order.items.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0);
    }
  });

  const employeeSalesData = Object.entries(employeeSales)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.sales - a.sales);

  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);

  const handleExport = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="p-6 bg-background min-h-full flex items-center justify-center">
        <div className="text-foreground">جاري تحميل البيانات...</div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-background min-h-full text-foreground" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">التقارير والإحصائيات</h1>
          <p className="text-muted">تحليل الأداء المالي والمبيعات والعمليات</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleExport}
            className="bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors"
          >
            <Download className="w-5 h-5" />
            <span className="hidden sm:inline">تصدير التقرير</span>
          </button>
        </div>
      </div>

      {/* Filters Section */}
      <div className="bg-surface border border-border rounded-xl p-4 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-primary-500" />
          <h2 className="text-lg font-bold text-foreground">تصفية التقارير</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Date Range Filter */}
          <div className="relative">
            <label className="block text-xs text-muted-foreground mb-1">الفترة الزمنية</label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as any)}
              className="w-full appearance-none bg-background text-foreground px-4 py-2 pr-10 rounded-lg font-medium transition-colors border border-border outline-none cursor-pointer"
            >
              <option value="today">اليوم</option>
              <option value="week">آخر 7 أيام</option>
              <option value="month">آخر 30 يوم</option>
              <option value="year">هذا العام</option>
              <option value="custom">فترة مخصصة</option>
              <option value="all">كل الأوقات</option>
            </select>
            <Calendar className="w-4 h-4 absolute right-3 top-[28px] text-muted pointer-events-none" />
          </div>

          {/* Custom Date Range (shows only if 'custom' is selected) */}
          {dateRange === 'custom' && (
            <div className="col-span-1 md:col-span-2 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">من تاريخ</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-background text-foreground px-3 py-2 rounded-lg font-medium transition-colors border border-border outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">إلى تاريخ</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-background text-foreground px-3 py-2 rounded-lg font-medium transition-colors border border-border outline-none"
                />
              </div>
            </div>
          )}

          {/* Branch Filter */}
          <div className="relative">
            <label className="block text-xs text-muted-foreground mb-1">الفرع</label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full appearance-none bg-background text-foreground px-4 py-2 pr-10 rounded-lg font-medium transition-colors border border-border outline-none cursor-pointer"
            >
              <option value="all">كل الفروع</option>
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
            <MapPin className="w-4 h-4 absolute right-3 top-[28px] text-muted pointer-events-none" />
          </div>

          {/* Employee Filter */}
          <div className="relative">
            <label className="block text-xs text-muted-foreground mb-1">الموظف</label>
            <select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="w-full appearance-none bg-background text-foreground px-4 py-2 pr-10 rounded-lg font-medium transition-colors border border-border outline-none cursor-pointer"
            >
              <option value="all">كل الموظفين</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
            <User className="w-4 h-4 absolute right-3 top-[28px] text-muted pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-blue-500" />
            </div>
            <h3 className="text-sm font-medium text-muted-foreground">إجمالي المبيعات</h3>
          </div>
          <p className="text-2xl font-bold text-foreground mb-2">{totalSales.toLocaleString()} د.ل</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-emerald-500" />
            </div>
            <h3 className="text-sm font-medium text-muted-foreground">صافي الأرباح</h3>
          </div>
          <p className="text-2xl font-bold text-foreground mb-2">{netProfit.toLocaleString()} د.ل</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <PieChart className="w-5 h-5 text-purple-500" />
            </div>
            <h3 className="text-sm font-medium text-muted-foreground">إجمالي الطلبات</h3>
          </div>
          <p className="text-2xl font-bold text-foreground mb-2">{totalOrdersCount}</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-amber-500" />
            </div>
            <h3 className="text-sm font-medium text-muted-foreground">متوسط قيمة الطلب</h3>
          </div>
          <p className="text-2xl font-bold text-foreground mb-2">{averageOrderValue.toFixed(2)} د.ل</p>
        </div>
      </div>

      <h2 className="text-xl font-bold text-foreground mb-4">تقرير مبيعات اليوم</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-background border border-border rounded-xl p-5">
          <p className="text-sm text-muted mb-1">مبيعات اليوم</p>
          <p className="text-2xl font-bold text-emerald-400">{todaySales.toLocaleString()} د.ل</p>
        </div>
        <div className="bg-background border border-border rounded-xl p-5">
          <p className="text-sm text-muted mb-1">طلبات اليوم</p>
          <p className="text-2xl font-bold text-blue-400">{todayOrdersCount}</p>
        </div>
        <div className="bg-background border border-border rounded-xl p-5">
          <p className="text-sm text-muted mb-1">متوسط قيمة الطلب (اليوم)</p>
          <p className="text-2xl font-bold text-amber-400">{todayAverageOrderValue.toFixed(2)} د.ل</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-surface border border-border rounded-xl p-6 h-96 flex flex-col">
          <h3 className="text-lg font-bold text-foreground mb-4">المبيعات خلال الأسبوع</h3>
          <div className="flex-1 w-full h-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                <Tooltip 
                  cursor={{ fill: '#1e293b' }}
                  contentStyle={{ backgroundColor: '#0b1120', borderColor: '#1e293b', color: '#fff', borderRadius: '8px' }}
                  itemStyle={{ color: '#3b82f6' }}
                />
                <Bar dataKey="المبيعات" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6 h-96 flex flex-col">
          <h3 className="text-lg font-bold text-foreground mb-4">أكثر المنتجات مبيعاً</h3>
          <div className="flex-1 w-full h-full" dir="ltr">
            {topProductsData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={topProductsData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {topProductsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0b1120', borderColor: '#1e293b', color: '#fff', borderRadius: '8px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={36}
                    iconType="circle"
                    formatter={(value) => <span style={{ color: '#cbd5e1', marginRight: '8px' }}>{value}</span>}
                  />
                </RechartsPieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                لا توجد بيانات كافية
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-6 mb-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-foreground">مبيعات الموظفين التفصيلية</h3>
          <ExportButtons 
            onExport={() => exportToExcel(Object.values(employeeSalesData), 'مبيعات_الموظفين')}
            onPrint={() => printTable('employee-sales-table', 'مبيعات الموظفين')}
          />
        </div>
        <p className="text-sm text-muted-foreground mb-4">انقر على اسم الموظف لعرض تفاصيل المبيعات وطرق الدفع ونوع الطلبات.</p>
        <div className="overflow-x-auto">
          <table id="employee-sales-table" className="w-full text-right">
            <thead>
              <tr className="border-b border-border bg-background">
                <th className="px-4 py-3 text-sm font-medium text-muted">اسم الموظف</th>
                <th className="px-4 py-3 text-sm font-medium text-muted">عدد الطلبات</th>
                <th className="px-4 py-3 text-sm font-medium text-muted">إجمالي المبيعات</th>
                <th className="px-4 py-3 text-sm font-medium text-muted">متوسط قيمة الطلب</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {employeeSalesData.map((emp, index) => (
                <React.Fragment key={index}>
                  <tr 
                    className={`hover:bg-surface-hover/50 transition-colors cursor-pointer ${expandedEmployee === emp.name ? 'bg-surface-hover shadow-inner' : ''}`}
                    onClick={() => setExpandedEmployee(expandedEmployee === emp.name ? null : emp.name)}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-foreground flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center border ${expandedEmployee === emp.name ? 'border-primary-500 text-primary-500' : 'border-border text-muted'} transition-colors`}>
                        {expandedEmployee === emp.name ? '-' : '+'}
                      </div>
                      {emp.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{emp.orders}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-400">{emp.sales.toFixed(2)} د.ل</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{(emp.sales / emp.orders).toFixed(2)} د.ل</td>
                  </tr>
                  {expandedEmployee === emp.name && (
                    <tr className="bg-surface-hover/30 border-b-2 border-border">
                      <td colSpan={4} className="px-6 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                          <div className="bg-background border border-border p-3 rounded-lg">
                            <h4 className="text-xs font-semibold text-muted-foreground mb-2 border-b border-border pb-1">طرق الدفع</h4>
                            <div className="flex justify-between items-center text-sm py-1">
                              <span className="text-foreground">نقدي</span>
                              <span className="font-medium text-emerald-400">{emp.methods.cash.toFixed(2)} د.ل</span>
                            </div>
                            <div className="flex justify-between items-center text-sm py-1">
                              <span className="text-foreground">بطاقة</span>
                              <span className="font-medium text-blue-400">{emp.methods.card.toFixed(2)} د.ل</span>
                            </div>
                            {emp.methods.unknown > 0 && (
                              <div className="flex justify-between items-center text-sm py-1">
                                <span className="text-foreground">أخرى</span>
                                <span className="font-medium text-amber-400">{emp.methods.unknown.toFixed(2)} د.ل</span>
                              </div>
                            )}
                          </div>
                          
                          <div className="bg-background border border-border p-3 rounded-lg">
                            <h4 className="text-xs font-semibold text-muted-foreground mb-2 border-b border-border pb-1">نوع الطلب (العدد)</h4>
                            <div className="flex justify-between items-center text-sm py-1">
                              <span className="text-foreground">داخلي</span>
                              <span className="font-medium text-white">{emp.types.dine_in}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm py-1">
                              <span className="text-foreground">سفري</span>
                              <span className="font-medium text-white">{emp.types.takeaway}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm py-1">
                              <span className="text-foreground">توصيل</span>
                              <span className="font-medium text-white">{emp.types.delivery}</span>
                            </div>
                          </div>

                          <div className="bg-background border border-border p-3 rounded-lg">
                            <h4 className="text-xs font-semibold text-muted-foreground mb-2 border-b border-border pb-1">المنتجات</h4>
                            <div className="flex justify-between items-center text-sm py-1">
                              <span className="text-foreground">إجمالي المنتجات المباعة</span>
                              <span className="font-medium text-white">{emp.itemsSold} منتج</span>
                            </div>
                            <div className="flex justify-between items-center text-sm py-1 mt-2">
                              <span className="text-foreground">متوسط المنتجات/الطلب</span>
                              <span className="font-medium text-white">{(emp.itemsSold / emp.orders).toFixed(1)}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {employeeSalesData.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">لا توجد بيانات مبيعات للموظفين</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
