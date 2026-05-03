import React, { useState, useEffect } from 'react';
import { FolderTree, Plus, Edit2, Trash2, Search, ChevronDown, ChevronLeft, X, Check } from 'lucide-react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, addDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { ExportButtons } from '../components/ExportButtons';
import { exportToExcel, printTable } from '../lib/exportUtils';

interface AccountNode {
  id: string;
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  balance: number;
  parentId?: string | null;
  children?: AccountNode[];
}

const initialAccounts: AccountNode[] = [
  { id: '1', code: '1000', name: 'الأصول', type: 'asset', balance: 0, parentId: null },
  { id: '11', code: '1100', name: 'الأصول المتداولة', type: 'asset', balance: 0, parentId: '1' },
  { id: '111', code: '1110', name: 'النقدية بالخزينة', type: 'asset', balance: 0, parentId: '11' },
  { id: '112', code: '1120', name: 'البنوك', type: 'asset', balance: 0, parentId: '11' },
  { id: '12', code: '1200', name: 'الأصول الثابتة', type: 'asset', balance: 0, parentId: '1' },
  { id: '2', code: '2000', name: 'الخصوم', type: 'liability', balance: 0, parentId: null },
  { id: '21', code: '2100', name: 'الخصوم المتداولة', type: 'liability', balance: 0, parentId: '2' },
  { id: '211', code: '2110', name: 'الموردين', type: 'liability', balance: 0, parentId: '21' },
  { id: '3', code: '3000', name: 'حقوق الملكية', type: 'equity', balance: 0, parentId: null },
  { id: '31', code: '3100', name: 'رأس المال', type: 'equity', balance: 0, parentId: '3' },
  { id: '32', code: '3200', name: 'الأرباح المحتجزة', type: 'equity', balance: 0, parentId: '3' },
  { id: '4', code: '4000', name: 'الإيرادات', type: 'revenue', balance: 0, parentId: null },
  { id: '41', code: '4100', name: 'مبيعات المطعم', type: 'revenue', balance: 0, parentId: '4' },
  { id: '5', code: '5000', name: 'المصروفات', type: 'expense', balance: 0, parentId: null },
  { id: '51', code: '5100', name: 'مشتريات المواد الخام', type: 'expense', balance: 0, parentId: '5' },
  { id: '52', code: '5200', name: 'الرواتب والأجور', type: 'expense', balance: 0, parentId: '5' },
  { id: '53', code: '5300', name: 'مصروفات إدارية وعمومية', type: 'expense', balance: 0, parentId: '5' }
];

export default function ChartOfAccounts() {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set([]));
  const [accounts, setAccounts] = useState<AccountNode[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<AccountNode | null>(null);
  const [parentNodeForNew, setParentNodeForNew] = useState<AccountNode | null>(null);
  
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    type: 'asset' as AccountNode['type'],
    balance: 0,
    parentId: null as string | null
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'chartAccounts'), (snapshot) => {
      const accountsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AccountNode[];
      
      setAccounts(accountsList);
      
      if (accountsList.length === 0) {
        bootstrapInitialAccounts();
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'chartAccounts');
    });

    return () => unsubscribe();
  }, []);

  const bootstrapInitialAccounts = async () => {
    try {
      const batch = writeBatch(db);
      initialAccounts.forEach(acc => {
        const docRef = doc(db, 'chartAccounts', acc.id);
        batch.set(docRef, acc);
      });
      await batch.commit();
    } catch (err) {
      console.error(err);
    }
  };

  const buildTree = (flatList: AccountNode[], parentId: string | null = null): AccountNode[] => {
    return flatList
      .filter(node => node.parentId === parentId)
      .map(node => ({
        ...node,
        children: buildTree(flatList, node.id)
      }))
      .sort((a, b) => a.code.localeCompare(b.code));
  };

  const calculateTreeBalances = (nodes: AccountNode[]): AccountNode[] => {
    return nodes.map(node => {
      if (node.children && node.children.length > 0) {
        const structuredChildren = calculateTreeBalances(node.children);
        const childrenBalance = structuredChildren.reduce((sum, child) => sum + child.balance, 0);
        return { ...node, children: structuredChildren, balance: node.balance + childrenBalance };
      }
      return node;
    });
  };

  const treeData = calculateTreeBalances(buildTree(accounts));

  useEffect(() => {
    if (accounts.length > 0 && expandedNodes.size === 0 && !searchTerm) {
      setExpandedNodes(new Set(accounts.filter(a => !a.parentId).map(a => a.id)));
    }
  }, [accounts]);

  const toggleNode = (id: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedNodes(newExpanded);
  };

  const handleOpenModal = (node: AccountNode | null = null, parent: AccountNode | null = null) => {
    if (node) {
      // Find the pure flat node to avoid saving aggregated balances
      const flatNode = accounts.find(a => a.id === node.id);
      
      setEditingNode(node);
      setFormData({
        code: node.code,
        name: node.name,
        type: node.type,
        balance: flatNode ? flatNode.balance : node.balance,
        parentId: node.parentId || null
      });
    } else {
      setEditingNode(null);
      setParentNodeForNew(parent);
      setFormData({
        code: parent ? `${parent.code}X` : '',
        name: '',
        type: parent ? parent.type : 'asset',
        balance: 0,
        parentId: parent ? parent.id : null
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.code || !formData.name) return;
    
    try {
      const dataToSave = {
        code: formData.code,
        name: formData.name,
        type: formData.type,
        balance: Number(formData.balance),
        parentId: formData.parentId
      };

      if (editingNode) {
        await setDoc(doc(db, 'chartAccounts', editingNode.id), dataToSave, { merge: true });
      } else {
        await addDoc(collection(db, 'chartAccounts'), dataToSave);
      }
      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'chartAccounts');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذا الحساب؟')) {
      try {
        await deleteDoc(doc(db, 'chartAccounts', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `chart_of_accounts/${id}`);
      }
    }
  };

  const AccountRow = ({ node, level = 0 }: { node: AccountNode, level?: number }) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id) || !!searchTerm;

    const matchesSearch = searchTerm && (
      node.name.includes(searchTerm) || 
      node.code.includes(searchTerm)
    );

    if (searchTerm && !matchesSearch && !hasChildren) return null; // Very basic filter, in reality should filter tree properly

    return (
      <>
        <tr className="border-b border-border hover:bg-surface-hover/50 transition-colors">
          <td className="px-6 py-4" style={{ paddingRight: `${level * 2 + 1.5}rem` }}>
            <div className="flex items-center gap-2">
              {hasChildren ? (
                <button onClick={() => toggleNode(node.id)} className="p-1 hover:bg-surface rounded text-muted">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
              ) : (
                <div className="w-6" /> // spacer
              )}
              <span className={`font-medium ${matchesSearch ? 'text-primary-500' : 'text-foreground'}`}>{node.code} - {node.name}</span>
            </div>
          </td>
          <td className="px-6 py-4 text-sm text-muted-foreground hidden sm:table-cell">
            {node.type === 'asset' && 'أصل'}
            {node.type === 'liability' && 'خصم'}
            {node.type === 'equity' && 'حقوق ملكية'}
            {node.type === 'revenue' && 'إيراد'}
            {node.type === 'expense' && 'مصروف'}
          </td>
          <td className="px-6 py-4 text-sm font-bold text-foreground text-left" dir="ltr">
            {node.balance.toLocaleString()} د.ل
          </td>
          <td className="px-6 py-4 text-left">
            <div className="flex items-center justify-end gap-2">
               <button onClick={() => handleOpenModal(null, node)} className="p-1.5 text-muted hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors" title="إضافة حساب فرعي">
                <Plus className="w-4 h-4" />
              </button>
              <button onClick={() => handleOpenModal(node)} className="p-1.5 text-muted hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors">
                <Edit2 className="w-4 h-4" />
              </button>
              {!hasChildren && (
                <button onClick={() => handleDelete(node.id)} className="p-1.5 text-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </td>
        </tr>
        {hasChildren && isExpanded && node.children!.map(child => (
          <AccountRow key={child.id} node={child} level={level + 1} />
        ))}
      </>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FolderTree className="w-6 h-6 text-primary-500" />
            شجرة الحسابات (Chart of Accounts)
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">إدارة شجرة الحسابات المالية وتصنيفاتها</p>
        </div>
        <button onClick={() => handleOpenModal()} className="bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors">
          <Plus className="w-5 h-5" />
          حساب رئيسي جديد
        </button>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
            <input
              type="text"
              placeholder="البحث برقم أو اسم الحساب..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-background border border-border rounded-lg pr-10 pl-4 py-2 text-foreground focus:outline-none focus:border-primary-500"
            />
          </div>
          <button 
             onClick={() => {
                 if (expandedNodes.size > 0) setExpandedNodes(new Set());
                 else setExpandedNodes(new Set(accounts.map(a => a.id)));
             }}
             className="text-sm font-medium text-primary-400 hover:text-primary-300 transition-colors"
          >
             {expandedNodes.size > 0 ? 'طي الكل' : 'توسيع الكل'}
          </button>
          <ExportButtons 
            onExport={() => exportToExcel(accounts, 'دليل_الحسابات')}
            onPrint={() => printTable('chart-accounts-table', 'الدليل المحاسبي')}
          />
        </div>
        <div className="overflow-x-auto">
          <table id="chart-accounts-table" className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-background/50 border-b border-border text-sm font-medium text-muted">
                <th className="px-6 py-3 text-right">رقم واسم الحساب</th>
                <th className="px-6 py-3 text-right hidden sm:table-cell">النوع</th>
                <th className="px-6 py-3 text-left">الرصيد</th>
                <th className="px-6 py-3 text-left">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {treeData.map(account => (
                <AccountRow key={account.id} node={account} />
              ))}
              {treeData.length === 0 && (
                 <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">لايوجد حسابات</td>
                 </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface w-full max-w-md rounded-2xl shadow-xl border border-border overflow-hidden">
            <div className="p-6 border-b border-border flex justify-between items-center">
              <h3 className="text-xl font-bold text-foreground">
                {editingNode ? 'تعديل حساب' : (parentNodeForNew ? 'حساب فرعي جديد' : 'حساب رئيسي جديد')}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-muted hover:text-foreground transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {parentNodeForNew && (
                <div className="mb-4 text-sm text-primary-400">
                  سيتم إضافة هذا الحساب كحساب فرعي تحت: <span className="font-bold">{parentNodeForNew.name}</span>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-muted mb-1">رقم الحساب</label>
                <input 
                  type="text" 
                  value={formData.code}
                  onChange={(e) => setFormData({...formData, code: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-primary-500"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">اسم الحساب</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">نوع الحساب</label>
                <select 
                  value={formData.type}
                  onChange={(e) => setFormData({...formData, type: e.target.value as any})}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-primary-500"
                  disabled={!!parentNodeForNew || (editingNode && accounts.some(a => a.parentId === editingNode.id))}
                >
                  <option value="asset">أصل</option>
                  <option value="liability">خصم</option>
                  <option value="equity">حقوق ملكية</option>
                  <option value="revenue">إيراد</option>
                  <option value="expense">مصروف</option>
                </select>
                {(parentNodeForNew || (editingNode && accounts.some(a => a.parentId === editingNode.id))) && (
                  <p className="text-xs text-muted-foreground mt-1">يتبع نوع الحساب لارتباطه شجرياً</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">الرصيد الافتتاحي</label>
                <input 
                  type="number" 
                  value={formData.balance}
                  onChange={(e) => setFormData({...formData, balance: Number(e.target.value)})}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-primary-500"
                  dir="ltr"
                  disabled={!!(editingNode && accounts.some(a => a.parentId === editingNode.id))}
                />
                {(editingNode && accounts.some(a => a.parentId === editingNode.id)) && (
                   <p className="text-xs text-muted-foreground mt-1">رصيد الحساب الرئيسي يُحسب تلقائياً من الحسابات الفرعية</p>
                )}
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  onClick={handleSave}
                  className="flex-1 bg-primary-600 hover:bg-primary-500 text-white py-2 rounded-lg font-medium transition-colors"
                >
                  حفظ
                </button>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-surface-hover hover:bg-border text-foreground py-2 rounded-lg font-medium transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

