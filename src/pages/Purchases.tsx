import React, { useState, useEffect } from 'react';
import { useUserAuth } from '../hooks/useUserAuth';

import { ShoppingCart, Plus, Search, Edit2, Trash2, X, FileText, DollarSign, Save } from 'lucide-react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, addDoc, writeBatch, increment } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { ExportButtons } from '../components/ExportButtons';
import { exportToExcel, printTable } from '../lib/exportUtils';

export default function Purchases() {
  const { branchId: userBranchId, hasPermission } = useUserAuth();
  const canViewAllBranches = hasPermission('branches.view_all');
  useEffect(() => {
    // Branch permissions check hook dependency
  }, [canViewAllBranches, userBranchId]);

  const [purchases, setPurchases] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [allBranches, setBranches] = useState<any[]>([]);
  const branches = canViewAllBranches ? allBranches : allBranches.filter(b => b.id === userBranchId);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [measurementUnits, setMeasurementUnits] = useState<any[]>([]);
  const DEFAULT_UNITS = ['كجم', 'جرام', 'لتر', 'مل', 'حبة', 'كرتون', 'عبوة'];
  const activeUnits = measurementUnits.length > 0 ? measurementUnits : DEFAULT_UNITS.map(u => ({ id: u, name: u }));
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterBranchId, setFilterBranchId] = useState('all');
  const [filterSupplierId, setFilterSupplierId] = useState('all');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<any>(null);
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [purchaseToDelete, setPurchaseToDelete] = useState<any>(null);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedPurchaseForPay, setSelectedPurchaseForPay] = useState<any>(null);

  // Quick Add Modals
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [newSupplierData, setNewSupplierData] = useState({ name: '', phone: '', email: '', type: 'مورد' });
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  const [activeMaterialItemIndex, setActiveMaterialItemIndex] = useState<number | null>(null);
  const [newMaterialData, setNewMaterialData] = useState({ name: '', unit: 'كجم', costPerUnit: 0, stock: 0, minStock: 0, branchId: '' });

  const confirmDelete = (purchase: any) => {
    if (purchase.paidAmount > 0) {
      setValidationError('لا يمكن حذف فاتورة مشتريات تم سداد جزء منها أو بالكامل. الرجاء تسوية الحسابات أولاً.');
      setTimeout(() => setValidationError(null), 4000);
      return;
    }
    setPurchaseToDelete(purchase);
    setIsDeleteModalOpen(true);
  };

  const executeDelete = async () => {
    if (!purchaseToDelete) return;
    
    try {
      const batch = writeBatch(db);
      
      // Revert stock for each material
      purchaseToDelete.items.forEach((item: any) => {
        const materialRef = doc(db, 'raw_materials', item.materialId);
        batch.update(materialRef, {
          stock: increment(-item.quantity)
        });

        // Log stock movement
        const material = materials.find(m => m.id === item.materialId);
        const supplier = suppliers.find(s => s.id === purchaseToDelete.supplierId);
        const movementRef = doc(collection(db, 'stock_movements'));
        batch.set(movementRef, {
          materialId: item.materialId,
          materialName: material?.name || 'مادة محذوفة',
          type: 'out',
          quantity: item.quantity,
          unit: item.unit || material?.unit || '',
          date: new Date().toISOString(),
          source: 'purchase_revert',
          note: `حذف فاتورة مشتريات للمورد: ${supplier?.name || 'غير معروف'} - فاتورة #${purchaseToDelete.id.slice(-6)}`
        });
      });

      // Delete the purchase document
      const purchaseRef = doc(db, 'purchases', purchaseToDelete.id);
      batch.delete(purchaseRef);

      await batch.commit();
      setIsDeleteModalOpen(false);
      setPurchaseToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `purchases/${purchaseToDelete.id}`);
    }
  };
  const [payAccountId, setPayAccountId] = useState('');
  const [payAmount, setPayAmount] = useState<number>(0);

  const [formData, setFormData] = useState({
    supplierId: '',
    branchId: '',
    date: new Date().toISOString().split('T')[0],
    status: 'غير مدفوعة',
    items: [] as any[],
    totalAmount: 0,
    paidAmount: 0,
    payAccountId: ''
  });
  
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribePurchases = onSnapshot(collection(db, 'purchases'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPurchases(data.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'purchases'));

    const unsubscribeMaterials = onSnapshot(collection(db, 'raw_materials'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMaterials(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'raw_materials'));

    const unsubscribeSuppliers = onSnapshot(collection(db, 'partners'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      setSuppliers(data.filter(c => c.type === 'مورد'));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'partners'));

    const unsubscribeBranches = onSnapshot(collection(db, 'branches'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBranches(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'branches'));

    const unsubscribeAccounts = onSnapshot(collection(db, 'accounts'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAccounts(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'accounts'));

    const unsubscribeUnits = onSnapshot(collection(db, 'measurement_units'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMeasurementUnits(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'measurement_units'));

    return () => {
      unsubscribePurchases();
      unsubscribeMaterials();
      unsubscribeSuppliers();
      unsubscribeBranches();
      unsubscribeAccounts();
      unsubscribeUnits();
    };
  }, []);

  const handleOpenModal = (purchase?: any) => {
    if (purchase) {
      setEditingPurchase(purchase);
      setFormData({
        supplierId: purchase.supplierId || '',
        branchId: purchase.branchId || '',
        date: purchase.date || new Date().toISOString().split('T')[0],
        status: purchase.status || 'غير مدفوعة',
        items: purchase.items || [],
        totalAmount: purchase.totalAmount || 0,
        paidAmount: purchase.paidAmount || 0,
        payAccountId: ''
      });
    } else {
      setEditingPurchase(null);
      setFormData({
        supplierId: '',
        branchId: '',
        date: new Date().toISOString().split('T')[0],
        status: 'غير مدفوعة',
        items: [],
        totalAmount: 0,
        paidAmount: 0,
        payAccountId: ''
      });
    }
    setIsModalOpen(true);
  };

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { materialId: '', quantity: 1, unit: '', unitPrice: 0, total: 0 }]
    }));
  };

  const updateItem = (index: number, field: string, value: any) => {
    setFormData(prev => {
      const newItems = [...prev.items];
      newItems[index] = { ...newItems[index], [field]: value };
      
      if (field === 'materialId') {
        const material = materials.find(m => m.id === value);
        if (material) {
          newItems[index].unitPrice = material.costPerUnit || 0;
          newItems[index].unit = material.unit || '';
        }
      }
      
      if (field === 'quantity' || field === 'unitPrice' || field === 'materialId') {
        newItems[index].total = Number(newItems[index].quantity) * Number(newItems[index].unitPrice);
      }
      
      const totalAmount = newItems.reduce((sum, item) => sum + item.total, 0);
      return { ...prev, items: newItems, totalAmount };
    });
  };

  const removeItem = (index: number) => {
    setFormData(prev => {
      const newItems = prev.items.filter((_, i) => i !== index);
      const totalAmount = newItems.reduce((sum, item) => sum + item.total, 0);
      return { ...prev, items: newItems, totalAmount };
    });
  };

  const handleSaveSupplier = async () => {
    if (!newSupplierData.name) {
      setValidationError('الرجاء إدخال اسم المورد');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }
    try {
      const docRef = await addDoc(collection(db, 'partners'), { ...newSupplierData, totalOrders: 0, totalSpent: 0 });
      setFormData(prev => ({ ...prev, supplierId: docRef.id }));
      setIsSupplierModalOpen(false);
      setNewSupplierData({ name: '', phone: '', email: '', type: 'مورد' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'partners');
    }
  };

  const handleSaveMaterial = async () => {
    if (!newMaterialData.name || !newMaterialData.branchId) {
      setValidationError('الرجاء إدخال الاسم وتحديد الفرع');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }
    try {
      const materialToSave = {
        ...newMaterialData,
        stock: Number(newMaterialData.stock),
        minStock: Number(newMaterialData.minStock),
        costPerUnit: Number(newMaterialData.costPerUnit)
      };
      const docRef = await addDoc(collection(db, 'raw_materials'), materialToSave);
      
      // Update the specific item with the new material
      if (activeMaterialItemIndex !== null) {
        updateItem(activeMaterialItemIndex, 'materialId', docRef.id);
        setActiveMaterialItemIndex(null);
      }
      
      setIsMaterialModalOpen(false);
      setNewMaterialData({ name: '', unit: 'كجم', costPerUnit: 0, stock: 0, minStock: 0, branchId: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'raw_materials');
    }
  };

  const handleSave = async () => {
    if (!formData.supplierId || !formData.branchId || formData.items.length === 0) {
      setValidationError('الرجاء اختيار المورد والفرع وإضافة مواد خام');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    if (formData.items.some(i => !i.materialId || i.quantity <= 0)) {
      setValidationError('الرجاء التأكد من اختيار المواد وتحديد كميات صحيحة');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    if (!editingPurchase && formData.paidAmount > 0 && !formData.payAccountId) {
      setValidationError('الرجاء اختيار حساب الدفع');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    if (!editingPurchase && formData.paidAmount > formData.totalAmount) {
      setValidationError('المبلغ المدفوع أكبر من إجمالي الفاتورة');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    try {
      const batch = writeBatch(db);
      
      if (editingPurchase) {
        const purchaseRef = doc(db, 'purchases', editingPurchase.id);
        
        let finalStatus = 'غير مدفوعة';
        if (formData.paidAmount > 0) {
          finalStatus = formData.paidAmount >= formData.totalAmount ? 'مدفوعة' : 'مدفوعة جزئياً';
        }
        
        const { payAccountId, ...updateData } = formData;
        updateData.status = finalStatus;
        
        batch.set(purchaseRef, updateData, { merge: true });
      } else {
        const purchaseRef = doc(collection(db, 'purchases'));
        
        let finalStatus = 'غير مدفوعة';
        if (formData.paidAmount > 0) {
          finalStatus = formData.paidAmount >= formData.totalAmount ? 'مدفوعة' : 'مدفوعة جزئياً';
        }
        
        const { payAccountId, ...purchaseData } = formData;
        purchaseData.status = finalStatus;
        
        batch.set(purchaseRef, purchaseData);
        
        // Update stock and cost for each material
        formData.items.forEach(item => {
          const materialRef = doc(db, 'raw_materials', item.materialId);
          batch.update(materialRef, {
            stock: increment(item.quantity),
            costPerUnit: item.unitPrice // Update cost to latest purchase price
          });

          // Log stock movement
          const material = materials.find(m => m.id === item.materialId);
          const supplier = suppliers.find(s => s.id === formData.supplierId);
          const movementRef = doc(collection(db, 'stock_movements'));
          batch.set(movementRef, {
            materialId: item.materialId,
            materialName: material?.name || 'مادة محذوفة',
            type: 'in',
            quantity: item.quantity,
            unit: item.unit || material?.unit || '',
            date: new Date().toISOString(),
            source: 'purchase',
            note: `مشتريات من المورد: ${supplier?.name || 'غير معروف'} - فاتورة #${purchaseRef.id.slice(-6)}`
          });
        });

        // Create transaction and update account balance if paid
        if (formData.paidAmount > 0 && formData.payAccountId) {
          const account = accounts.find(a => a.id === formData.payAccountId);
          const supplier = suppliers.find(s => s.id === formData.supplierId);
          
          const txRef = doc(collection(db, 'dailyTransactions'));
          batch.set(txRef, {
            type: 'expense',
            amount: formData.paidAmount,
            category: 'مشتريات',
            description: `سداد ${finalStatus === 'مدفوعة جزئياً' ? 'جزئي ل' : ''}فاتورة مشتريات للمورد: ${supplier?.name || 'غير معروف'}`,
            date: formData.date,
            accountId: formData.payAccountId,
            accountName: account?.name || '',
            supplierId: supplier?.id || '',
            supplierName: supplier?.name || '',
            createdAt: new Date().toISOString()
          });

          const accRef = doc(db, 'accounts', formData.payAccountId);
          batch.update(accRef, {
            balance: increment(-formData.paidAmount)
          });
        }
      }

      await batch.commit();
      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'purchases');
    }
  };

  const handleOpenPayModal = (purchase: any) => {
    setSelectedPurchaseForPay(purchase);
    setPayAccountId('');
    const remainingAmount = purchase.totalAmount - (purchase.paidAmount || 0);
    setPayAmount(remainingAmount);
    setIsPayModalOpen(true);
  };

  const handlePayPurchase = async () => {
    if (!payAccountId || !selectedPurchaseForPay) {
      setValidationError('الرجاء اختيار الخزينة/الحساب');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    if (payAmount <= 0) {
      setValidationError('الرجاء إدخال مبلغ صحيح');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    const remainingAmount = selectedPurchaseForPay.totalAmount - (selectedPurchaseForPay.paidAmount || 0);
    if (payAmount > remainingAmount) {
      setValidationError('المبلغ المدفوع أكبر من المبلغ المتبقي');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    try {
      const batch = writeBatch(db);
      const account = accounts.find(a => a.id === payAccountId);
      const supplier = suppliers.find(s => s.id === selectedPurchaseForPay.supplierId);

      // 1. Update purchase status and paid amount
      const purchaseRef = doc(db, 'purchases', selectedPurchaseForPay.id);
      const newPaidAmount = (selectedPurchaseForPay.paidAmount || 0) + payAmount;
      const newStatus = newPaidAmount >= selectedPurchaseForPay.totalAmount ? 'مدفوعة' : 'مدفوعة جزئياً';
      
      batch.update(purchaseRef, { 
        status: newStatus,
        paidAmount: newPaidAmount
      });

      // 2. Create general transaction (expense)
      const txRef = doc(collection(db, 'dailyTransactions'));
      batch.set(txRef, {
        type: 'expense',
        amount: payAmount,
        category: 'مشتريات',
        description: `سداد ${newStatus === 'مدفوعة جزئياً' ? 'جزئي ل' : ''}فاتورة مشتريات للمورد: ${supplier?.name || 'غير معروف'}`,
        date: new Date().toISOString().split('T')[0],
        accountId: payAccountId,
        accountName: account?.name || '',
        supplierId: supplier?.id || '',
        supplierName: supplier?.name || '',
        createdAt: new Date().toISOString()
      });

      // 3. Update account balance
      const accRef = doc(db, 'accounts', payAccountId);
      batch.update(accRef, {
        balance: increment(-payAmount)
      });

      await batch.commit();
      setIsPayModalOpen(false);
      setSelectedPurchaseForPay(null);
      setPayAmount(0);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'purchases');
    }
  };

  const filteredPurchases = purchases.filter(p => {
    const supplier = suppliers.find(s => s.id === p.supplierId);
    const matchesSearch = supplier?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStartDate = filterStartDate ? new Date(p.date) >= new Date(filterStartDate) : true;
    const matchesEndDate = filterEndDate ? new Date(p.date) <= new Date(filterEndDate) : true;
    const matchesBranch = filterBranchId === 'all' || p.branchId === filterBranchId;
    const matchesSupplier = filterSupplierId === 'all' || p.supplierId === filterSupplierId;

    return matchesSearch && matchesStartDate && matchesEndDate && matchesBranch && matchesSupplier;
  });

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">مشتريات المواد الخام</h1>
          <p className="text-muted">إدارة فواتير المشتريات وإضافتها للمخازن</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>إضافة فاتورة مشتريات</span>
        </button>
      </div>

      <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
              <input 
                type="text"
                placeholder="بحث باسم المورد..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-background border border-border rounded-lg pr-10 pl-4 py-2 text-foreground focus:outline-none focus:border-primary-500"
              />
            </div>
            </div>
            
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted">من:</label>
                <input 
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted">إلى:</label>
                <input 
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>

              <select
                value={filterBranchId}
                onChange={(e) => setFilterBranchId(e.target.value)}
                className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary-500 min-w-[150px]"
              >
                <option value="all">كل الفروع/المخازن</option>
                {branches.map(branch => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>

              <select
                value={filterSupplierId}
                onChange={(e) => setFilterSupplierId(e.target.value)}
                className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary-500 min-w-[150px]"
              >
                <option value="all">كل الموردين</option>
                {suppliers.map(supplier => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </select>
              <ExportButtons 
                onExport={() => exportToExcel(filteredPurchases, 'المشتريات')}
                onPrint={() => printTable('purchases-table', 'سجل المشتريات')}
              />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table id="purchases-table" className="w-full text-right">
            <thead className="bg-surface-hover border-b border-border">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-foreground">التاريخ</th>
                <th className="px-6 py-4 text-sm font-semibold text-foreground">المورد</th>
                <th className="px-6 py-4 text-sm font-semibold text-foreground">الفرع/المخزن</th>
                <th className="px-6 py-4 text-sm font-semibold text-foreground">الإجمالي (د.ل)</th>
                <th className="px-6 py-4 text-sm font-semibold text-foreground">المدفوع / المتبقي</th>
                <th className="px-6 py-4 text-sm font-semibold text-foreground">الحالة</th>
                <th className="px-6 py-4 text-sm font-semibold text-foreground">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredPurchases.map((purchase) => (
                <tr key={purchase.id} className="hover:bg-surface-hover/50 transition-colors">
                  <td className="px-6 py-4 text-foreground">{purchase.date}</td>
                  <td className="px-6 py-4 text-foreground font-medium">
                    {suppliers.find(s => s.id === purchase.supplierId)?.name || 'غير محدد'}
                  </td>
                  <td className="px-6 py-4 text-muted">
                    {branches.find(b => b.id === purchase.branchId)?.name || 'غير محدد'}
                  </td>
                  <td className="px-6 py-4 text-muted">{purchase.totalAmount.toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col text-sm">
                      <span className="text-emerald-500">{(purchase.paidAmount || 0).toLocaleString()}</span>
                      <span className="text-red-400">{(purchase.totalAmount - (purchase.paidAmount || 0)).toLocaleString()}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      purchase.status === 'مدفوعة' ? 'bg-emerald-500/10 text-emerald-400' : 
                      purchase.status === 'مدفوعة جزئياً' ? 'bg-blue-500/10 text-blue-400' :
                      'bg-yellow-500/10 text-yellow-400'
                    }`}>
                      {purchase.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {purchase.status !== 'مدفوعة' && (
                        <button 
                          onClick={() => handleOpenPayModal(purchase)} 
                          className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                          title="دفع الفاتورة"
                        >
                          <DollarSign className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => handleOpenModal(purchase)} className="p-1.5 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => confirmDelete(purchase)} className="p-1.5 text-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredPurchases.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">لا توجد فواتير مشتريات</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-3xl flex flex-col max-h-[90vh] shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h3 className="text-lg font-bold text-foreground">{editingPurchase ? 'تعديل فاتورة مشتريات' : 'إضافة فاتورة مشتريات'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-muted hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 space-y-6 overflow-y-auto">
              {validationError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                  {validationError}
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-muted">المورد</label>
                    {!editingPurchase && (
                      <button 
                        type="button"
                        onClick={() => setIsSupplierModalOpen(true)}
                        className="text-xs flex items-center gap-1 text-primary-500 hover:text-primary-400 p-0.5 rounded"
                      >
                        <Plus className="w-3 h-3" />
                        جديد
                      </button>
                    )}
                  </div>
                  <select 
                    value={formData.supplierId}
                    onChange={(e) => setFormData({...formData, supplierId: e.target.value})}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500 disabled:opacity-50"
                    disabled={!!editingPurchase}
                  >
                    <option value="">اختر المورد</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">الفرع/المخزن المستلم</label>
                  <select 
                    value={formData.branchId}
                    onChange={(e) => setFormData({...formData, branchId: e.target.value})}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500 disabled:opacity-50"
                    disabled={!!editingPurchase}
                  >
                    <option value="">اختر الفرع</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
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
              </div>

              <div>
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium text-foreground">المواد الخام</h4>
                  {!editingPurchase && (
                    <button 
                      onClick={addItem}
                      className="text-sm text-primary-500 hover:text-primary-400 flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      إضافة مادة
                    </button>
                  )}
                </div>
                
                <div className="space-y-3">
                  {formData.items.map((item, index) => (
                    <div key={index} className="flex gap-3 items-start bg-background p-3 rounded-lg border border-border">
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-xs text-muted">المادة</label>
                          {!editingPurchase && (
                            <button 
                              type="button"
                              onClick={() => {
                                setActiveMaterialItemIndex(index);
                                setIsMaterialModalOpen(true);
                              }}
                              className="text-[10px] flex items-center gap-1 text-primary-500 hover:text-primary-400 p-0.5 rounded"
                            >
                              <Plus className="w-3 h-3" />
                              جديد
                            </button>
                          )}
                        </div>
                        <select 
                          value={item.materialId}
                          onChange={(e) => updateItem(index, 'materialId', e.target.value)}
                          className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary-500 disabled:opacity-50"
                          disabled={!!editingPurchase}
                        >
                          <option value="">اختر المادة</option>
                          {materials.filter(m => !formData.branchId || m.branchId === formData.branchId).map(m => (
                            <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-24">
                        <label className="block text-xs text-muted mb-1">الكمية</label>
                        <input 
                          type="number" 
                          min="0.1"
                          step="0.1"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))}
                          className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary-500 disabled:opacity-50"
                          disabled={!!editingPurchase}
                        />
                      </div>
                      <div className="w-24">
                        <label className="block text-xs text-muted mb-1">الوحدة</label>
                        <select 
                          value={item.unit || ''}
                          onChange={(e) => updateItem(index, 'unit', e.target.value)}
                          className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary-500 disabled:opacity-50"
                          disabled={!!editingPurchase}
                        >
                          <option value="">...</option>
                          {activeUnits.map(u => (
                            <option key={u.id} value={u.name}>{u.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-28">
                        <label className="block text-xs text-muted mb-1">سعر الوحدة</label>
                        <input 
                          type="number" 
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(index, 'unitPrice', Number(e.target.value))}
                          className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary-500 disabled:opacity-50"
                          disabled={!!editingPurchase}
                        />
                      </div>
                      <div className="w-28">
                        <label className="block text-xs text-muted mb-1">الإجمالي</label>
                        <div className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-sm text-muted">
                          {item.total.toFixed(2)}
                        </div>
                      </div>
                      {!editingPurchase && (
                        <button 
                          onClick={() => removeItem(index)}
                          className="mt-6 p-1.5 text-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {formData.items.length === 0 && (
                    <div className="text-center py-4 text-sm text-muted bg-background rounded-lg border border-border border-dashed">
                      لم يتم إضافة مواد للفاتورة
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex justify-between items-center p-4 bg-background rounded-lg border border-border">
                <span className="font-medium text-foreground">إجمالي الفاتورة:</span>
                <span className="text-xl font-bold text-primary-500">{formData.totalAmount.toFixed(2)} د.ل</span>
              </div>

              {!editingPurchase && (
                <div className="grid grid-cols-2 gap-4 p-4 bg-surface-hover rounded-lg border border-border">
                  <div>
                    <label className="block text-sm font-medium text-muted mb-1">المبلغ المدفوع (الآن)</label>
                    <input 
                      type="number"
                      min="0"
                      max={formData.totalAmount}
                      step="0.01"
                      value={formData.paidAmount}
                      onChange={(e) => setFormData({...formData, paidAmount: Number(e.target.value)})}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted mb-1">دفع من الخزينة/الحساب</label>
                    <select 
                      value={formData.payAccountId}
                      onChange={(e) => setFormData({...formData, payAccountId: e.target.value})}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                      disabled={formData.paidAmount <= 0}
                    >
                      <option value="">اختر الخزينة...</option>
                      {accounts.map(account => (
                        <option key={account.id} value={account.id}>{account.name} - {Number(account.balance).toLocaleString()} د.ل</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-border shrink-0">
              <button 
                onClick={handleSave}
                className="w-full bg-primary-600 hover:bg-primary-500 text-white py-2 rounded-lg font-medium transition-colors"
              >
                حفظ الفاتورة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pay Purchase Modal */}
      {isPayModalOpen && selectedPurchaseForPay && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-md flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h3 className="text-lg font-bold text-foreground">دفع فاتورة مشتريات</h3>
              <button onClick={() => setIsPayModalOpen(false)} className="text-muted hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-background p-4 rounded-lg border border-border mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-muted">المورد:</span>
                  <span className="font-medium text-foreground">{suppliers.find(s => s.id === selectedPurchaseForPay.supplierId)?.name || 'غير محدد'}</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-muted">إجمالي الفاتورة:</span>
                  <span className="font-bold text-foreground">{selectedPurchaseForPay.totalAmount.toLocaleString()} د.ل</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-muted">المبلغ المدفوع مسبقاً:</span>
                  <span className="font-bold text-emerald-500">{(selectedPurchaseForPay.paidAmount || 0).toLocaleString()} د.ل</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-border">
                  <span className="text-muted">المبلغ المتبقي:</span>
                  <span className="font-bold text-primary-500">{(selectedPurchaseForPay.totalAmount - (selectedPurchaseForPay.paidAmount || 0)).toLocaleString()} د.ل</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">المبلغ المراد دفعه</label>
                <input 
                  type="number"
                  min="0"
                  max={selectedPurchaseForPay.totalAmount - (selectedPurchaseForPay.paidAmount || 0)}
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">دفع من الخزينة/الحساب</label>
                <select 
                  value={payAccountId}
                  onChange={(e) => setPayAccountId(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                >
                  <option value="">اختر الخزينة...</option>
                  {accounts.map(account => (
                    <option key={account.id} value={account.id}>{account.name} - {Number(account.balance).toLocaleString()} د.ل</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsPayModalOpen(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                إلغاء
              </button>
              <button onClick={handlePayPurchase} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                <span>تأكيد الدفع</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && purchaseToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-sm flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">تأكيد الحذف</h3>
              <p className="text-muted mb-6">
                هل أنت متأكد من رغبتك في حذف فاتورة المشتريات؟ سيتم إرجاع المخزون للمواد الخام المرتبطة.
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setPurchaseToDelete(null);
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

      {/* Add Supplier Modal */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-sm flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-lg font-bold text-foreground">إضافة مورد جديد</h3>
              <button onClick={() => setIsSupplierModalOpen(false)} className="text-muted hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">الاسم</label>
                <input 
                  type="text" 
                  value={newSupplierData.name}
                  onChange={(e) => setNewSupplierData({...newSupplierData, name: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">رقم الجوال</label>
                <input 
                  type="text" 
                  value={newSupplierData.phone}
                  onChange={(e) => setNewSupplierData({...newSupplierData, phone: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                  dir="ltr"
                />
              </div>
            </div>
            <div className="p-4 flex gap-3 border-t border-border">
              <button 
                onClick={() => setIsSupplierModalOpen(false)}
                className="flex-1 py-2 bg-surface border border-border text-foreground rounded-lg"
              >
                إلغاء
              </button>
              <button 
                onClick={handleSaveSupplier}
                className="flex-1 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg flex justify-center items-center gap-2"
              >
                <Save className="w-4 h-4" />
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Material Modal */}
      {isMaterialModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-sm flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-lg font-bold text-foreground">إضافة مادة خام جديدة</h3>
              <button onClick={() => setIsMaterialModalOpen(false)} className="text-muted hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">الاسم</label>
                <input 
                  type="text" 
                  value={newMaterialData.name}
                  onChange={(e) => setNewMaterialData({...newMaterialData, name: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">الوحدة</label>
                <select 
                  value={newMaterialData.unit}
                  onChange={(e) => setNewMaterialData({...newMaterialData, unit: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                >
                  {activeUnits.map(u => (
                    <option key={u.id} value={u.name}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">الفرع/المخزن</label>
                <select 
                  value={newMaterialData.branchId}
                  onChange={(e) => setNewMaterialData({...newMaterialData, branchId: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                >
                  <option value="">اختر الفرع</option>
                  {allBranches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="p-4 flex gap-3 border-t border-border">
              <button 
                onClick={() => setIsMaterialModalOpen(false)}
                className="flex-1 py-2 bg-surface border border-border text-foreground rounded-lg"
              >
                إلغاء
              </button>
              <button 
                onClick={handleSaveMaterial}
                className="flex-1 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg flex justify-center items-center gap-2"
              >
                <Save className="w-4 h-4" />
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
