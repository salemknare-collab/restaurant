import React, { useState, useEffect } from 'react';
import { useUserAuth } from '../hooks/useUserAuth';

import { Users, Plus, Search, Filter, Edit2, Trash2, Briefcase, DollarSign, X, AlertCircle, Activity, FileText, Eye, Banknote, Shield, Check } from 'lucide-react';
import { db, secondaryAuth } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, addDoc, writeBatch } from 'firebase/firestore';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { handleFirestoreError, OperationType, generateInternalEmail } from '../lib/firestoreUtils';
import { ExportButtons } from '../components/ExportButtons';
import { exportToExcel, printTable } from '../lib/exportUtils';

const AVAILABLE_PERMISSIONS = [
  { id: 'pos.access', name: 'الوصول لنقطة البيع', module: 'نقطة البيع', description: 'السماح بفتح شاشة الكاشير وإجراء الطلبات' },
  { id: 'pos.discount', name: 'تطبيق خصم', module: 'نقطة البيع', description: 'السماح بتطبيق خصومات على الطلبات' },
  { id: 'pos.void', name: 'إلغاء طلب', module: 'نقطة البيع', description: 'السماح بإلغاء الطلبات بعد الدفع' },
  { id: 'kitchen.access', name: 'الوصول للمطبخ', module: 'المطبخ', description: 'السماح بعرض شاشة المطبخ وتحديث حالة الطلبات' },
  { id: 'inventory.view', name: 'عرض المخزون', module: 'المخزون', description: 'السماح برؤية المنتجات والكميات' },
  { id: 'inventory.edit', name: 'تعديل المخزون', module: 'المخزون', description: 'السماح بإضافة وتعديل وحذف المنتجات' },
  { id: 'product.availability', name: 'تغيير حالة توفر المنتج', module: 'المخزون', description: 'السماح بتغيير حالة توفر المنتج (متاح/غير متاح)' },
  { id: 'reports.view', name: 'عرض التقارير', module: 'التقارير', description: 'السماح برؤية تقارير المبيعات والأداء' },
  { id: 'settings.access', name: 'إدارة الإعدادات', module: 'الإعدادات', description: 'السماح بتعديل إعدادات النظام' },
  { id: 'users.manage', name: 'إدارة المستخدمين', module: 'المستخدمين', description: 'السماح بإضافة وتعديل المستخدمين والصلاحيات' },
  { id: 'driver.access', name: 'شاشة المندوب', module: 'التوصيل', description: 'السماح بعرض شاشة المندوب واستلام الطلبات' }
];

const EMPLOYEE_ROLES = [
  { id: 'employee', name: 'موظف', hasLogin: false },
  { id: 'worker', name: 'عامل', hasLogin: false },
  { id: 'kitchen', name: 'المطبخ', hasLogin: true },
  { id: 'driver', name: 'مندوب التوصيل', hasLogin: true },
  { id: 'pos', name: 'نقطة البيع', hasLogin: true },
  { id: 'manager', name: 'مدير', hasLogin: true }
];

export default function Employees() {
  const { branchId: userBranchId, hasPermission } = useUserAuth();
  const canViewAllBranches = hasPermission('branches.view_all');
  useEffect(() => {
    // Branch permissions check hook dependency
  }, [canViewAllBranches, userBranchId]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [activeTab, setActiveTab] = useState<'employees' | 'payroll'>('employees');
  const [payrollMonth, setPayrollMonth] = useState(new Date().toISOString().slice(0, 7));
  const [employees, setEmployees] = useState<any[]>([]);
  const [allBranches, setBranches] = useState<any[]>([]);
  const branches = canViewAllBranches ? allBranches : allBranches.filter(b => b.id === userBranchId);
  const [financeAccounts, setFinanceAccounts] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any>(null);
  const [formData, setFormData] = useState({ name: '', role: '', phone: '', salary: 0, status: 'نشط', branch: '', username: '', password: '', permissions: [] as string[] });
  const [employeeToDelete, setEmployeeToDelete] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [selectedEmployeeForAction, setSelectedEmployeeForAction] = useState<any>(null);
  const [actionData, setActionData] = useState({ type: 'advance', amount: 0, date: new Date().toISOString().split('T')[0], note: '', accountId: '' });

  const [isSalaryModalOpen, setIsSalaryModalOpen] = useState(false);
  const [selectedEmployeeForSalary, setSelectedEmployeeForSalary] = useState<any>(null);
  const [salaryFormData, setSalaryFormData] = useState({ amount: 0, date: new Date().toISOString().split('T')[0], accountId: '', note: '' });

  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedEmployeeForDetails, setSelectedEmployeeForDetails] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [detailsTab, setDetailsTab] = useState<'info' | 'dailyTransactions'>('info');

  useEffect(() => {
    const unsubscribeEmployees = onSnapshot(collection(db, 'employees'), (snapshot) => {
      const employeesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEmployees(employeesData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'employees');
    });

    const unsubscribeBranches = onSnapshot(collection(db, 'branches'), (snapshot) => {
      const branchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBranches(branchesData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'branches');
    });

    const unsubscribeTransactions = onSnapshot(collection(db, 'payroll'), (snapshot) => {
      const transactionsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTransactions(transactionsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'payroll');
    });

    const unsubscribeAccounts = onSnapshot(collection(db, 'accounts'), (snapshot) => {
      const accountsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFinanceAccounts(accountsData);
    }, (error) => {
      console.error("Error fetching finance accounts:", error);
    });

    return () => {
      unsubscribeEmployees();
      unsubscribeBranches();
      unsubscribeTransactions();
      unsubscribeAccounts();
    };
  }, []);

  const confirmDelete = async () => {
    if (employeeToDelete) {
      try {
        const emp = employees.find(e => e.id === employeeToDelete);
        const batch = writeBatch(db);
        
        batch.delete(doc(db, 'employees', employeeToDelete));
        
        if (emp && emp.username) {
            batch.delete(doc(db, 'users', emp.username));
        }
        
        await batch.commit();
        setEmployeeToDelete(null);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `employees/${employeeToDelete}`);
      }
    }
  };

  const handleOpenModal = (employee: any = null) => {
    setValidationError(null);
    if (employee) {
      setEditingEmployee(employee);
      setFormData({ 
        name: employee.name || '', 
        role: employee.role || '', 
        phone: employee.phone || '', 
        salary: employee.salary || 0, 
        status: employee.status || 'نشط',
        branch: employee.branch || '',
        username: employee.username || '',
        password: '', // do not show existing password
        permissions: employee.permissions || []
      });
    } else {
      setEditingEmployee(null);
      setFormData({ name: '', role: '', phone: '', salary: 0, status: 'نشط', branch: '', username: '', password: '', permissions: [] as string[] });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name) {
      setValidationError('الرجاء إدخال اسم الموظف');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }
    if (!formData.role) {
      setValidationError('الرجاء اختيار الدور');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    const selectedRole = EMPLOYEE_ROLES.find(r => r.name === formData.role || r.id === formData.role);
    const hasLogin = selectedRole?.hasLogin || false;
    const isCreatingAuth = hasLogin && (!editingEmployee || !editingEmployee.username);

    let finalEmail = '';
    let finalUsername = '';

    if (hasLogin) {
      if (!formData.username) {
        setValidationError('الرجاء إدخال اسم مستخدم');
        setTimeout(() => setValidationError(null), 3000);
        return;
      }
      finalUsername = formData.username.trim();
      finalEmail = generateInternalEmail(finalUsername);

      if (!finalEmail) {
        setValidationError('اسم المستخدم غير صالح لتوليد حساب دخول');
        setTimeout(() => setValidationError(null), 3000);
        return;
      }

      if (isCreatingAuth && (!formData.password || formData.password.length < 6)) {
        setValidationError('الرجاء إدخال كلمة مرور صالحة (6 أحرف على الأقل)');
        setTimeout(() => setValidationError(null), 3000);
        return;
      }
    }

    try {
      const employeeDataToSave: any = {
        name: formData.name,
        role: formData.role,
        phone: formData.phone,
        salary: formData.salary,
        status: formData.status,
        branch: formData.branch,
      };

      if (hasLogin) {
        employeeDataToSave.username = finalUsername;
        employeeDataToSave.permissions = formData.permissions;
      }

      let employeeId = editingEmployee?.id;

      if (editingEmployee) {
        await setDoc(doc(db, 'employees', editingEmployee.id), employeeDataToSave, { merge: true });
      } else {
        const newEmpRef = await addDoc(collection(db, 'employees'), { ...employeeDataToSave, joinDate: new Date().toISOString().split('T')[0] });
        employeeId = newEmpRef.id;
      }

      // Sync with users collection if hasLogin
      if (hasLogin) {
        // ALWAYS SAVE WITH UID === USERNAME so that direct getDoc(doc(db, "users", username)) works
        const userDocRef = doc(db, 'users', finalUsername); 
        
        const baseUserData: any = {
          name: formData.name,
          username: finalUsername,
          roleId: formData.role,
          role: selectedRole?.id || formData.role,
          status: formData.status,
          permissions: formData.permissions || [],
          branchId: formData.branch || '',
          employeeId: employeeId
        };

        if (isCreatingAuth) {
           baseUserData.id = Date.now().toString();
           baseUserData.createdAt = new Date().toISOString();
        }

        // Set password explicitly if we are creating auth or updating
        if (isCreatingAuth || formData.password) {
           await setDoc(userDocRef, { ...baseUserData, password: formData.password }, { merge: true });
        } else {
           await setDoc(userDocRef, baseUserData, { merge: true });
        }
      }

      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'employees');
    }
  };

  const handleOpenActionModal = (employee: any) => {
    setSelectedEmployeeForAction(employee);
    setActionData({ type: 'advance', amount: 0, date: new Date().toISOString().split('T')[0], note: '', accountId: '' });
    setIsActionModalOpen(true);
  };

  const handleOpenDetailsModal = (employee: any) => {
    setSelectedEmployeeForDetails(employee);
    setDetailsTab('dailyTransactions');
    setIsDetailsModalOpen(true);
  };

  const handleSaveAction = async () => {
    if (!selectedEmployeeForAction) return;
    if (actionData.amount <= 0 && actionData.type !== 'absence') {
      setValidationError('الرجاء إدخال مبلغ صحيح');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }
    if (actionData.type === 'advance' && !actionData.accountId) {
      setValidationError('الرجاء اختيار الخزينة/الحساب المالي');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    try {
      const batch = writeBatch(db);
      
      const empTransRef = doc(collection(db, 'payroll'));
      batch.set(empTransRef, {
        employeeId: selectedEmployeeForAction.id,
        employeeName: selectedEmployeeForAction.name,
        type: actionData.type,
        amount: actionData.amount,
        date: actionData.date,
        note: actionData.note,
        createdAt: new Date().toISOString()
      });

      if (actionData.type === 'advance' && actionData.accountId) {
        const account = financeAccounts.find(a => a.id === actionData.accountId);
        if (account) {
          const financeTransRef = doc(collection(db, 'dailyTransactions'));
          batch.set(financeTransRef, {
            type: 'expense',
            category: 'سلف موظفين',
            amount: actionData.amount,
            date: actionData.date,
            description: `سلفة للموظف: ${selectedEmployeeForAction.name} - ${actionData.note}`,
            reference: '',
            accountId: actionData.accountId,
            accountName: account.name,
            createdAt: new Date().toISOString()
          });

          const accountRef = doc(db, 'accounts', actionData.accountId);
          batch.update(accountRef, { balance: Number(account.balance) - actionData.amount });
        }
      }

      await batch.commit();
      setIsActionModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'payroll');
    }
  };

  const handleOpenSalaryModal = (employee: any) => {
    setSelectedEmployeeForSalary(employee);
    
    // Calculate net salary
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const employeeTransactions = transactions.filter(t => t.employeeId === employee.id);
    const currentMonthTransactions = employeeTransactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const baseSalary = Number(employee.salary || 0);
    const dailyRate = baseSalary / 30;

    let totalAdditions = 0;
    let totalDeductions = 0;
    let absenceDays = 0;

    currentMonthTransactions.forEach(t => {
      if (t.type === 'addition') totalAdditions += Number(t.amount);
      if (t.type === 'deduction' || t.type === 'advance') totalDeductions += Number(t.amount);
      if (t.type === 'absence') absenceDays += 1;
    });

    const absenceDeduction = absenceDays * dailyRate;
    const netSalary = baseSalary + totalAdditions - totalDeductions - absenceDeduction;

    setSalaryFormData({
      amount: Math.max(0, Math.round(netSalary)),
      date: new Date().toISOString().split('T')[0],
      accountId: '',
      note: `صرف راتب شهر ${new Date().toLocaleDateString('ar-SA', { month: 'long', year: 'numeric' })}`
    });
    setIsSalaryModalOpen(true);
  };

  const handleSaveSalary = async () => {
    if (!selectedEmployeeForSalary) return;
    if (salaryFormData.amount <= 0) {
      setValidationError('الرجاء إدخال مبلغ صحيح');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }
    if (!salaryFormData.accountId) {
      setValidationError('الرجاء اختيار الحساب المالي');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    try {
      const batch = writeBatch(db);
      
      // 1. Add employee transaction
      const empTransRef = doc(collection(db, 'payroll'));
      batch.set(empTransRef, {
        employeeId: selectedEmployeeForSalary.id,
        employeeName: selectedEmployeeForSalary.name,
        type: 'salary',
        amount: salaryFormData.amount,
        date: salaryFormData.date,
        note: salaryFormData.note,
        createdAt: new Date().toISOString()
      });

      // 2. Add finance transaction
      const account = financeAccounts.find(a => a.id === salaryFormData.accountId);
      if (account) {
        const financeTransRef = doc(collection(db, 'dailyTransactions'));
        batch.set(financeTransRef, {
          type: 'expense',
          category: 'رواتب وأجور',
          amount: salaryFormData.amount,
          date: salaryFormData.date,
          description: `صرف راتب: ${selectedEmployeeForSalary.name} - ${salaryFormData.note}`,
          reference: '',
          accountId: salaryFormData.accountId,
          accountName: account.name
        });

        // 3. Update account balance
        const accountRef = doc(db, 'accounts', salaryFormData.accountId);
        batch.update(accountRef, { balance: Number(account.balance) - salaryFormData.amount });
      }

      await batch.commit();
      setIsSalaryModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'payroll');
    }
  };

  const filteredEmployees = employees.filter((e: any) => {
    const matchesSearch = (e.name && e.name.includes(searchTerm)) || (e.role && e.role.includes(searchTerm));
    const matchesBranch = filterBranch ? e.branch === filterBranch : true;
    const matchesRole = filterRole ? e.role === filterRole : true;
    return matchesSearch && matchesBranch && matchesRole;
  });

  // Get unique roles for filter dropdown
  const uniqueRoles = Array.from(new Set(employees.map(e => e.role).filter(Boolean)));

  return (
    <div className="p-6 bg-background min-h-full text-foreground" dir="rtl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">الموظفين والمرتبات</h1>
          <p className="text-muted">إدارة بيانات الموظفين، الرواتب، والحضور والانصراف</p>
        </div>
        {activeTab === 'employees' && (
          <button onClick={() => handleOpenModal()} className="bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors">
            <Plus className="w-5 h-5" />
            <span>إضافة موظف</span>
          </button>
        )}
      </div>

      <div className="flex border-b border-border mb-8">
        <button
          className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'employees' ? 'border-primary-500 text-primary-400' : 'border-transparent text-muted hover:text-muted-foreground'}`}
          onClick={() => setActiveTab('employees')}
        >
          قائمة الموظفين
        </button>
        <button
          className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'payroll' ? 'border-primary-500 text-primary-400' : 'border-transparent text-muted hover:text-muted-foreground'}`}
          onClick={() => setActiveTab('payroll')}
        >
          سجل المرتبات
        </button>
      </div>

      {activeTab === 'employees' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <Briefcase className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted mb-1">إجمالي الموظفين</p>
              <h3 className="text-2xl font-bold text-foreground">{employees.length}</h3>
            </div>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500/20 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-muted mb-1">إجمالي الرواتب (شهرياً)</p>
              <h3 className="text-2xl font-bold text-foreground">
                {employees.reduce((sum: number, e: any) => sum + Number(e.salary), 0).toLocaleString()} د.ل
              </h3>
            </div>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-500/20 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-muted mb-1">الموظفين في إجازة</p>
              <h3 className="text-2xl font-bold text-foreground">{employees.filter((e:any) => e.status === 'إجازة').length}</h3>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative w-full sm:w-96">
            <input
              type="text"
              placeholder="البحث باسم الموظف أو المسمى الوظيفي..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:border-primary-500 pr-10"
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <select
              value={filterBranch}
              onChange={(e) => setFilterBranch(e.target.value)}
              className="bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary-500"
            >
              <option value="">كل الفروع</option>
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary-500"
            >
              <option value="">كل الأدوار</option>
              {uniqueRoles.map((role: any) => (
                <option key={role} value={role}>{EMPLOYEE_ROLES.find(r => r.id === role)?.name || role}</option>
              ))}
            </select>
            <ExportButtons 
              onExport={() => exportToExcel(filteredEmployees, 'الموظفين')}
              onPrint={() => printTable('employees-table', 'بيانات الموظفين')}
            />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table id="employees-table" className="w-full text-right">
            <thead>
              <tr className="bg-background border-b border-border">
                <th className="px-6 py-4 text-sm font-medium text-muted">اسم الموظف</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">المسمى الوظيفي</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">رقم الجوال</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">الراتب الأساسي</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">تاريخ الانضمام</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">الحالة</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredEmployees.map((employee: any) => (
                <tr key={employee.id} className="hover:bg-surface-hover/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-muted">
                        <Users className="w-5 h-5" />
                      </div>
                      <span className="text-sm font-medium text-foreground">{employee.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{EMPLOYEE_ROLES.find(r => r.id === employee.role)?.name || employee.role}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground" dir="ltr">{employee.phone}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{Number(employee.salary).toLocaleString()} د.ل</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{employee.joinDate}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${employee.status === 'نشط' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                      {employee.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleOpenSalaryModal(employee)} 
                        className="p-1.5 text-muted hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors"
                        title="صرف المرتب"
                      >
                        <Banknote className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleOpenDetailsModal(employee)} 
                        className="p-1.5 text-muted hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors"
                        title="عرض التفاصيل والسجل"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleOpenActionModal(employee)} 
                        className="p-1.5 text-muted hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"
                        title="إجراءات الموظف (سلف، خصم، غياب...)"
                      >
                        <Activity className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleOpenModal(employee)} className="p-1.5 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEmployeeToDelete(employee.id)} className="p-1.5 text-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredEmployees.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">لا توجد نتائج مطابقة للبحث</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {activeTab === 'payroll' && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4 justify-between items-center">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-muted">شهر الصرف:</label>
              <input
                type="month"
                value={payrollMonth}
                onChange={(e) => setPayrollMonth(e.target.value)}
                className="bg-background border border-border rounded-lg px-4 py-2 text-sm text-foreground focus:outline-none focus:border-primary-500"
              />
            </div>
            <div className="flex gap-2">
              <ExportButtons 
                onExport={() => {
                  const getTransactionSum = (empId: string, type: string) => {
                    return transactions
                      .filter(t => t.employeeId === empId && t.type === type && t.date.startsWith(payrollMonth))
                      .reduce((sum, t) => sum + Number(t.amount), 0);
                  };
                  exportToExcel(employees.map(emp => {
                    const additions = getTransactionSum(emp.id, 'addition');
                    const deductions = getTransactionSum(emp.id, 'deduction') + getTransactionSum(emp.id, 'advance');
                    const absenceCount = parseInt(localStorage.getItem(`absences_${emp.id}_${payrollMonth}`) || '0');
                    const dailyRate = Math.round(Number(emp.salary) / 30);
                    const absenceDeduction = absenceCount * dailyRate;
                    const netSalary = Number(emp.salary) + additions - deductions - absenceDeduction;

                    return {
                      'اسم الموظف': emp.name,
                      'المسمى الوظيفي': EMPLOYEE_ROLES.find(r => r.id === emp.role)?.name || emp.role,
                      'الراتب الأساسي': emp.salary,
                      'إضافات': additions,
                      'خصومات/سلف': deductions,
                      'خصم الغياب': absenceDeduction,
                      'صافي الراتب': netSalary,
                      'الحالة': emp.isPaid ? 'مدفوع' : 'غير مدفوع'
                    };
                  }), `الرواتب_${payrollMonth}`);
                }}
                onPrint={() => printTable('payroll-table', `مسير الرواتب - ${payrollMonth}`)}
              />
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table id="payroll-table" className="w-full text-right">
              <thead>
                <tr className="bg-background border-b border-border">
                  <th className="px-6 py-4 text-sm font-medium text-muted">اسم الموظف</th>
                  <th className="px-6 py-4 text-sm font-medium text-muted">المسمى الوظيفي</th>
                  <th className="px-6 py-4 text-sm font-medium text-muted">الراتب الأساسي</th>
                  <th className="px-6 py-4 text-sm font-medium text-muted text-emerald-400">إضافات</th>
                  <th className="px-6 py-4 text-sm font-medium text-muted text-red-400">خصومات/سلف</th>
                  <th className="px-6 py-4 text-sm font-medium text-muted text-amber-400">غياب</th>
                  <th className="px-6 py-4 text-sm font-medium text-muted">صافي الراتب</th>
                  <th className="px-6 py-4 text-sm font-medium text-muted">الحالة</th>
                  <th className="px-6 py-4 text-sm font-medium text-muted">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredEmployees.map((employee: any) => {
                  const empTrans = transactions.filter(t => t.employeeId === employee.id);
                  const monthTrans = empTrans.filter(t => t.date.startsWith(payrollMonth));
                  
                  const baseSalary = Number(employee.salary || 0);
                  const dailyRate = baseSalary / 30;
                  
                  let additions = 0;
                  let deductions = 0;
                  let absenceDays = 0;
                  let isPaid = false;

                  monthTrans.forEach(t => {
                    if (t.type === 'addition') additions += Number(t.amount);
                    if (t.type === 'deduction' || t.type === 'advance') deductions += Number(t.amount);
                    if (t.type === 'absence') absenceDays += 1;
                    if (t.type === 'salary_payment') isPaid = true;
                  });

                  const absenceDeduction = absenceDays * dailyRate;
                  const netSalary = baseSalary + additions - deductions - absenceDeduction;

                  return (
                    <tr key={employee.id} className="hover:bg-surface-hover/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-muted">
                            <Users className="w-5 h-5" />
                          </div>
                          <span className="text-sm font-medium text-foreground">{employee.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{EMPLOYEE_ROLES.find(r => r.id === employee.role)?.name || employee.role}</td>
                      <td className="px-6 py-4 text-sm font-medium">{baseSalary.toLocaleString()} د.ل</td>
                      <td className="px-6 py-4 text-sm text-emerald-400">{additions > 0 ? `+${additions.toLocaleString()}` : '-'}</td>
                      <td className="px-6 py-4 text-sm text-red-400">{deductions > 0 ? `-${deductions.toLocaleString()}` : '-'}</td>
                      <td className="px-6 py-4 text-sm text-amber-400">{absenceDays > 0 ? `${absenceDays} أيام (-${absenceDeduction.toFixed(2)})` : '-'}</td>
                      <td className="px-6 py-4 text-sm font-bold text-primary-400">{netSalary.toFixed(2)} د.ل</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${isPaid ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                          {isPaid ? 'مصروف' : 'غير مصروف'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {!isPaid && (
                          <button 
                            onClick={() => handleOpenSalaryModal(employee)} 
                            className="bg-primary-600 hover:bg-primary-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                          >
                            صرف الراتب
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredEmployees.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-8 text-center text-muted-foreground">لا توجد بيانات</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-md flex flex-col max-h-[90vh] shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h3 className="text-lg font-bold text-foreground">{editingEmployee ? 'تعديل بيانات الموظف' : 'إضافة موظف جديد'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-muted hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto pos-scroll">
              {validationError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>{validationError}</span>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-muted mb-1">اسم الموظف</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">الدور (المسمى الوظيفي)</label>
                <select 
                  value={formData.role}
                  onChange={(e) => setFormData({...formData, role: e.target.value, permissions: EMPLOYEE_ROLES.find(r => r.id === e.target.value)?.hasLogin ? formData.permissions : []})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                >
                  <option value="">اختر الدور...</option>
                  {EMPLOYEE_ROLES.map(role => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </div>

              {EMPLOYEE_ROLES.find(r => r.id === formData.role || r.name === formData.role)?.hasLogin && (
                <div className="bg-background/50 p-4 rounded-xl border border-border space-y-4">
                  <h4 className="text-sm font-bold text-primary-400 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    بيانات تسجيل الدخول والصلاحيات
                  </h4>
                  <div>
                    <label className="block text-sm font-medium text-muted mb-1">اسم المستخدم (للدخول)</label>
                    <input 
                      type="text" 
                      value={formData.username}
                      onChange={(e) => setFormData({...formData, username: e.target.value.toLowerCase().replace(/\s+/g, '')})}
                      disabled={!(!editingEmployee || !editingEmployee.username)}
                      dir="ltr"
                      placeholder="مثال: ahmed"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500 disabled:opacity-50"
                    />
                    {editingEmployee && editingEmployee.username && <p className="text-xs text-muted-foreground mt-1">لا يمكن تغيير اسم المستخدم بعد الإنشاء</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted mb-1">
                      كلمة المرور
                      {(editingEmployee && editingEmployee.username) && (
                        <span className="text-xs text-muted-foreground mr-2">(اتركه فارغاً إذا لم ترغب في التغيير)</span>
                      )}
                    </label>
                    <input 
                      type="password" 
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                      dir="ltr"
                      placeholder={editingEmployee && editingEmployee.username ? "أدخل كلمة المرور الجديدة" : "6 أحرف على الأقل"}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  
                  <div className="pt-2 border-t border-border">
                    <label className="block text-sm font-medium text-muted mb-3">الصلاحيات الممنوحة</label>
                    <div className="space-y-2">
                      {AVAILABLE_PERMISSIONS.map(permission => (
                        <label key={permission.id} className="flex items-start gap-3 cursor-pointer group">
                          <div className="relative flex items-center justify-center mt-0.5">
                            <input 
                              type="checkbox" 
                              className="peer sr-only"
                              checked={formData.permissions.includes(permission.id)}
                              onChange={(e) => {
                                const newPermissions = e.target.checked
                                  ? [...formData.permissions, permission.id]
                                  : formData.permissions.filter(id => id !== permission.id);
                                setFormData({ ...formData, permissions: newPermissions });
                              }}
                            />
                            <div className="w-4 h-4 border-2 border-slate-500 rounded bg-surface peer-checked:bg-primary-500 peer-checked:border-primary-500 transition-colors"></div>
                            <Check className="w-3 h-3 text-foreground absolute opacity-0 peer-checked:opacity-100 transition-opacity" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-200 group-hover:text-foreground transition-colors">{permission.name}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-muted mb-1">رقم الجوال</label>
                <input 
                  type="text" 
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">الراتب الأساسي</label>
                <input 
                  type="number" 
                  value={formData.salary}
                  onChange={(e) => setFormData({...formData, salary: Number(e.target.value)})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">الفرع التابع له</label>
                <select 
                  value={formData.branch}
                  onChange={(e) => setFormData({...formData, branch: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                >
                  <option value="">اختر الفرع...</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">الحالة</label>
                <select 
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                >
                  <option value="نشط">نشط</option>
                  <option value="إجازة">إجازة</option>
                </select>
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                إلغاء
              </button>
              <button onClick={handleSave} className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors">
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {employeeToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-sm flex flex-col shadow-2xl">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">تأكيد الحذف</h3>
              <p className="text-muted">هل أنت متأكد من حذف هذا الموظف؟ لا يمكن التراجع عن هذا الإجراء.</p>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-3 bg-background rounded-b-xl">
              <button 
                onClick={() => setEmployeeToDelete(null)} 
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                إلغاء
              </button>
              <button 
                onClick={confirmDelete} 
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                حذف الموظف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Modal */}
      {isActionModalOpen && selectedEmployeeForAction && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-md flex flex-col max-h-[90vh] shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h3 className="text-lg font-bold text-foreground">إجراءات الموظف: {selectedEmployeeForAction.name}</h3>
              <button onClick={() => setIsActionModalOpen(false)} className="text-muted hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto pos-scroll">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">نوع الإجراء</label>
                <select 
                  value={actionData.type}
                  onChange={(e) => setActionData({...actionData, type: e.target.value, amount: e.target.value === 'absence' ? 0 : actionData.amount})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                >
                  <option value="advance">سلفة</option>
                  <option value="deduction">خصم</option>
                  <option value="addition">إضافة (مكافأة)</option>
                  <option value="absence">غياب</option>
                  <option value="salary_payment">صرف راتب</option>
                </select>
              </div>
              
              {actionData.type !== 'absence' && (
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">المبلغ (د.ل)</label>
                  <input 
                    type="number" 
                    value={actionData.amount}
                    onChange={(e) => setActionData({...actionData, amount: Number(e.target.value)})}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                    min="0"
                  />
                </div>
              )}

              {actionData.type === 'advance' && (
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">الخزينة / الحساب المالي</label>
                  <select 
                    value={actionData.accountId}
                    onChange={(e) => setActionData({...actionData, accountId: e.target.value})}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                  >
                    <option value="">اختر الحساب...</option>
                    {financeAccounts.map(account => (
                      <option key={account.id} value={account.id}>{account.name} ({account.type === 'bank' ? 'بنك' : 'خزينة'})</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-muted mb-1">التاريخ</label>
                <input 
                  type="date" 
                  value={actionData.date}
                  onChange={(e) => setActionData({...actionData, date: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">ملاحظات (اختياري)</label>
                <textarea 
                  value={actionData.note}
                  onChange={(e) => setActionData({...actionData, note: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500 h-24 resize-none"
                  placeholder="أضف أي تفاصيل إضافية هنا..."
                />
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsActionModalOpen(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                إلغاء
              </button>
              <button onClick={handleSaveAction} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <span>حفظ الإجراء</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {isDetailsModalOpen && selectedEmployeeForDetails && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-4xl flex flex-col max-h-[90vh] shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h3 className="text-lg font-bold text-foreground">تفاصيل الموظف: {selectedEmployeeForDetails.name}</h3>
              <button onClick={() => setIsDetailsModalOpen(false)} className="text-muted hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto pos-scroll">
              <div className="flex border-b border-border mb-6">
                <button
                  className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${detailsTab === 'info' ? 'border-primary-500 text-primary-400' : 'border-transparent text-muted hover:text-muted-foreground'}`}
                  onClick={() => setDetailsTab('info')}
                >
                  البيانات الأساسية
                </button>
                <button
                  className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${detailsTab === 'dailyTransactions' ? 'border-primary-500 text-primary-400' : 'border-transparent text-muted hover:text-muted-foreground'}`}
                  onClick={() => setDetailsTab('dailyTransactions')}
                >
                  سجل الإجراءات والرواتب
                </button>
              </div>

              {detailsTab === 'info' && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                  <div className="bg-background p-4 rounded-lg border border-border">
                    <p className="text-sm text-muted mb-1">المسمى الوظيفي</p>
                    <p className="font-medium text-foreground">{selectedEmployeeForDetails.role}</p>
                  </div>
                  <div className="bg-background p-4 rounded-lg border border-border">
                    <p className="text-sm text-muted mb-1">الراتب الأساسي</p>
                    <p className="font-medium text-foreground">{Number(selectedEmployeeForDetails.salary).toLocaleString()} د.ل</p>
                  </div>
                  <div className="bg-background p-4 rounded-lg border border-border">
                    <p className="text-sm text-muted mb-1">تاريخ الانضمام</p>
                    <p className="font-medium text-foreground">{selectedEmployeeForDetails.joinDate}</p>
                  </div>
                  <div className="bg-background p-4 rounded-lg border border-border">
                    <p className="text-sm text-muted mb-1">الحالة</p>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium inline-block mt-1 ${selectedEmployeeForDetails.status === 'نشط' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                      {selectedEmployeeForDetails.status}
                    </span>
                  </div>
                </div>
              )}

              {detailsTab === 'dailyTransactions' && (
                <div className="space-y-6">
                  {(() => {
                    const currentMonth = new Date().getMonth();
                    const currentYear = new Date().getFullYear();
                    const employeeTransactions = transactions.filter(t => t.employeeId === selectedEmployeeForDetails.id);
                    const currentMonthTransactions = employeeTransactions.filter(t => {
                      const d = new Date(t.date);
                      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
                    });

                    const baseSalary = Number(selectedEmployeeForDetails.salary || 0);
                    const dailyRate = baseSalary / 30;

                    let totalAdditions = 0;
                    let totalDeductions = 0;
                    let absenceDays = 0;

                    currentMonthTransactions.forEach(t => {
                      if (t.type === 'addition') totalAdditions += Number(t.amount);
                      if (t.type === 'deduction' || t.type === 'advance') totalDeductions += Number(t.amount);
                      if (t.type === 'absence') absenceDays += 1;
                    });

                    const absenceDeduction = absenceDays * dailyRate;
                    const netSalary = baseSalary + totalAdditions - totalDeductions - absenceDeduction;

                    return (
                      <div className="bg-background rounded-xl border border-border p-5">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-sm font-bold text-muted-foreground flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-emerald-500" />
                            ملخص راتب الشهر الحالي ({new Date().toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })})
                          </h4>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => {
                                const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + 
                                  "اسم الموظف,المسمى الوظيفي,الراتب الأساسي,إضافات,خصومات,غياب,صافي الراتب\n" +
                                  `${selectedEmployeeForDetails.name},${selectedEmployeeForDetails.role},${baseSalary},${totalAdditions},${totalDeductions},${absenceDays},${netSalary.toFixed(2)}`;
                                
                                const encodedUri = encodeURI(csvContent);
                                const link = document.createElement("a");
                                link.setAttribute("href", encodedUri);
                                link.setAttribute("download", `salary_slip_${selectedEmployeeForDetails.name}_${currentYear}_${currentMonth + 1}.csv`);
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                              }}
                              className="text-emerald-500 hover:text-emerald-400 transition-colors p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg border border-emerald-500/20"
                              title="تصدير Excel"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => window.print()}
                              className="text-muted hover:text-foreground transition-colors p-1.5 bg-surface hover:bg-surface-hover rounded-lg border border-border"
                              title="طباعة قسيمة الراتب"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                          <div>
                            <p className="text-xs text-muted mb-1">الراتب الأساسي</p>
                            <p className="font-bold text-foreground">{baseSalary.toLocaleString()} د.ل</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted mb-1">إضافات ومكافآت</p>
                            <p className="font-bold text-emerald-400">+{totalAdditions.toLocaleString()} د.ل</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted mb-1">خصومات وسلف</p>
                            <p className="font-bold text-red-400">-{totalDeductions.toLocaleString()} د.ل</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted mb-1">غياب ({absenceDays} أيام)</p>
                            <p className="font-bold text-amber-400">-{absenceDeduction.toFixed(2)} د.ل</p>
                          </div>
                          <div className="bg-primary-500/10 p-3 rounded-lg border border-primary-500/20 -mt-3">
                            <p className="text-xs text-primary-300 mb-1">صافي المرتب</p>
                            <p className="text-xl font-bold text-primary-400">{netSalary.toFixed(2)} د.ل</p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <h4 className="text-md font-bold text-foreground mb-4 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-blue-500" />
                    سجل الإجراءات
                  </h4>
                  <div className="bg-background rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-right">
                      <thead>
                        <tr className="border-b border-border bg-surface">
                          <th className="px-4 py-3 text-sm font-medium text-muted">التاريخ</th>
                          <th className="px-4 py-3 text-sm font-medium text-muted">نوع الإجراء</th>
                          <th className="px-4 py-3 text-sm font-medium text-muted">المبلغ</th>
                          <th className="px-4 py-3 text-sm font-medium text-muted">ملاحظات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {transactions
                          .filter(t => t.employeeId === selectedEmployeeForDetails.id)
                          .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                          .map(t => (
                          <tr key={t.id} className="hover:bg-surface-hover/50 transition-colors">
                            <td className="px-4 py-3 text-sm text-muted-foreground">{t.date}</td>
                            <td className="px-4 py-3 text-sm font-medium">
                              {t.type === 'advance' && <span className="text-blue-400">سلفة</span>}
                              {t.type === 'deduction' && <span className="text-red-400">خصم</span>}
                              {t.type === 'addition' && <span className="text-emerald-400">إضافة (مكافأة)</span>}
                              {t.type === 'absence' && <span className="text-amber-400">غياب</span>}
                              {t.type === 'salary_payment' && <span className="text-purple-400">صرف راتب</span>}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{t.amount > 0 ? `${Number(t.amount).toLocaleString()} د.ل` : '-'}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{t.note || '-'}</td>
                          </tr>
                        ))}
                        {transactions.filter(t => t.employeeId === selectedEmployeeForDetails.id).length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">لا يوجد سجل إجراءات لهذا الموظف</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {employeeToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-sm flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">تأكيد الحذف</h3>
              <p className="text-muted mb-6">هل أنت متأكد من رغبتك في حذف هذا الموظف؟ لا يمكن التراجع عن هذا الإجراء.</p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setEmployeeToDelete(null)}
                  className="flex-1 py-3 bg-surface-hover hover:bg-slate-700 text-foreground rounded-xl font-bold transition-colors"
                >
                  إلغاء
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors"
                >
                  حذف
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Salary Modal */}
      {isSalaryModalOpen && selectedEmployeeForSalary && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-md flex flex-col max-h-[90vh] shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h3 className="text-lg font-bold text-foreground">صرف راتب: {selectedEmployeeForSalary.name}</h3>
              <button onClick={() => setIsSalaryModalOpen(false)} className="text-muted hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto pos-scroll">
              <div className="bg-primary-500/10 border border-primary-500/20 rounded-lg p-3 mb-4">
                <p className="text-sm text-primary-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  تم حساب صافي الراتب تلقائياً بناءً على الراتب الأساسي ({Number(selectedEmployeeForSalary.salary || 0).toLocaleString()} د.ل) مخصوماً منه السلف والغيابات ومضافاً إليه المكافآت لهذا الشهر.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">المبلغ (د.ل)</label>
                <input 
                  type="number" 
                  min="0"
                  value={salaryFormData.amount}
                  onChange={(e) => setSalaryFormData({...salaryFormData, amount: Number(e.target.value)})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">التاريخ</label>
                <input 
                  type="date" 
                  value={salaryFormData.date}
                  onChange={(e) => setSalaryFormData({...salaryFormData, date: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">الحساب المالي (الخزينة/البنك)</label>
                <select 
                  value={salaryFormData.accountId}
                  onChange={(e) => setSalaryFormData({...salaryFormData, accountId: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                >
                  <option value="">اختر الحساب...</option>
                  {financeAccounts.map(account => (
                    <option key={account.id} value={account.id}>{account.name} (الرصيد: {account.balance} د.ل)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">البيان / الوصف</label>
                <input 
                  type="text" 
                  value={salaryFormData.note}
                  onChange={(e) => setSalaryFormData({...salaryFormData, note: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsSalaryModalOpen(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                إلغاء
              </button>
              <button onClick={handleSaveSalary} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors">
                تأكيد الصرف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
