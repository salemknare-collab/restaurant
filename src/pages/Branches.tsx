import React, { useState, useEffect } from 'react';
import { Store, Plus, Search, Edit2, Trash2, MapPin, Phone, X } from 'lucide-react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';

export default function Branches() {
  const [searchTerm, setSearchTerm] = useState('');
  const [branches, setBranches] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [branchToDelete, setBranchToDelete] = useState<string | null>(null);
  const [editingBranch, setEditingBranch] = useState<any>(null);
  const [formData, setFormData] = useState({ name: '', location: '', phone: '', manager: '', status: 'نشط' });
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'branches'), (snapshot) => {
      const branchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBranches(branchesData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'branches');
    });

    return () => unsubscribe();
  }, []);

  const confirmDelete = (id: string) => {
    setBranchToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const executeDelete = async () => {
    if (branchToDelete) {
      try {
        await deleteDoc(doc(db, 'branches', branchToDelete));
        setIsDeleteModalOpen(false);
        setBranchToDelete(null);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `branches/${branchToDelete}`);
      }
    }
  };

  const handleOpenModal = (branch: any = null) => {
    if (branch) {
      setEditingBranch(branch);
      setFormData({ name: branch.name || '', location: branch.location || '', phone: branch.phone || '', manager: branch.manager || '', status: branch.status || 'نشط' });
    } else {
      setEditingBranch(null);
      setFormData({ name: '', location: '', phone: '', manager: '', status: 'نشط' });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name) {
      setValidationError('الرجاء إدخال اسم الفرع');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }
    
    try {
      if (editingBranch) {
        await setDoc(doc(db, 'branches', editingBranch.id), formData, { merge: true });
      } else {
        await addDoc(collection(db, 'branches'), { ...formData, employees: 0 });
      }
      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'branches');
    }
  };

  const filteredBranches = branches.filter((b: any) => 
    (b.name && b.name.includes(searchTerm)) || (b.location && b.location.includes(searchTerm))
  );

  return (
    <div className="p-6 bg-background min-h-full text-foreground" dir="rtl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">الفروع</h1>
          <p className="text-muted">إدارة فروع المطعم ومتابعة أدائها</p>
        </div>
        <button onClick={() => handleOpenModal()} className="bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors">
          <Plus className="w-5 h-5" />
          <span>إضافة فرع</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <Store className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted mb-1">إجمالي الفروع</p>
              <h3 className="text-2xl font-bold text-foreground">{branches.length}</h3>
            </div>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500/20 rounded-lg flex items-center justify-center">
              <Store className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-muted mb-1">الفروع النشطة</p>
              <h3 className="text-2xl font-bold text-foreground">{branches.filter((b:any) => b.status === 'نشط').length}</h3>
            </div>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <Store className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-muted mb-1">إجمالي الموظفين بالفروع</p>
              <h3 className="text-2xl font-bold text-foreground">
                {branches.reduce((sum: number, b: any) => sum + Number(b.employees), 0)}
              </h3>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative w-full sm:w-96">
            <input
              type="text"
              placeholder="البحث عن فرع..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:border-primary-500 pr-10"
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          </div>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredBranches.map((branch: any) => (
              <div key={branch.id} className="bg-background border border-border rounded-xl p-5 hover:border-primary-500/50 transition-colors group">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-surface flex items-center justify-center text-muted group-hover:text-primary-500 group-hover:bg-primary-500/10 transition-colors">
                      <Store className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-foreground">{branch.name}</h3>
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-medium mt-1 ${branch.status === 'نشط' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        {branch.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 transition-opacity">
                    <button onClick={() => handleOpenModal(branch)} className="p-1.5 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors" title="تعديل">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => confirmDelete(branch.id)} className="p-1.5 text-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors" title="حذف">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <span className="text-muted-foreground truncate">{branch.location || 'غير محدد'}</span>
                  </div>
                  
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center shrink-0">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <span className="text-muted-foreground" dir="ltr">{branch.phone || 'غير محدد'}</span>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
                    <div className="text-sm">
                      <span className="text-muted block text-[10px] mb-0.5">مدير الفرع</span>
                      <span className="text-foreground font-medium">{branch.manager || 'غير محدد'}</span>
                    </div>
                    <div className="text-sm text-left">
                      <span className="text-muted block text-[10px] mb-0.5">عدد الموظفين</span>
                      <span className="text-foreground font-medium">{branch.employees || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {filteredBranches.length === 0 && (
            <div className="text-center p-12 bg-background rounded-xl border border-border border-dashed">
              <Store className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
              <h3 className="text-lg font-medium text-foreground mb-1">لا توجد فروع</h3>
              <p className="text-muted-foreground">لم يتم العثور على فروع مطابقة للبحث</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-md flex flex-col max-h-[90vh] shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h3 className="text-lg font-bold text-foreground">{editingBranch ? 'تعديل بيانات الفرع' : 'إضافة فرع جديد'}</h3>
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
                <label className="block text-sm font-medium text-muted mb-1">اسم الفرع</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">الموقع</label>
                <input 
                  type="text" 
                  value={formData.location}
                  onChange={(e) => setFormData({...formData, location: e.target.value})}
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
                <label className="block text-sm font-medium text-muted mb-1">مدير الفرع</label>
                <input 
                  type="text" 
                  value={formData.manager}
                  onChange={(e) => setFormData({...formData, manager: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">الحالة</label>
                <select 
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                >
                  <option value="نشط">نشط</option>
                  <option value="مغلق للصيانة">مغلق للصيانة</option>
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
              <p className="text-muted mb-6">هل أنت متأكد من رغبتك في حذف هذا الفرع؟ لا يمكن التراجع عن هذا الإجراء.</p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setBranchToDelete(null);
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
