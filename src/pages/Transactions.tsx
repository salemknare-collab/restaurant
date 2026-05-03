import React, { useState, useEffect } from 'react';
import { DollarSign, Plus, Search, Filter, Edit2, Trash2, ArrowUpRight, ArrowDownRight, X, Settings, Users } from 'lucide-react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, addDoc, writeBatch } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { ExportButtons } from '../components/ExportButtons';
import { exportToExcel, printTable } from '../lib/exportUtils';

export default function Transactions() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<any[]>([]);
  const [financeAccounts, setFinanceAccounts] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<any>(null);
  const [formData, setFormData] = useState({ type: 'income', category: '', amount: 0, date: new Date().toISOString().split('T')[0], description: '', reference: '', accountId: '', beneficiary: '' });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string, type: 'transaction' | 'category', data?: any } | null>(null);
  const [activeTab, setActiveTab] = useState<'dailyTransactions' | 'beneficiaries'>('dailyTransactions');
  const [filterBeneficiary, setFilterBeneficiary] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isNewBeneficiary, setIsNewBeneficiary] = useState(false);

  useEffect(() => {
    const unsubscribeTransactions = onSnapshot(collection(db, 'dailyTransactions'), (snapshot) => {
      const transactionsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTransactions(transactionsData.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'dailyTransactions');
    });

    const unsubscribeChartOfAccounts = onSnapshot(collection(db, 'chartAccounts'), (snapshot) => {
      const chartData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setChartOfAccounts(chartData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'chartAccounts');
    });

    const unsubscribeAccounts = onSnapshot(collection(db, 'accounts'), (snapshot) => {
      const accountsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFinanceAccounts(accountsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'accounts');
    });

    return () => {
      unsubscribeTransactions();
      unsubscribeChartOfAccounts();
      unsubscribeAccounts();
    };
  }, []);

  const confirmDelete = (id: string, type: 'transaction' | 'category', data?: any) => {
    setItemToDelete({ id, type, data });
    setIsDeleteModalOpen(true);
  };

  const executeDelete = async () => {
    if (!itemToDelete) return;
    try {
      if (itemToDelete.type === 'transaction') {
        const transaction = itemToDelete.data;
        const batch = writeBatch(db);
        
        if (transaction.accountId) {
          const account = financeAccounts.find(a => a.id === transaction.accountId);
          if (account) {
            const accountRef = doc(db, 'accounts', transaction.accountId);
            const balanceAdjustment = transaction.type === 'income' ? -transaction.amount : transaction.amount;
            batch.update(accountRef, { balance: Number(account.balance) + balanceAdjustment });
          }
        }

        batch.delete(doc(db, 'dailyTransactions', itemToDelete.id));
        await batch.commit();
      } else if (itemToDelete.type === 'category') {
        const colName = itemToDelete.data?.isIncome ? 'income_categories' : 'expense_categories';
        await deleteDoc(doc(db, colName, itemToDelete.id));
      }
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, itemToDelete.type === 'transaction' ? `transactions/${itemToDelete.id}` : `categories/${itemToDelete.id}`);
    }
  };

  const handleOpenModal = (transaction: any = null) => {
    if (transaction) {
      setEditingTransaction(transaction);
      setFormData({ type: transaction.type || 'income', category: transaction.category || '', amount: transaction.amount || 0, date: transaction.date || new Date().toISOString().split('T')[0], description: transaction.description || '', reference: transaction.reference || '', accountId: transaction.accountId || '', beneficiary: transaction.beneficiary || '' });
      setIsNewBeneficiary(false);
    } else {
      setEditingTransaction(null);
      setFormData({ type: 'income', category: '', amount: 0, date: new Date().toISOString().split('T')[0], description: '', reference: '', accountId: '', beneficiary: '' });
      setIsNewBeneficiary(false);
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.category || formData.amount <= 0) {
      setValidationError('الرجاء إدخال التصنيف والمبلغ بشكل صحيح');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }
    if (!formData.accountId) {
      setValidationError('الرجاء اختيار الخزينة/الحساب المالي');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }
    
    try {
      const batch = writeBatch(db);
      const accountRef = doc(db, 'accounts', formData.accountId);
      const account = financeAccounts.find(a => a.id === formData.accountId);
      
      if (!account) {
        setValidationError('الحساب المالي غير موجود');
        setTimeout(() => setValidationError(null), 3000);
        return;
      }

      if (editingTransaction) {
        // Revert old transaction effect
        const oldAccountRef = doc(db, 'accounts', editingTransaction.accountId);
        const oldAccount = financeAccounts.find(a => a.id === editingTransaction.accountId);
        
        if (oldAccount && oldAccount.id !== account.id) {
          const oldBalanceAdjustment = editingTransaction.type === 'income' ? -editingTransaction.amount : editingTransaction.amount;
          batch.update(oldAccountRef, { balance: Number(oldAccount.balance) + oldBalanceAdjustment });
          
          const newBalanceAdjustment = formData.type === 'income' ? formData.amount : -formData.amount;
          batch.update(accountRef, { balance: Number(account.balance) + newBalanceAdjustment });
        } else if (oldAccount && oldAccount.id === account.id) {
          const oldBalanceAdjustment = editingTransaction.type === 'income' ? -editingTransaction.amount : editingTransaction.amount;
          const newBalanceAdjustment = formData.type === 'income' ? formData.amount : -formData.amount;
          batch.update(accountRef, { balance: Number(account.balance) + oldBalanceAdjustment + newBalanceAdjustment });
        } else {
          const newBalanceAdjustment = formData.type === 'income' ? formData.amount : -formData.amount;
          batch.update(accountRef, { balance: Number(account.balance) + newBalanceAdjustment });
        }

        const transRef = doc(db, 'dailyTransactions', editingTransaction.id);
        const accountName = financeAccounts.find(a => a.id === formData.accountId)?.name || '';
        batch.set(transRef, { ...formData, accountName }, { merge: true });
      } else {
        const transRef = doc(collection(db, 'dailyTransactions'));
        const accountName = financeAccounts.find(a => a.id === formData.accountId)?.name || '';
        batch.set(transRef, { ...formData, accountName });

        const balanceAdjustment = formData.type === 'income' ? formData.amount : -formData.amount;
        batch.update(accountRef, { balance: Number(account.balance) + balanceAdjustment });
      }

      await batch.commit();
      setIsModalOpen(false);
      setSuccessMessage('تم حفظ المعاملة بنجاح');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'dailyTransactions');
    }
  };

  const filteredTransactions = transactions.filter((t: any) => {
    const matchesSearch = (t.description && t.description.includes(searchTerm)) || 
                          (t.category && t.category.includes(searchTerm)) || 
                          (t.beneficiary && t.beneficiary.includes(searchTerm)) ||
                          (t.reference && t.reference.includes(searchTerm));
    const matchesType = filterType === 'all' || t.type === filterType;
    const matchesBeneficiary = filterBeneficiary === 'all' || t.beneficiary === filterBeneficiary;
    
    let matchesDate = true;
    if (startDate) matchesDate = matchesDate && t.date >= startDate;
    if (endDate) matchesDate = matchesDate && t.date <= endDate;
    
    return matchesSearch && matchesType && matchesBeneficiary && matchesDate;
  });

  const uniqueBeneficiaries = Array.from(new Set(transactions.map(t => t.beneficiary).filter(Boolean)));

  const totalIncome = transactions.filter((t:any) => t.type === 'income').reduce((sum:number, t:any) => sum + Number(t.amount), 0);
  const totalExpense = transactions.filter((t:any) => t.type === 'expense').reduce((sum:number, t:any) => sum + Number(t.amount), 0);

  return (
    <div className="p-6 bg-background min-h-full text-foreground" dir="rtl">
      {successMessage && (
        <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-lg text-sm">
          {successMessage}
        </div>
      )}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">المعاملات المالية</h1>
          <p className="text-muted">سجل الإيرادات والمصروفات</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => { setFormData({...formData, type: 'expense', category: ''}); handleOpenModal(); }} className="bg-red-500/10 text-red-500 hover:bg-red-500/20 px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors">
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">إضافة مصروف</span>
          </button>
          <button onClick={() => { setFormData({...formData, type: 'income', category: ''}); handleOpenModal(); }} className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors">
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">إضافة إيراد</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500/20 rounded-lg flex items-center justify-center">
              <ArrowDownRight className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-muted mb-1">إجمالي الإيرادات</p>
              <h3 className="text-2xl font-bold text-foreground">{totalIncome.toLocaleString()} د.ل</h3>
            </div>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-red-500/20 rounded-lg flex items-center justify-center">
              <ArrowUpRight className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <p className="text-sm text-muted mb-1">إجمالي المصروفات</p>
              <h3 className="text-2xl font-bold text-foreground">{totalExpense.toLocaleString()} د.ل</h3>
            </div>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted mb-1">صافي الرصيد</p>
              <h3 className="text-2xl font-bold text-foreground">{(totalIncome - totalExpense).toLocaleString()} د.ل</h3>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-4 border-b border-border p-4">
          <button 
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'dailyTransactions' ? 'bg-primary-500/10 text-primary-400' : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'}`}
            onClick={() => setActiveTab('dailyTransactions')}
          >
            سجل المعاملات
          </button>
          <button 
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'beneficiaries' ? 'bg-primary-500/10 text-primary-400' : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'}`}
            onClick={() => setActiveTab('beneficiaries')}
          >
            الرصيد حسب الجهة/المستفيد
          </button>
        </div>

        {activeTab === 'dailyTransactions' && (
          <>
            <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4 justify-between items-center">
              <div className="relative w-full sm:w-96">
                <input
                  type="text"
                  placeholder="البحث في المعاملات..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:border-primary-500 pr-10"
                />
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">من:</span>
                  <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-transparent py-2.5 text-sm text-foreground focus:outline-none"
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap border-r border-border pr-2">إلى:</span>
                  <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-transparent py-2.5 text-sm text-foreground focus:outline-none"
                  />
                </div>
                <select 
                  value={filterBeneficiary}
                  onChange={(e) => setFilterBeneficiary(e.target.value)}
                  className="bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary-500 flex-1 sm:flex-none max-w-[200px]"
                >
                  <option value="all">كل الجهات</option>
                  {uniqueBeneficiaries.map((b: any) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                <select 
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary-500"
                >
                  <option value="all">كل الأنواع</option>
                  <option value="income">إيرادات</option>
                  <option value="expense">مصروفات</option>
                </select>
                <ExportButtons 
                  onExport={() => exportToExcel(filteredTransactions, 'المعاملات_المالية')}
                  onPrint={() => printTable('transactions-table', 'المعاملات المالية')}
                />
              </div>
            </div>
        
        <div className="overflow-x-auto">
          <table id="transactions-table" className="w-full text-right">
            <thead>
              <tr className="bg-background border-b border-border">
                <th className="px-6 py-4 text-sm font-medium text-muted">التاريخ</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">النوع</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">التصنيف</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">الجهة/المستفيد</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">الوصف</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">المرجع</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">الخزينة/الحساب</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">المبلغ</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredTransactions.map((transaction: any) => (
                <tr key={transaction.id} className="hover:bg-surface-hover/50 transition-colors">
                  <td className="px-6 py-4 text-sm text-muted-foreground">{transaction.date}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1 w-fit ${transaction.type === 'income' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {transaction.type === 'income' ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                      {transaction.type === 'income' ? 'إيراد' : 'مصروف'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{transaction.category}</td>
                  <td className="px-6 py-4 text-sm text-foreground font-medium">{transaction.beneficiary || '-'}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{transaction.description}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{transaction.reference}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{transaction.accountName || '-'}</td>
                  <td className={`px-6 py-4 text-sm font-medium ${transaction.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {transaction.type === 'income' ? '+' : '-'}{Number(transaction.amount).toLocaleString()} د.ل
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {!transaction.supplierId && !transaction.orderId && (
                        <>
                          <button onClick={() => handleOpenModal(transaction)} className="p-1.5 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => confirmDelete(transaction.id, 'transaction', transaction)} className="p-1.5 text-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {(transaction.supplierId || transaction.orderId) && (
                        <span className="text-xs text-muted-foreground bg-surface-hover px-2 py-1 rounded">تلقائي</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-muted-foreground">لا توجد نتائج مطابقة للبحث</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
          </>
        )}

        {activeTab === 'beneficiaries' && (
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {uniqueBeneficiaries.map(beneficiary => {
                const benTrans = filteredTransactions.filter(t => t.beneficiary === beneficiary);
                if (benTrans.length === 0) return null; // Hide if dates filter excludes all trans
                const benIncome = benTrans.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount), 0);
                const benExpense = benTrans.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount), 0);
                const benNet = benIncome - benExpense;

                return (
                  <div key={beneficiary} className="bg-background border border-border rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center text-primary-500">
                        <Users className="w-5 h-5" />
                      </div>
                      <h3 className="font-bold text-foreground text-lg">{beneficiary}</h3>
                    </div>
                    <div className="space-y-3 pt-4 border-t border-border">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">إجمالي الإيرادات:</span>
                        <span className="text-emerald-400 font-medium">+{benIncome.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">إجمالي المصروفات:</span>
                        <span className="text-red-400 font-medium">-{benExpense.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm font-bold pt-2 border-t border-border">
                        <span className="text-foreground">صافي الرصيد:</span>
                        <span className={benNet >= 0 ? "text-emerald-400" : "text-red-400"}>
                          {benNet >= 0 ? '+' : '-'}{Math.abs(benNet).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {uniqueBeneficiaries.length === 0 && (
                <div className="col-span-full py-12 text-center text-muted-foreground">
                  لا توجد جهات أو مستفيدين حالياً
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-md flex flex-col max-h-[90vh] shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h3 className="text-lg font-bold text-foreground">{editingTransaction ? 'تعديل المعاملة' : (formData.type === 'income' ? 'إضافة إيراد' : 'إضافة مصروف')}</h3>
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
                  <option value="income">إيراد</option>
                  <option value="expense">مصروف</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">تصنيف المصروف / الإيراد</label>
                <select
                  value={formData.category} // Using category name for backward compatibility
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                >
                  <option value="">اختر الحساب...</option>
                  {chartOfAccounts
                    .filter(acc => formData.type === 'expense' ? acc.type === 'expense' : acc.type === 'revenue')
                    .map(acc => (
                    <option key={acc.id} value={acc.name}>{acc.code ? `${acc.code} - ` : ''}{acc.name}</option>
                  ))}
                  {formData.category && !chartOfAccounts.find(c => c.name === formData.category) && (
                    <option value={formData.category}>{formData.category}</option>
                  )}
                </select>
                <p className="text-xs text-muted-foreground mt-1">يتم جلب الحسابات من شجرة الحسابات</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">الخزينة / الحساب المالي</label>
                <select 
                  value={formData.accountId}
                  onChange={(e) => setFormData({...formData, accountId: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                >
                  <option value="">اختر الحساب...</option>
                  {financeAccounts.map(account => (
                    <option key={account.id} value={account.id}>{account.name} ({account.type === 'bank' ? 'بنك' : 'خزينة'})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">الجهة / المستفيد (اختياري)</label>
                {!isNewBeneficiary && uniqueBeneficiaries.length > 0 ? (
                  <select
                    value={formData.beneficiary}
                    onChange={(e) => {
                      if (e.target.value === 'NEW') {
                        setIsNewBeneficiary(true);
                        setFormData({...formData, beneficiary: ''});
                      } else {
                        setFormData({...formData, beneficiary: e.target.value});
                      }
                    }}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                  >
                    <option value="">اختر الجهة...</option>
                    {uniqueBeneficiaries.map((b: any) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                    <option value="NEW" className="font-bold text-primary-500">+ إضافة جهة جديدة</option>
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={formData.beneficiary}
                      onChange={(e) => setFormData({...formData, beneficiary: e.target.value})}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                      placeholder="مثال: شركة الكهرباء، المورد فلان..."
                    />
                    {uniqueBeneficiaries.length > 0 && (
                      <button 
                        type="button" 
                        onClick={() => {
                          setIsNewBeneficiary(false);
                          setFormData({...formData, beneficiary: ''});
                        }} 
                        className="px-3 py-2 bg-surface-hover hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors whitespace-nowrap text-sm"
                      >
                        إلغاء
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">المبلغ</label>
                <input 
                  type="number" 
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: Number(e.target.value)})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">التاريخ</label>
                <input 
                  type="date" 
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">الوصف</label>
                <input 
                  type="text" 
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">المرجع (اختياري)</label>
                <input 
                  type="text" 
                  value={formData.reference}
                  onChange={(e) => setFormData({...formData, reference: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                  dir="ltr"
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

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-foreground mb-2">تأكيد الحذف</h3>
            <p className="text-muted-foreground mb-6">
              {itemToDelete?.type === 'transaction' 
                ? 'هل أنت متأكد من حذف هذه المعاملة؟ سيتم استرجاع المبلغ للحساب المالي.' 
                : 'هل أنت متأكد من حذف هذا التصنيف؟'}
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setItemToDelete(null);
                }}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                إلغاء
              </button>
              <button 
                onClick={executeDelete}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                حذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
