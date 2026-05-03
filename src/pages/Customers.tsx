import React, { useState, useEffect } from 'react';
import { Users, Plus, Search, Filter, Edit2, Trash2, Phone, Mail, X, FileText, DollarSign, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, addDoc, writeBatch } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { ExportButtons } from '../components/ExportButtons';
import { exportToExcel, printTable } from '../lib/exportUtils';

export default function Customers() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [customers, setCustomers] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [financeAccounts, setFinanceAccounts] = useState<any[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isPurchasePayModalOpen, setIsPurchasePayModalOpen] = useState(false);
  
  const [customerToDelete, setCustomerToDelete] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [selectedPurchaseForPay, setSelectedPurchaseForPay] = useState<any>(null);
  const [purchasePayAccountId, setPurchasePayAccountId] = useState('');
  const [purchasePayAmount, setPurchasePayAmount] = useState<number>(0);
  
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', type: 'عميل' });
  const [paymentFormData, setPaymentFormData] = useState({ amount: 0, date: new Date().toISOString().split('T')[0], accountId: '', description: '', reference: '' });
  
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeCustomers = onSnapshot(collection(db, 'partners'), (snapshot) => {
      const customersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCustomers(customersData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'partners');
    });

    const unsubscribePurchases = onSnapshot(collection(db, 'purchases'), (snapshot) => {
      const purchasesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPurchases(purchasesData);
    }, (error) => {
      console.error("Error fetching purchases:", error);
    });

    const unsubscribeTransactions = onSnapshot(collection(db, 'dailyTransactions'), (snapshot) => {
      const transactionsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTransactions(transactionsData);
    }, (error) => {
      console.error("Error fetching transactions:", error);
    });

    const unsubscribeAccounts = onSnapshot(collection(db, 'accounts'), (snapshot) => {
      const accountsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFinanceAccounts(accountsData);
    }, (error) => {
      console.error("Error fetching finance accounts:", error);
    });

    return () => {
      unsubscribeCustomers();
      unsubscribePurchases();
      unsubscribeTransactions();
      unsubscribeAccounts();
    };
  }, []);

  const handleOpenProfile = (supplier: any) => {
    setSelectedSupplier(supplier);
    setIsProfileModalOpen(true);
  };

  const handleOpenPayment = () => {
    setPaymentFormData({
      amount: 0,
      date: new Date().toISOString().split('T')[0],
      accountId: '',
      description: `دفعة للمورد: ${selectedSupplier?.name || ''}`,
      reference: ''
    });
    setIsPaymentModalOpen(true);
  };

  const handleSavePayment = async () => {
    if (!paymentFormData.accountId || paymentFormData.amount <= 0) {
      setValidationError('الرجاء اختيار الحساب المالي وإدخال مبلغ صحيح');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    try {
      const batch = writeBatch(db);
      const accountRef = doc(db, 'accounts', paymentFormData.accountId);
      const account = financeAccounts.find(a => a.id === paymentFormData.accountId);
      
      if (!account) {
        setValidationError('الحساب المالي غير موجود');
        setTimeout(() => setValidationError(null), 3000);
        return;
      }

      // Apply payment to unpaid purchases (oldest first)
      let remainingPayment = paymentFormData.amount;
      const unpaidPurchases = purchases
        .filter(p => p.supplierId === selectedSupplier.id && p.status !== 'مدفوعة')
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      for (const purchase of unpaidPurchases) {
        if (remainingPayment <= 0) break;

        const purchaseRemaining = purchase.totalAmount - (purchase.paidAmount || 0);
        const amountToApply = Math.min(remainingPayment, purchaseRemaining);
        
        const newPaidAmount = (purchase.paidAmount || 0) + amountToApply;
        const newStatus = newPaidAmount >= purchase.totalAmount ? 'مدفوعة' : 'مدفوعة جزئياً';
        
        const purchaseRef = doc(db, 'purchases', purchase.id);
        batch.update(purchaseRef, {
          paidAmount: newPaidAmount,
          status: newStatus
        });

        remainingPayment -= amountToApply;
      }

      const transRef = doc(collection(db, 'dailyTransactions'));
      batch.set(transRef, {
        type: 'expense',
        category: 'موردين',
        amount: paymentFormData.amount,
        date: paymentFormData.date,
        description: paymentFormData.description,
        reference: paymentFormData.reference,
        accountId: paymentFormData.accountId,
        accountName: account.name,
        supplierId: selectedSupplier.id,
        supplierName: selectedSupplier.name,
        createdAt: new Date().toISOString()
      });

      batch.update(accountRef, { balance: Number(account.balance) - paymentFormData.amount });

      await batch.commit();
      setIsPaymentModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'dailyTransactions');
    }
  };

  const handleOpenPurchasePayModal = (purchase: any) => {
    setSelectedPurchaseForPay(purchase);
    setPurchasePayAccountId('');
    const remainingAmount = purchase.totalAmount - (purchase.paidAmount || 0);
    setPurchasePayAmount(remainingAmount);
    setIsPurchasePayModalOpen(true);
  };

  const handlePayPurchase = async () => {
    if (!purchasePayAccountId || !selectedPurchaseForPay) {
      setValidationError('الرجاء اختيار الخزينة/الحساب');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    if (purchasePayAmount <= 0) {
      setValidationError('الرجاء إدخال مبلغ صحيح');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    const remainingAmount = selectedPurchaseForPay.totalAmount - (selectedPurchaseForPay.paidAmount || 0);
    if (purchasePayAmount > remainingAmount) {
      setValidationError('المبلغ المدفوع أكبر من المبلغ المتبقي');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    try {
      const batch = writeBatch(db);
      const account = financeAccounts.find(a => a.id === purchasePayAccountId);
      const supplier = customers.find(s => s.id === selectedPurchaseForPay.supplierId);

      // 1. Update purchase status and paid amount
      const purchaseRef = doc(db, 'purchases', selectedPurchaseForPay.id);
      const newPaidAmount = (selectedPurchaseForPay.paidAmount || 0) + purchasePayAmount;
      const newStatus = newPaidAmount >= selectedPurchaseForPay.totalAmount ? 'مدفوعة' : 'مدفوعة جزئياً';
      
      batch.update(purchaseRef, { 
        status: newStatus,
        paidAmount: newPaidAmount
      });

      // 2. Create general transaction (expense)
      const txRef = doc(collection(db, 'dailyTransactions'));
      batch.set(txRef, {
        type: 'expense',
        amount: purchasePayAmount,
        category: 'مشتريات',
        description: `سداد ${newStatus === 'مدفوعة جزئياً' ? 'جزئي ل' : ''}فاتورة مشتريات للمورد: ${supplier?.name || 'غير معروف'}`,
        date: new Date().toISOString().split('T')[0],
        accountId: purchasePayAccountId,
        accountName: account?.name || '',
        supplierId: supplier?.id || '',
        supplierName: supplier?.name || '',
        createdAt: new Date().toISOString()
      });

      // 3. Update account balance
      const accRef = doc(db, 'accounts', purchasePayAccountId);
      batch.update(accRef, {
        balance: Number(account?.balance || 0) - purchasePayAmount
      });

      await batch.commit();
      setIsPurchasePayModalOpen(false);
      setSelectedPurchaseForPay(null);
      setPurchasePayAmount(0);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'purchases');
    }
  };

  const getSupplierStats = (supplierId: string) => {
    const supplierPurchases = purchases.filter(p => p.supplierId === supplierId);
    const supplierPayments = transactions.filter(t => t.supplierId === supplierId && t.type === 'expense');
    
    const totalPurchases = supplierPurchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
    
    // Calculate total payments based on the paidAmount of purchases to ensure consistency
    // even if some older transactions are missing the supplierId
    const totalPaidFromPurchases = supplierPurchases.reduce((sum, p) => sum + (p.paidAmount || 0), 0);
    
    // If there are standalone payments that exceed the purchase amounts, we should account for them
    const totalPaymentsFromTransactions = supplierPayments.reduce((sum, t) => sum + (t.amount || 0), 0);
    
    const totalPayments = Math.max(totalPaidFromPurchases, totalPaymentsFromTransactions);
    const balance = totalPurchases - totalPayments;
    
    return { totalPurchases, totalPayments, balance, supplierPurchases, supplierPayments };
  };

  const confirmDelete = (id: string) => {
    const hasPurchases = purchases.some(p => p.supplierId === id);
    const hasTransactions = transactions.some(t => t.supplierId === id);
    
    if (hasPurchases || hasTransactions) {
      setValidationError('لا يمكن حذف هذا السجل لوجود تعاملات مالية أو فواتير مرتبطة به.');
      setTimeout(() => setValidationError(null), 4000);
      return;
    }

    setCustomerToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const executeDelete = async () => {
    if (customerToDelete) {
      try {
        await deleteDoc(doc(db, 'partners', customerToDelete));
        setIsDeleteModalOpen(false);
        setCustomerToDelete(null);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `customers/${customerToDelete}`);
      }
    }
  };

  const handleOpenModal = (customer: any = null) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({ name: customer.name || '', phone: customer.phone || '', email: customer.email || '', type: customer.type || 'عميل' });
    } else {
      setEditingCustomer(null);
      setFormData({ name: '', phone: '', email: '', type: 'عميل' });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name) {
      setValidationError('الرجاء إدخال الاسم');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }
    
    try {
      if (editingCustomer) {
        await setDoc(doc(db, 'partners', editingCustomer.id), formData, { merge: true });
      } else {
        await addDoc(collection(db, 'partners'), { ...formData, totalOrders: 0, totalSpent: 0 });
      }
      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'partners');
    }
  };

  const filteredCustomers = customers.filter((c: any) => {
    const matchesSearch = (c.name && c.name.includes(searchTerm)) || (c.phone && c.phone.includes(searchTerm));
    const matchesType = filterType === 'all' || c.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="p-6 bg-background min-h-full text-foreground" dir="rtl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">العملاء والموردين</h1>
          <p className="text-muted">إدارة بيانات العملاء والموردين وسجل تعاملاتهم</p>
        </div>
        <button onClick={() => handleOpenModal()} className="bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors">
          <Plus className="w-5 h-5" />
          <span>إضافة جديد</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted mb-1">إجمالي العملاء</p>
              <h3 className="text-2xl font-bold text-foreground">{customers.filter((c:any) => c.type === 'عميل').length}</h3>
            </div>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500/20 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-muted mb-1">إجمالي الموردين</p>
              <h3 className="text-2xl font-bold text-foreground">{customers.filter((c:any) => c.type === 'مورد').length}</h3>
            </div>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-muted mb-1">إجمالي المسجلين</p>
              <h3 className="text-2xl font-bold text-foreground">{customers.length}</h3>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative w-full sm:w-96">
            <input
              type="text"
              placeholder="البحث بالاسم أو رقم الجوال..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:border-primary-500 pr-10"
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex gap-2">
            <select 
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary-500"
            >
              <option value="all">الكل</option>
              <option value="عميل">عميل</option>
              <option value="مورد">مورد</option>
            </select>
            <ExportButtons 
              onExport={() => exportToExcel(filteredCustomers, 'العملاء_والموردون')}
              onPrint={() => printTable('customers-table', 'دليل العملاء والموردين')}
            />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table id="customers-table" className="w-full text-right">
            <thead>
              <tr className="bg-background border-b border-border">
                <th className="px-6 py-4 text-sm font-medium text-muted">الاسم</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">النوع</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">معلومات التواصل</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">إجمالي الطلبات</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">إجمالي التعاملات</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCustomers.map((customer: any) => (
                <tr key={customer.id} className="hover:bg-surface-hover/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-muted">
                        <Users className="w-5 h-5" />
                      </div>
                      <span className="text-sm font-medium text-foreground">{customer.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${customer.type === 'عميل' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                      {customer.type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                        <span dir="ltr">{customer.phone}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{customer.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{customer.totalOrders}</td>
                  <td className="px-6 py-4 text-sm font-medium text-emerald-400">
                    {customer.type === 'مورد' 
                      ? `${getSupplierStats(customer.id).totalPurchases.toLocaleString()} د.ل`
                      : `${(customer.totalSpent || 0).toLocaleString()} د.ل`}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {customer.type === 'مورد' && (
                        <button onClick={() => handleOpenProfile(customer)} className="p-1.5 text-muted hover:text-primary-500 hover:bg-primary-500/10 rounded-lg transition-colors" title="ملف المورد">
                          <FileText className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => handleOpenModal(customer)} className="p-1.5 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => confirmDelete(customer.id)} className="p-1.5 text-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">لا توجد نتائج مطابقة للبحث</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-md flex flex-col max-h-[90vh] shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h3 className="text-lg font-bold text-foreground">{editingCustomer ? 'تعديل بيانات' : 'إضافة جديد'}</h3>
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
                <label className="block text-sm font-medium text-muted mb-1">الاسم</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>
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
                <label className="block text-sm font-medium text-muted mb-1">البريد الإلكتروني</label>
                <input 
                  type="email" 
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">النوع</label>
                <select 
                  value={formData.type}
                  onChange={(e) => setFormData({...formData, type: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                >
                  <option value="عميل">عميل</option>
                  <option value="مورد">مورد</option>
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
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-sm flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">تأكيد الحذف</h3>
              <p className="text-muted mb-6">هل أنت متأكد من رغبتك في حذف هذا السجل؟ لا يمكن التراجع عن هذا الإجراء.</p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setCustomerToDelete(null);
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

      {/* Supplier Profile Modal */}
      {isProfileModalOpen && selectedSupplier && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-4xl flex flex-col max-h-[90vh] shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-border shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary-500/20 text-primary-500 rounded-full flex items-center justify-center">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">ملف المورد: {selectedSupplier.name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedSupplier.phone} | {selectedSupplier.email}</p>
                </div>
              </div>
              <button onClick={() => setIsProfileModalOpen(false)} className="text-muted hover:text-foreground transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto pos-scroll">
              {(() => {
                const stats = getSupplierStats(selectedSupplier.id);
                return (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                      <div className="bg-background border border-border rounded-xl p-5">
                        <p className="text-sm text-muted mb-1">إجمالي المشتريات</p>
                        <p className="text-2xl font-bold text-foreground">{stats.totalPurchases.toLocaleString()} د.ل</p>
                      </div>
                      <div className="bg-background border border-border rounded-xl p-5">
                        <p className="text-sm text-muted mb-1">إجمالي المدفوعات</p>
                        <p className="text-2xl font-bold text-emerald-400">{stats.totalPayments.toLocaleString()} د.ل</p>
                      </div>
                      <div className="bg-background border border-border rounded-xl p-5">
                        <p className="text-sm text-muted mb-1">الرصيد المتبقي (المستحقات)</p>
                        <p className={`text-2xl font-bold ${stats.balance > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                          {stats.balance.toLocaleString()} د.ل
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-lg font-bold text-foreground">سجل التعاملات</h4>
                      <div className="flex gap-2">
                        <ExportButtons 
                          onExport={() => {
                            const customerTransactions = [
                              ...stats.supplierPurchases.map(p => ({ ...p, _type: 'purchase', _date: new Date(p.date || p.createdAt).getTime() })),
                              ...stats.supplierPayments.map(t => ({ ...t, _type: 'payment', _date: new Date(t.date).getTime() }))
                            ].sort((a, b) => b._date - a._date);
                            exportToExcel(customerTransactions, 'سجل_تعاملات_العميل');
                          }}
                          onPrint={() => printTable('customer-transactions-table', 'سجل تعاملات العميل')}
                        />
                        <button 
                          onClick={handleOpenPayment}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors"
                        >
                          <DollarSign className="w-4 h-4" />
                          <span>تسديد دفعة</span>
                        </button>
                      </div>
                    </div>

                    <div className="bg-background border border-border rounded-xl overflow-hidden">
                      <table id="customer-transactions-table" className="w-full text-right">
                        <thead className="bg-surface-hover border-b border-border">
                          <tr>
                            <th className="px-4 py-3 text-sm font-medium text-muted">التاريخ</th>
                            <th className="px-4 py-3 text-sm font-medium text-muted">النوع</th>
                            <th className="px-4 py-3 text-sm font-medium text-muted">المبلغ</th>
                            <th className="px-4 py-3 text-sm font-medium text-muted">المدفوع / المتبقي</th>
                            <th className="px-4 py-3 text-sm font-medium text-muted">الحالة</th>
                            <th className="px-4 py-3 text-sm font-medium text-muted">إجراءات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {[
                            ...stats.supplierPurchases.map(p => ({ ...p, _type: 'purchase', _date: new Date(p.date || p.createdAt).getTime() })),
                            ...stats.supplierPayments.map(t => ({ ...t, _type: 'payment', _date: new Date(t.date).getTime() }))
                          ].sort((a, b) => b._date - a._date).map((item: any, index) => (
                            <tr key={index} className="hover:bg-surface-hover/50 transition-colors">
                              <td className="px-4 py-3 text-sm text-foreground">{item.date || new Date(item.createdAt).toISOString().split('T')[0]}</td>
                              <td className="px-4 py-3">
                                {item._type === 'purchase' ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400">
                                    <ArrowUpRight className="w-3 h-3" />
                                    فاتورة مشتريات
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400">
                                    <ArrowDownRight className="w-3 h-3" />
                                    دفعة مسددة
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm font-bold text-foreground">
                                {(item.totalAmount || item.amount).toLocaleString()} د.ل
                              </td>
                              <td className="px-4 py-3 text-sm">
                                {item._type === 'purchase' ? (
                                  <div className="flex flex-col">
                                    <span className="text-emerald-500">{(item.paidAmount || 0).toLocaleString()} د.ل</span>
                                    <span className="text-red-400">{(item.totalAmount - (item.paidAmount || 0)).toLocaleString()} د.ل</span>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                {item._type === 'purchase' ? (
                                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                                    item.status === 'مدفوعة' ? 'bg-emerald-500/10 text-emerald-400' : 
                                    item.status === 'مدفوعة جزئياً' ? 'bg-blue-500/10 text-blue-400' :
                                    'bg-yellow-500/10 text-yellow-400'
                                  }`}>
                                    {item.status || 'غير مدفوعة'}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                {item._type === 'purchase' && item.status !== 'مدفوعة' && (
                                  <button 
                                    onClick={() => handleOpenPurchasePayModal(item)} 
                                    className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                                    title="دفع الفاتورة"
                                  >
                                    <DollarSign className="w-4 h-4" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                          {stats.supplierPurchases.length === 0 && stats.supplierPayments.length === 0 && (
                            <tr>
                              <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">لا توجد تعاملات سابقة</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-md flex flex-col max-h-[90vh] shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h3 className="text-lg font-bold text-foreground">تسديد دفعة للمورد</h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-muted hover:text-foreground transition-colors">
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
                <label className="block text-sm font-medium text-muted mb-1">المبلغ (د.ل)</label>
                <input 
                  type="number" 
                  min="0"
                  value={paymentFormData.amount}
                  onChange={(e) => setPaymentFormData({...paymentFormData, amount: Number(e.target.value)})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">التاريخ</label>
                <input 
                  type="date" 
                  value={paymentFormData.date}
                  onChange={(e) => setPaymentFormData({...paymentFormData, date: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">الحساب المالي (الخزينة/البنك)</label>
                <select 
                  value={paymentFormData.accountId}
                  onChange={(e) => setPaymentFormData({...paymentFormData, accountId: e.target.value})}
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
                  value={paymentFormData.description}
                  onChange={(e) => setPaymentFormData({...paymentFormData, description: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">رقم المرجع (اختياري)</label>
                <input 
                  type="text" 
                  value={paymentFormData.reference}
                  onChange={(e) => setPaymentFormData({...paymentFormData, reference: e.target.value})}
                  placeholder="رقم الإيصال أو التحويل"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsPaymentModalOpen(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                إلغاء
              </button>
              <button onClick={handleSavePayment} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors">
                تأكيد الدفع
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Purchase Pay Modal */}
      {isPurchasePayModalOpen && selectedPurchaseForPay && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-border flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-foreground">دفع فاتورة مشتريات</h3>
              <button onClick={() => setIsPurchasePayModalOpen(false)} className="text-muted hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto pos-scroll space-y-4">
              <div className="bg-surface-hover p-4 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">إجمالي الفاتورة:</span>
                  <span className="font-bold text-foreground">{selectedPurchaseForPay.totalAmount.toLocaleString()} د.ل</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">المدفوع مسبقاً:</span>
                  <span className="font-bold text-emerald-500">{(selectedPurchaseForPay.paidAmount || 0).toLocaleString()} د.ل</span>
                </div>
                <div className="flex justify-between text-sm border-t border-border pt-2">
                  <span className="text-muted-foreground">المبلغ المتبقي:</span>
                  <span className="font-bold text-red-400">{(selectedPurchaseForPay.totalAmount - (selectedPurchaseForPay.paidAmount || 0)).toLocaleString()} د.ل</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">المبلغ المراد دفعه (د.ل)</label>
                <input 
                  type="number" 
                  min="0"
                  max={selectedPurchaseForPay.totalAmount - (selectedPurchaseForPay.paidAmount || 0)}
                  value={purchasePayAmount}
                  onChange={(e) => setPurchasePayAmount(Number(e.target.value))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">الخزينة / الحساب</label>
                <select 
                  value={purchasePayAccountId}
                  onChange={(e) => setPurchasePayAccountId(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                >
                  <option value="">اختر الحساب...</option>
                  {financeAccounts.map(account => (
                    <option key={account.id} value={account.id}>{account.name} (الرصيد: {account.balance} د.ل)</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsPurchasePayModalOpen(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                إلغاء
              </button>
              <button onClick={handlePayPurchase} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors">
                تأكيد الدفع
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
