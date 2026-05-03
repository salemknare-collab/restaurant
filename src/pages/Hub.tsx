import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChefHat, 
  Users, 
  MonitorSmartphone, 
  LayoutDashboard, 
  Truck,
  Sun,
  Moon,
  UserCircle,
  LogOut
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export default function Hub() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [userRole, setUserRole] = useState<string>('');
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [userName, setUserName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUserData = async () => {
      // Check local session first (new direct db auth method)
      const localSessionStr = localStorage.getItem('direct_employee_session');
      if (localSessionStr) {
        try {
          const session = JSON.parse(localSessionStr);
          setUserName(session.displayName || session.uid);
          setUserRole(session.roleId || '');
          setUserPermissions(session.permissions || []);
          setIsLoading(false);
          return;
        } catch (e) {
          console.error("Invalid local session", e);
        }
      }

      const user = auth.currentUser;
      if (!user) {
        setIsLoading(false);
        return;
      }

      const email = user.email || '';
      if (!email) return;
      
      if (!email) {
         // Anonymous session without valid local structure
         setIsLoading(false);
         return;
      }

      if (email === 'salem.sam59@gmail.com') {
        setUserRole('admin');
        setUserName('المسؤول الرئيسي');
        setIsLoading(false);
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', email));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setUserName(userData.name || '');
          setUserRole(userData.roleId || '');
          
          if (userData.permissions && userData.permissions.length > 0) {
            setUserPermissions(userData.permissions);
          } else if (userData.roleId) {
            const roleDoc = await getDoc(doc(db, 'roles', userData.roleId));
            if (roleDoc.exists()) {
              setUserPermissions(roleDoc.data().permissions || []);
            } else {
              if (userData.roleId === 'cashier' || userData.roleId === 'pos') setUserPermissions(['pos.access', 'product.availability']);
              if (userData.roleId === 'chef' || userData.roleId === 'kitchen') setUserPermissions(['kitchen.access', 'product.availability']);
              if (userData.roleId === 'driver') setUserPermissions(['driver.access']);
            }
          }
        } else if (email.endsWith('@restaurant.internal')) {
          setUserRole('admin');
          setUserName('مدير النظام');
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, []);

  const handleLogout = async () => {
    try {
      localStorage.removeItem('direct_employee_session');
      await signOut(auth).catch(e => console.error("Sign out error:", e));
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const modules = [
    {
      id: 'kitchen',
      title: 'شاشة المطبخ',
      subtitle: 'Kitchen Display',
      description: 'عرض الطلبات للمطبخ وتحديث حالة التحضير',
      icon: ChefHat,
      color: 'from-orange-500 to-red-600',
      path: '/kitchen'
    },
    {
      id: 'customer',
      title: 'شاشة الزبائن',
      subtitle: 'Customer App',
      description: 'تصفح القائمة والطلب وتتبع حالة الطلب',
      icon: Users,
      color: 'from-emerald-400 to-emerald-600',
      path: '/customer'
    },
    {
      id: 'pos',
      title: 'نقطة البيع',
      subtitle: 'POS Terminal',
      description: 'شاشة الكاشير لإدخال الطلبات وإتمام عمليات البيع',
      icon: MonitorSmartphone,
      color: 'from-blue-500 to-indigo-600',
      path: '/pos'
    },
    {
      id: 'admin',
      title: 'لوحة التحكم',
      subtitle: 'Admin Dashboard',
      description: 'إدارة شاملة للنظام والتقارير والإعدادات',
      icon: LayoutDashboard,
      color: 'from-purple-500 to-purple-700',
      path: '/admin'
    },
    {
      id: 'driver',
      title: 'شاشة المندوب',
      subtitle: 'Driver App',
      description: 'إدارة طلبات التوصيل وتتبع المندوبين',
      icon: Truck,
      color: 'from-teal-400 to-teal-600',
      path: '/driver'
    }
  ];

  const hasAdminPerms = userPermissions.some(p => ['inventory.view', 'inventory.edit', 'reports.view', 'settings.access', 'users.manage'].includes(p));
  const isAdminOrManager = userRole === 'admin' || userRole === 'manager' || hasAdminPerms;

  const filteredModules = modules.filter(module => {
    if (module.id === 'admin') return isAdminOrManager;
    if (module.id === 'pos') return isAdminOrManager || userPermissions.includes('pos.access') || userRole === 'cashier' || userRole === 'pos';
    if (module.id === 'kitchen') return isAdminOrManager || userPermissions.includes('kitchen.access') || userRole === 'chef' || userRole === 'kitchen';
    if (module.id === 'driver') return isAdminOrManager || userPermissions.includes('driver.access') || userRole === 'driver';
    if (module.id === 'customer') return isAdminOrManager; // Only Admin/Manager can see customer app in hub
    return false;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-border bg-surface flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <div className="bg-primary-600 text-white p-1.5 rounded-lg font-bold text-xs">POS</div>
          <div>
            <h1 className="font-bold text-sm">نظام نقاط البيع للمطاعم</h1>
            <p className="text-[10px] text-muted">Restaurant POS System</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={toggleTheme}
            className="p-2 text-muted hover:text-foreground hover:bg-surface-hover rounded-full transition-colors"
            title={theme === 'dark' ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button 
            onClick={handleLogout}
            className="p-2 text-red-500 hover:bg-red-500/10 rounded-full transition-colors"
            title="تسجيل الخروج"
          >
            <LogOut className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 bg-surface-hover px-3 py-1.5 rounded-full border border-border">
            <div className="text-left">
              <p className="text-xs font-bold text-foreground">{userName || 'مستخدم'}</p>
              <p className="text-[10px] text-muted">{userRole === 'admin' ? 'مدير النظام' : userRole === 'manager' ? 'مدير فرع' : (userRole === 'cashier' || userRole === 'pos') ? 'نقطة بيع' : (userRole === 'chef' || userRole === 'kitchen') ? 'المطبخ' : userRole === 'driver' ? 'مندوب' : 'موظف'}</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center">
              <UserCircle className="w-5 h-5 text-foreground" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 max-w-6xl mx-auto w-full">
        {/* Welcome Banner */}
        <div className="bg-surface border border-border rounded-2xl p-6 mb-8 flex items-center justify-between relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary-600/10 to-transparent pointer-events-none"></div>
          <div className="relative z-10">
            <h2 className="text-xl font-bold text-foreground mb-1 flex items-center gap-2">
              <span>مرحباً بك،</span>
              <span className="text-primary-400">{userName || 'مستخدم'}</span>
              <span>👋</span>
            </h2>
            <p className="text-sm text-muted">
              أنت مسجل الدخول بصلاحية <span className="text-primary-400 font-medium">{userRole === 'admin' ? 'مدير النظام' : userRole === 'manager' ? 'مدير فرع' : (userRole === 'cashier' || userRole === 'pos') ? 'نقطة بيع' : (userRole === 'chef' || userRole === 'kitchen') ? 'المطبخ' : userRole === 'driver' ? 'مندوب' : 'موظف'}</span> — اختر الشاشة التي تريد الوصول إليها
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center shadow-lg shadow-purple-500/20 relative z-10">
            <UserCircle className="w-8 h-8 text-foreground" />
          </div>
        </div>

        <div className="text-center mb-8">
          <h3 className="text-2xl font-bold text-foreground mb-2">نظام متكامل لإدارة المطاعم</h3>
          <p className="text-muted text-sm max-w-2xl mx-auto">
            نظام متكامل لإدارة المطاعم يشمل نقطة البيع، شاشة المطبخ، تطبيق الزبائن، لوحة التحكم وتتبع مندوبي التوصيل
          </p>
        </div>

        {/* Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredModules.map((module, index) => {
            const Icon = module.icon;
            return (
              <button 
                key={module.id}
                onClick={() => navigate(module.path)} 
                className={`group text-right flex flex-col h-full bg-surface border border-border rounded-2xl overflow-hidden transition-all hover:shadow-lg ${
                  index === 3 ? 'lg:col-span-2' : ''
                } ${
                  module.id === 'kitchen' ? 'hover:border-orange-500/50 hover:shadow-orange-500/10' :
                  module.id === 'customer' ? 'hover:border-emerald-500/50 hover:shadow-emerald-500/10' :
                  module.id === 'pos' ? 'hover:border-blue-500/50 hover:shadow-blue-500/10 lg:col-span-1' :
                  module.id === 'admin' ? 'hover:border-purple-500/50 hover:shadow-purple-500/10' :
                  'hover:border-teal-500/50 hover:shadow-teal-500/10'
                }`}
              >
                <div className={`h-32 bg-gradient-to-br ${module.color} p-6 flex flex-col items-center justify-center relative overflow-hidden w-full`}>
                  <div className="absolute inset-0 bg-black/10"></div>
                  <Icon className="w-10 h-10 text-foreground mb-2 relative z-10" />
                  <h3 className="text-xl font-bold text-foreground relative z-10">{module.title}</h3>
                  <p className="text-foreground/80 text-xs relative z-10">{module.subtitle}</p>
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between bg-surface w-full">
                  <p className="text-sm text-muted mb-4">{module.description}</p>
                  <div className={`text-xs font-bold flex items-center gap-1 transition-colors ${
                    module.id === 'kitchen' ? 'text-muted-foreground group-hover:text-orange-400' :
                    module.id === 'customer' ? 'text-muted-foreground group-hover:text-emerald-400' :
                    module.id === 'pos' ? 'text-muted-foreground group-hover:text-blue-400' :
                    module.id === 'admin' ? 'text-muted-foreground group-hover:text-purple-400' :
                    'text-muted-foreground group-hover:text-teal-400'
                  }`}>
                    <span>فتح الشاشة</span>
                    <span>←</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        
        <footer className="mt-12 text-center text-xs text-slate-600">
          © 2026 نظام نقاط البيع للمطاعم - جميع الحقوق محفوظة
        </footer>
      </main>
    </div>
  );
}
