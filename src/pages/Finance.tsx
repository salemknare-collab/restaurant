import React, { useState, useEffect } from 'react';
import { useUserAuth } from '../hooks/useUserAuth';

import { Wallet, Plus, Search, Edit2, Trash2, ArrowRightLeft, Building2, CreditCard, X, Truck, ArrowDownCircle, ArrowUpCircle, History } from 'lucide-react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, addDoc, writeBatch } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { ExportButtons } from '../components/ExportButtons';
import { exportToExcel, printTable } from '../lib/exportUtils';

export default function Finance() {
  const { branchId: userBranchId, hasPermission } = useUserAuth();
  const canViewAllBranches = hasPermission('branches.view_all');
  useEffect(() => {
    // Branch permissions check hook dependency
  }, [canViewAllBranches, userBranchId]);

  const [searchTerm, setSearchTerm] = useState('');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [formData, setFormData] = useState({ name: '', type: 'safe', balance: 0, accountNumber: '', branchId: '' });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [allBranches, setBranches] = useState<any[]>([]);
  const branches = canViewAllBranches ? allBranches : allBranches.filter(b => b.id === userBranchId);
  const [movementLogs, setMovementLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'accounts' | 'drivers' | 'logs'>('accounts');
  const [drivers, setDrivers] = useState<any[]>([]);

  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferData, setTransferData] = useState({ from: '', to: '', amount: 0, note: '' });
  
  const [isReceiveCashModalOpen, setIsReceiveCashModalOpen] = useState(false);
  const [receiveCashData, setReceiveCashData] = useState({ driverId: '', targetAccountId: '', amount: 0 });

  const [transferError, setTransferError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualData, setManualData] = useState({ accountId: '', type: 'deposit', amount: 0, note: '' });
  const [manualError, setManualError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeAccounts = onSnapshot(collection(db, 'accounts'), (snapshot) => {
      const accountsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAccounts(accountsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'accounts');
    });

    const unsubscribeBranches = onSnapshot(collection(db, 'branches'), (snapshot) => {
      const branchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBranches(branchesData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'branches');
    });

    const unsubscribeDrivers = onSnapshot(collection(db, 'users'), (snapshot) => {
        const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const driversList = usersData.filter((u: any) => u.role === 'driver' || (u.cashOnHand !== undefined && u.cashOnHand > 0));
        setDrivers(driversList);
    }, (error) => {
      console.error(error);
    });

    const unsubscribeLogs = onSnapshot(collection(db, 'account_movements'), (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setMovementLogs(logsData);
    }, (error) => {
      console.error(error);
    });

    return () => {
      unsubscribeAccounts();
      unsubscribeBranches();
      unsubscribeDrivers();
      unsubscribeLogs();
    };
  }, []);

  const confirmDelete = (id: string) => {
    setAccountToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const executeDelete = async () => {
    if (accountToDelete) {
      try {
        await deleteDoc(doc(db, 'accounts', accountToDelete));
        setIsDeleteModalOpen(false);
        setAccountToDelete(null);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `finance_accounts/${accountToDelete}`);
      }
    }
  };

  const handleOpenModal = (account: any = null) => {
    if (account) {
      setEditingAccount(account);
      setFormData({ name: account.name || '', type: account.type || 'safe', balance: account.balance || 0, accountNumber: account.accountNumber || '', branchId: account.branchId || '' });
    } else {
      setEditingAccount(null);
      setFormData({ name: '', type: 'safe', balance: 0, accountNumber: '', branchId: '' });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name) {
      setValidationError('الرجاء إدخال اسم الحساب');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }
    const newAccount = {
      ...formData,
      lastUpdate: new Date().toISOString().split('T')[0],
      accountNumber: formData.type === 'bank' ? formData.accountNumber : null
    };

    try {
      if (editingAccount) {
        await setDoc(doc(db, 'accounts', editingAccount.id), newAccount, { merge: true });
      } else {
        await addDoc(collection(db, 'accounts'), newAccount);
      }
      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'accounts');
    }
  };

  const handleManualMovement = async () => {
    if (!manualData.accountId || manualData.amount <= 0) {
      setManualError('الرجاء التأكد من صحة البيانات');
      setTimeout(() => setManualError(null), 3000);
      return;
    }

    const account = accounts.find((a: any) => a.id === manualData.accountId);
    if (!account) return;

    if (manualData.type === 'withdrawal' && account.balance < manualData.amount) {
      setManualError('الرصيد غير كافٍ للسحب');
      setTimeout(() => setManualError(null), 3000);
      return;
    }

    try {
      const batch = writeBatch(db);
      const timestamp = new Date().toISOString();
      const dateStr = timestamp.split('T')[0];

      const accountRef = doc(db, 'accounts', manualData.accountId);
      const balanceAdjustment = manualData.type === 'withdrawal' ? -manualData.amount : manualData.amount;
      
      batch.update(accountRef, {
        balance: Number(account.balance) + balanceAdjustment,
        lastUpdate: dateStr
      });

      const logRef = doc(collection(db, 'account_movements'));
      batch.set(logRef, {
        type: manualData.type,
        accountId: manualData.accountId,
        accountName: account.name,
        amount: manualData.amount,
        note: manualData.note || (manualData.type === 'deposit' ? 'إيداع يدوي' : 'سحب يدوي'),
        timestamp: timestamp,
        date: dateStr,
        userId: '',
      });

      await batch.commit();

      setIsManualModalOpen(false);
      setManualData({ accountId: '', type: 'deposit', amount: 0, note: '' });
      setSuccessMessage('تم تسجيل الحركة بنجاح');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'accounts');
    }
  };

  const handleTransfer = async () => {
    if (!transferData.from || !transferData.to || transferData.amount <= 0) {
      setTransferError('الرجاء التأكد من صحة بيانات التحويل');
      setTimeout(() => setTransferError(null), 3000);
      return;
    }
    if (transferData.from === transferData.to) {
      setTransferError('لا يمكن التحويل لنفس الحساب');
      setTimeout(() => setTransferError(null), 3000);
      return;
    }

    const fromAccount = accounts.find((a:any) => a.id === transferData.from);
    if (fromAccount.balance < transferData.amount) {
      setTransferError('الرصيد غير كافٍ في الحساب المحول منه');
      setTimeout(() => setTransferError(null), 3000);
      return;
    }

    try {
      const batch = writeBatch(db);
      const timestamp = new Date().toISOString();
      const dateStr = timestamp.split('T')[0];
      
      const fromRef = doc(db, 'accounts', transferData.from);
      batch.update(fromRef, { 
        balance: fromAccount.balance - transferData.amount,
        lastUpdate: dateStr
      });

      const toAccount = accounts.find((a:any) => a.id === transferData.to);
      const toRef = doc(db, 'accounts', transferData.to);
      batch.update(toRef, { 
        balance: toAccount.balance + transferData.amount,
        lastUpdate: dateStr
      });

      // Add movement log
      const logRef = doc(collection(db, 'account_movements'));
      batch.set(logRef, {
        type: 'transfer',
        fromAccountId: transferData.from,
        fromAccountName: fromAccount.name,
        toAccountId: transferData.to,
        toAccountName: toAccount.name,
        amount: transferData.amount,
        note: transferData.note || 'تحويل بين حسابات',
        timestamp: timestamp,
        date: dateStr,
        userId: '', // Ideally we'd have the current user ID here
      });

      await batch.commit();

      setIsTransferModalOpen(false);
      setTransferData({ from: '', to: '', amount: 0, note: '' });
      setSuccessMessage('تم التحويل بنجاح');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'accounts');
    }
  };

  const filteredAccounts = accounts.filter((a: any) => 
    (a.name && a.name.includes(searchTerm)) || (a.accountNumber && a.accountNumber.includes(searchTerm))
  );

  const totalBalance = accounts.reduce((sum: number, a: any) => sum + Number(a.balance), 0);
  const bankBalance = accounts.filter((a:any) => a.type === 'bank').reduce((sum: number, a: any) => sum + Number(a.balance), 0);
  const safeBalance = accounts.filter((a:any) => a.type === 'safe').reduce((sum: number, a: any) => sum + Number(a.balance), 0);

  return (
    <div className="p-6 bg-background min-h-full text-foreground" dir="rtl">
      {successMessage && (
        <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-lg text-sm">
          {successMessage}
        </div>
      )}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">المالية والخزائن</h1>
          <p className="text-muted">إدارة الخزائن والحسابات البنكية والتحويلات</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setIsManualModalOpen(true)} className="bg-surface-hover hover:bg-[#2d3b4e] text-foreground px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors border border-border">
            <History className="w-5 h-5 text-primary-500" />
            <span>إضافة حركة</span>
          </button>
          <button onClick={() => setIsTransferModalOpen(true)} className="bg-surface-hover hover:bg-[#2d3b4e] text-foreground px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors">
            <ArrowRightLeft className="w-5 h-5" />
            <span>تحويل أموال</span>
          </button>
          <button onClick={() => handleOpenModal()} className="bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors">
            <Plus className="w-5 h-5" />
            <span>إضافة حساب/خزينة</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <Wallet className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted mb-1">إجمالي الأرصدة</p>
              <h3 className="text-2xl font-bold text-foreground">{totalBalance.toLocaleString()} د.ل</h3>
            </div>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500/20 rounded-lg flex items-center justify-center">
              <Building2 className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-muted mb-1">أرصدة البنوك</p>
              <h3 className="text-2xl font-bold text-foreground">{bankBalance.toLocaleString()} د.ل</h3>
            </div>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-muted mb-1">أرصدة الخزائن</p>
              <h3 className="text-2xl font-bold text-foreground">{safeBalance.toLocaleString()} د.ل</h3>
            </div>
          </div>
        </div>
      </div>

      <div className="flex bg-surface border border-border p-1 rounded-xl mb-6 w-fit">
        <button
          onClick={() => setActiveTab('accounts')}
          className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'accounts'
              ? 'bg-primary-600/10 text-primary-500 shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
          }`}
        >
          الحسابات والخزائن
        </button>
        <button
          onClick={() => setActiveTab('drivers')}
          className={`px-6 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === 'drivers'
              ? 'bg-primary-600/10 text-primary-500 shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
          }`}
        >
          <Truck className="w-4 h-4" />
          عهد المناديب
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-6 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === 'logs'
              ? 'bg-primary-600/10 text-primary-500 shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
          }`}
        >
          <Search className="w-4 h-4" />
          سجل الحركات
        </button>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {activeTab === 'accounts' && (
          <>
            <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4 justify-between items-center">
              <div className="relative w-full sm:w-96">
                <input
                  type="text"
                  placeholder="البحث عن حساب..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:border-primary-500 pr-10"
                />
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              </div>
              <ExportButtons 
                onExport={() => exportToExcel(accounts, 'الحسابات')}
                onPrint={() => printTable('accounts-table', 'دليل الحسابات')}
              />
            </div>
            <div className="overflow-x-auto">
              <table id="accounts-table" className="w-full text-right">
                <thead>
                  <tr className="bg-background border-b border-border">
                    <th className="px-6 py-4 text-sm font-medium text-muted">اسم الحساب/الخزينة</th>
                    <th className="px-6 py-4 text-sm font-medium text-muted">النوع</th>
                    <th className="px-6 py-4 text-sm font-medium text-muted">رقم الحساب</th>
                    <th className="px-6 py-4 text-sm font-medium text-muted">الرصيد الحالي</th>
                    <th className="px-6 py-4 text-sm font-medium text-muted">آخر تحديث</th>
                    <th className="px-6 py-4 text-sm font-medium text-muted">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredAccounts.map((account: any) => (
                    <tr key={account.id} className="hover:bg-surface-hover/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center text-muted">
                            {account.type === 'bank' ? <Building2 className="w-5 h-5" /> : <Wallet className="w-5 h-5" />}
                          </div>
                          <span className="text-sm font-medium text-foreground">{account.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${account.type === 'bank' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'}`}>
                          {account.type === 'bank' ? 'حساب بنكي' : 'خزينة نقدية'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground font-mono" dir="ltr">
                        {account.accountNumber || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-foreground">
                        {Number(account.balance).toLocaleString()} د.ل
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{account.lastUpdate}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleOpenModal(account)} className="p-1.5 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => confirmDelete(account.id)} className="p-1.5 text-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredAccounts.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">لا توجد نتائج مطابقة للبحث</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === 'drivers' && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-end p-4 border-b border-border">
              <ExportButtons 
                onExport={() => exportToExcel(drivers, 'عهد_المناديب')}
                onPrint={() => printTable('drivers-table', 'عهد المناديب')}
              />
            </div>
            <div className="overflow-x-auto">
              <table id="drivers-table" className="w-full text-right">
                <thead>
                  <tr className="bg-background border-b border-border">
                    <th className="px-6 py-4 text-sm font-medium text-muted">اسم المندوب</th>
                    <th className="px-6 py-4 text-sm font-medium text-muted">رقم الهاتف</th>
                    <th className="px-6 py-4 text-sm font-medium text-muted">العهدة الحالية</th>
                    <th className="px-6 py-4 text-sm font-medium text-muted">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {drivers.map((driver: any) => (
                    <tr key={driver.id} className="hover:bg-surface-hover/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                            <Truck className="w-5 h-5" />
                          </div>
                          <span className="text-sm font-medium text-foreground">{driver.name || driver.id}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{driver.phone || '-'}</td>
                      <td className="px-6 py-4 text-sm font-bold text-emerald-500">
                        {Number(driver.cashOnHand || 0).toLocaleString()} د.ل
                      </td>
                      <td className="px-6 py-4">
                        <button 
                          onClick={() => {
                             setReceiveCashData({ driverId: driver.id, targetAccountId: '', amount: driver.cashOnHand || 0 });
                             setIsReceiveCashModalOpen(true);
                          }}
                          disabled={!driver.cashOnHand || driver.cashOnHand <= 0}
                          className="bg-primary-600 hover:bg-primary-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                        >
                          استلام العهدة
                        </button>
                      </td>
                    </tr>
                  ))}
                  {drivers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">لا يوجد مناديب بعُهد مالية حتى الآن</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-between p-4 border-b border-border items-center">
              <h4 className="text-sm font-bold text-foreground">سجل حركة الأموال بين الخزائن</h4>
              <ExportButtons 
                onExport={() => exportToExcel(movementLogs, 'سجل_الحركات_المالية')}
                onPrint={() => printTable('logs-table', 'سجل الحركات المالية')}
              />
            </div>
            <div className="overflow-x-auto">
              <table id="logs-table" className="w-full text-right">
                <thead>
                  <tr className="bg-background border-b border-border">
                    <th className="px-6 py-4 text-sm font-medium text-muted">التاريخ</th>
                    <th className="px-6 py-4 text-sm font-medium text-muted">النوع</th>
                    <th className="px-6 py-4 text-sm font-medium text-muted">من</th>
                    <th className="px-6 py-4 text-sm font-medium text-muted">إلى</th>
                    <th className="px-6 py-4 text-sm font-medium text-muted">المبلغ</th>
                    <th className="px-6 py-4 text-sm font-medium text-muted">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {movementLogs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-surface-hover/50 transition-colors">
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {new Date(log.timestamp).toLocaleString('ar-LY')}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          log.type === 'transfer' ? 'bg-blue-500/10 text-blue-400' : 
                          log.type === 'deposit' ? 'bg-emerald-500/10 text-emerald-400' :
                          log.type === 'withdrawal' ? 'bg-red-500/10 text-red-400' :
                          'bg-emerald-500/10 text-emerald-400'
                        }`}>
                          {log.type === 'transfer' ? 'تحويل' : 
                           log.type === 'deposit' ? 'إيداع' :
                           log.type === 'withdrawal' ? 'سحب' :
                           'استلام عهدة'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground">{log.fromAccountName || log.accountName || log.driverName || '-'}</td>
                      <td className="px-6 py-4 text-sm text-foreground">{log.toAccountName || log.accountName || '-'}</td>
                      <td className="px-6 py-4 text-sm font-bold text-foreground">
                        {log.type === 'withdrawal' ? '-' : '+'}{Number(log.amount).toLocaleString()} د.ل
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{log.note}</td>
                    </tr>
                  ))}
                  {movementLogs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">لا يوجد سجل حركات حتى الآن</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Manual Movement Modal */}
      {isManualModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-md flex flex-col max-h-[90vh] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0 bg-background/50">
              <h3 className="text-lg font-bold text-foreground">إضافة حركة مالية يدوية</h3>
              <button onClick={() => setIsManualModalOpen(false)} className="p-2 text-muted hover:text-foreground hover:bg-surface-hover rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            {manualError && (
              <div className="mx-4 mt-4 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm">
                {manualError}
              </div>
            )}
            <div className="p-6 space-y-4 overflow-y-auto pos-scroll">
              <div>
                <label className="block text-sm font-medium text-muted mb-2">نوع الحركة</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setManualData({...manualData, type: 'deposit'})}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${
                      manualData.type === 'deposit' 
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500' 
                        : 'border-border bg-background text-muted-foreground hover:border-emerald-500/50'
                    }`}
                  >
                    <ArrowDownCircle className="w-5 h-5" />
                    <span className="font-bold">إيداع</span>
                  </button>
                  <button
                    onClick={() => setManualData({...manualData, type: 'withdrawal'})}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${
                      manualData.type === 'withdrawal' 
                        ? 'border-red-500 bg-red-500/10 text-red-500' 
                        : 'border-border bg-background text-muted-foreground hover:border-red-500/50'
                    }`}
                  >
                    <ArrowUpCircle className="w-5 h-5" />
                    <span className="font-bold">سحب</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">الخزينة / الحساب</label>
                <select 
                  value={manualData.accountId}
                  onChange={(e) => setManualData({...manualData, accountId: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-primary-500"
                >
                  <option value="">اختر الحساب...</option>
                  {accounts.map((a:any) => (
                    <option key={a.id} value={a.id}>{a.name} (الرصيد: {a.balance} د.ل)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">المبلغ</label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={manualData.amount}
                    onChange={(e) => setManualData({...manualData, amount: Number(e.target.value)})}
                    className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 pr-12 font-bold text-lg"
                    placeholder="0.00"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">د.ل</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">ملاحظات / سبب الحركة</label>
                <textarea 
                  value={manualData.note}
                  onChange={(e) => setManualData({...manualData, note: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-primary-500 h-24 resize-none"
                  placeholder="مثال: تسوية رصيد، مصاريف نثرية..."
                />
              </div>
            </div>
            <div className="p-4 border-t border-border bg-background/50 flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsManualModalOpen(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                إلغاء
              </button>
              <button onClick={handleManualMovement} className="px-6 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-bold rounded-lg transition-colors shadow-lg shadow-primary-600/20">
                حفظ الحركة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receive Cash Modal */}
      {isReceiveCashModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl w-full max-w-md border border-border shadow-2xl overflow-hidden" dir="rtl">
            <div className="flex items-center justify-between p-4 border-b border-border bg-background/50">
              <h3 className="text-lg font-bold text-foreground">استلام عهدة مندوب</h3>
              <button onClick={() => setIsReceiveCashModalOpen(false)} className="p-2 text-muted hover:text-foreground hover:bg-surface-hover rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">المبلغ المراد استلامه</label>
                <input
                  type="number"
                  min="0"
                  max={receiveCashData.amount}
                  value={receiveCashData.amount}
                  onChange={(e) => setReceiveCashData({...receiveCashData, amount: Number(e.target.value)})}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">إلى الخزينة/الحساب</label>
                <select
                  value={receiveCashData.targetAccountId}
                  onChange={(e) => setReceiveCashData({...receiveCashData, targetAccountId: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-primary-500"
                >
                  <option value="">اختر الحساب...</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.type === 'bank' ? 'بنك' : 'خزينة'})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-4 border-t border-border bg-background/50 flex justify-end gap-3">
              <button onClick={() => setIsReceiveCashModalOpen(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                إلغاء
              </button>
              <button 
                onClick={async () => {
                  if (!receiveCashData.driverId || !receiveCashData.targetAccountId || receiveCashData.amount <= 0) return;
                  try {
                    const timestamp = new Date().toISOString();
                    const dateStr = timestamp.split('T')[0];
                    
                    const batch = writeBatch(db);
                    const driverRef = doc(db, 'users', receiveCashData.driverId);
                    const driverAcc = drivers.find(d => d.id === receiveCashData.driverId);
                    batch.update(driverRef, { cashOnHand: Math.max(0, (driverAcc?.cashOnHand || 0) - receiveCashData.amount) });
                    
                    const targetAcc = accounts.find(a => a.id === receiveCashData.targetAccountId);
                    if (!targetAcc) throw new Error("Account not found");
                    const targetRef = doc(db, 'accounts', receiveCashData.targetAccountId);
                    batch.update(targetRef, { balance: Number(targetAcc.balance) + receiveCashData.amount });

                    // Add movement log
                    const logRef = doc(collection(db, 'account_movements'));
                    batch.set(logRef, {
                      type: 'receive_cash',
                      driverId: receiveCashData.driverId,
                      driverName: driverAcc?.name || 'مندوب غير معروف',
                      toAccountId: receiveCashData.targetAccountId,
                      toAccountName: targetAcc.name,
                      amount: receiveCashData.amount,
                      note: `استلام عهدة من المندوب: ${driverAcc?.name || receiveCashData.driverId}`,
                      timestamp: timestamp,
                      date: dateStr,
                      userId: '',
                    });

                    await batch.commit();
                    setIsReceiveCashModalOpen(false);
                    setSuccessMessage('تم استلام العهدة بنجاح وتوريدها للخزينة');
                    setTimeout(() => setSuccessMessage(null), 3000);
                  } catch (e) {
                    console.error("Error receiving cash:", e);
                  }
                }}
                disabled={!receiveCashData.driverId || !receiveCashData.targetAccountId || receiveCashData.amount <= 0}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                تأكيد الاستلام
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Account Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-md flex flex-col max-h-[90vh] shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h3 className="text-lg font-bold text-foreground">{editingAccount ? 'تعديل الحساب' : 'إضافة حساب جديد'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-muted hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            {validationError && (
              <div className="mx-4 mt-4 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm">
                {validationError}
              </div>
            )}
            <div className="p-4 space-y-4 overflow-y-auto pos-scroll">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">النوع</label>
                <select 
                  value={formData.type}
                  onChange={(e) => setFormData({...formData, type: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                >
                  <option value="safe">خزينة نقدية</option>
                  <option value="bank">حساب بنكي</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">اسم الحساب/الخزينة</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>
              {formData.type === 'bank' && (
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">رقم الحساب (IBAN)</label>
                  <input 
                    type="text" 
                    value={formData.accountNumber}
                    onChange={(e) => setFormData({...formData, accountNumber: e.target.value})}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                    dir="ltr"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-muted mb-1">الفرع التابع له</label>
                <select 
                  value={formData.branchId}
                  onChange={(e) => setFormData({...formData, branchId: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                >
                  <option value="">جميع الفروع (عام)</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">الرصيد الافتتاحي</label>
                <input 
                  type="number" 
                  value={formData.balance}
                  onChange={(e) => setFormData({...formData, balance: Number(e.target.value)})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
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

      {/* Transfer Modal */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-md flex flex-col max-h-[90vh] shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h3 className="text-lg font-bold text-foreground">تحويل أموال</h3>
              <button onClick={() => setIsTransferModalOpen(false)} className="text-muted hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            {transferError && (
              <div className="mx-4 mt-4 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm">
                {transferError}
              </div>
            )}
            <div className="p-4 space-y-4 overflow-y-auto pos-scroll">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">من حساب</label>
                <select 
                  value={transferData.from}
                  onChange={(e) => setTransferData({...transferData, from: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                >
                  <option value="">اختر الحساب...</option>
                  {accounts.map((a:any) => (
                    <option key={a.id} value={a.id}>{a.name} (الرصيد: {a.balance} د.ل)</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-center">
                <ArrowRightLeft className="w-6 h-6 text-muted-foreground rotate-90 sm:rotate-0" />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">إلى حساب</label>
                <select 
                  value={transferData.to}
                  onChange={(e) => setTransferData({...transferData, to: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                >
                  <option value="">اختر الحساب...</option>
                  {accounts.map((a:any) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">المبلغ</label>
                <input 
                  type="number" 
                  value={transferData.amount}
                  onChange={(e) => setTransferData({...transferData, amount: Number(e.target.value)})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsTransferModalOpen(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                إلغاء
              </button>
              <button onClick={handleTransfer} className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors">
                تأكيد التحويل
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-sm flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">تأكيد الحذف</h3>
              <p className="text-muted mb-6">هل أنت متأكد من رغبتك في حذف هذا الحساب؟ لا يمكن التراجع عن هذا الإجراء.</p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setAccountToDelete(null);
                  }}
                  className="flex-1 py-3 bg-surface-hover hover:bg-slate-700 text-foreground rounded-xl font-bold transition-colors"
                >
                  إلغاء
                </button>
                <button
                  onClick={executeDelete}
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
