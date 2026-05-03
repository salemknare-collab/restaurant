import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  ClipboardList, 
  Settings, 
  LogOut,
  Bell,
  Search,
  ArrowRight,
  Store,
  Package,
  Users,
  Briefcase,
  ArrowLeftRight,
  Landmark,
  GitBranch,
  Calculator,
  BarChart2,
  FolderTree,
  Receipt,
  Menu,
  Sun,
  Moon
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useSettings } from '../context/SettingsContext';
import { auth } from '../firebase';

import { signOut } from 'firebase/auth';

export default function Layout() {
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024);
  const { theme, toggleTheme } = useTheme();
  const { storeSettings, invoiceSettings } = useSettings();
  const userEmail = auth.currentUser?.email;

  const [sessionInfo, setSessionInfo] = useState<{displayName: string, email: string} | null>(null);

  useEffect(() => {
     const localStr = localStorage.getItem('direct_employee_session');
     if (localStr) {
       try {
         const session = JSON.parse(localStr);
         setSessionInfo({ displayName: session.displayName || 'موظف', email: session.email || '' });
       } catch (e) {}
     }
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

  // Close sidebar on mobile when navigating
  const handleNavClick = (path: string) => {
    navigate(path);
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  };
  
  const navItems = [
    { icon: LayoutDashboard, label: 'لوحة التحكم', path: '/admin' },
    { icon: Receipt, label: 'فواتير حسب الطلب', path: '/admin/orders' },
    { icon: Package, label: 'مخازن ومنتجات', path: '/admin/inventory' },
    { icon: Package, label: 'المواد الخام', path: '/admin/raw-materials' },
    { icon: ShoppingCart, label: 'مشتريات المواد', path: '/admin/purchases' },
    { icon: Users, label: 'عملاء وموردين', path: '/admin/customers' },
    { icon: Briefcase, label: 'موظفين ومرتبات', path: '/admin/employees' },
    { icon: ArrowLeftRight, label: 'مصروفات وإيرادات', path: '/admin/transactions' },
    { icon: Landmark, label: 'الخزائن والمالية', path: '/admin/finance' },
    { icon: FolderTree, label: 'شجرة الحسابات', path: '/admin/chart-of-accounts' },
    { icon: GitBranch, label: 'الفروع', path: '/admin/branches' },
    { icon: Calculator, label: 'حساب تكلفة المنتجات', path: '/admin/costing' },
    { icon: BarChart2, label: 'تقارير', path: '/admin/reports' },
    { icon: Settings, label: 'الإعدادات', path: '/admin/settings' },
  ];

  return (
    <div className="flex h-screen bg-background overflow-hidden text-foreground font-sans" dir="rtl">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 right-0 z-50 w-64 bg-surface border-l border-border flex-col transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0 flex' : 'translate-x-full lg:translate-x-0 lg:flex hidden'}`}>
        <div className="h-16 flex items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-3">
            {invoiceSettings?.logoUrl ? (
              <img src={invoiceSettings.logoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-contain bg-white" />
            ) : (
              <div className="w-8 h-8 bg-primary-500/20 rounded-lg flex items-center justify-center">
                <Store className="w-5 h-5 text-primary-500" />
              </div>
            )}
            <div>
              <h1 className="text-sm font-bold text-foreground line-clamp-1">{sessionInfo ? sessionInfo.displayName : (storeSettings?.nameAr || 'المسؤول الرئيسي')}</h1>
              <p className="text-[10px] text-muted">{sessionInfo ? sessionInfo.email : (userEmail || 'admin@pos.com')}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 pos-scroll">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/admin'}
              onClick={() => {
                if (window.innerWidth < 1024) {
                  setIsSidebarOpen(false);
                }
              }}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary-500/10 text-primary-400 font-medium'
                    : 'text-muted hover:bg-surface-hover hover:text-foreground'
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              <span className="text-sm">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-border space-y-2">
          <button 
            onClick={() => navigate('/hub')}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors"
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>الصفحة الرئيسية</span>
          </button>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-surface border-b border-border flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4 flex-1 max-w-xl">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 text-muted hover:text-foreground transition-colors rounded-lg hover:bg-surface-hover"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
              <input 
                type="text" 
                placeholder="520ef7.arena.site" 
                className="w-full pl-4 pr-10 py-2 bg-background border border-border text-foreground placeholder-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow text-sm"
                dir="ltr"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 mr-4">
            <button 
              onClick={toggleTheme}
              className="p-2 text-muted hover:text-foreground transition-colors rounded-full hover:bg-surface-hover"
              title={theme === 'dark' ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button className="relative p-2 text-muted hover:text-foreground transition-colors rounded-full hover:bg-surface-hover">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-surface"></span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
