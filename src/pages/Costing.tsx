import React, { useState, useEffect } from 'react';
import { Calculator, Search, Edit2, TrendingUp, TrendingDown, X, Save, Plus, Trash2, Factory } from 'lucide-react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, addDoc, deleteDoc, writeBatch, increment, getDocs, query, where } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { ExportButtons } from '../components/ExportButtons';
import { exportToExcel, printTable } from '../lib/exportUtils';

export default function Costing() {
  const [searchTerm, setSearchTerm] = useState('');
  const [costings, setCostings] = useState<any[]>([]);
  const [rawMaterials, setRawMaterials] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isProductionModalOpen, setIsProductionModalOpen] = useState(false);
  const [productionCosting, setProductionCosting] = useState<any>(null);
  const [productionQuantity, setProductionQuantity] = useState(1);
  const [products, setProducts] = useState<any[]>([]);
  const [costingToDelete, setCostingToDelete] = useState<string | null>(null);
  const [editingCosting, setEditingCosting] = useState<any>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [formData, setFormData] = useState({ 
    product: '', 
    productId: '',
    category: '', 
    yieldQuantity: 1,
    ingredientsCost: 0, 
    packagingCost: 0, 
    laborCost: 0, 
    sellingPrice: 0,
    recipe: [] as any[]
  });

  useEffect(() => {
    const unsubscribeCostings = onSnapshot(collection(db, 'costings'), (snapshot) => {
      const costingsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCostings(costingsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'costings');
    });

    const unsubscribeMaterials = onSnapshot(collection(db, 'raw_materials'), (snapshot) => {
      const materialsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRawMaterials(materialsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'raw_materials');
    });

    const unsubscribeProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const productsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(productsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'products');
    });

    return () => {
      unsubscribeCostings();
      unsubscribeMaterials();
      unsubscribeProducts();
    };
  }, []);

  const calculateMargin = (data: any) => {
    const yieldQty = Math.max(1, data.yieldQuantity || 1);
    const totalCost = (Number(data.ingredientsCost) + Number(data.packagingCost) + Number(data.laborCost)) / yieldQty;
    if (data.sellingPrice <= 0) return 0;
    const profit = data.sellingPrice - totalCost;
    return ((profit / data.sellingPrice) * 100).toFixed(1);
  };

  const handleOpenModal = (costing: any = null) => {
    if (costing) {
      setEditingCosting(costing);
      setFormData({ 
        product: costing.product || '', 
        productId: costing.productId || '',
        category: costing.category || '', 
        yieldQuantity: costing.yieldQuantity || 1,
        ingredientsCost: costing.ingredientsCost || 0, 
        packagingCost: costing.packagingCost || 0, 
        laborCost: costing.laborCost || 0, 
        sellingPrice: costing.sellingPrice || 0,
        recipe: costing.recipe || []
      });
    } else {
      setEditingCosting(null);
      setFormData({ 
        product: '', 
        productId: '',
        category: '', 
        yieldQuantity: 1,
        ingredientsCost: 0, 
        packagingCost: 0, 
        laborCost: 0, 
        sellingPrice: 0,
        recipe: []
      });
    }
    setIsModalOpen(true);
  };

  const addRecipeItem = () => {
    setFormData({
      ...formData,
      recipe: [...formData.recipe, { materialId: '', quantity: 1, cost: 0 }]
    });
  };

  const updateRecipeItem = (index: number, field: string, value: any) => {
    const newRecipe = [...formData.recipe];
    newRecipe[index][field] = value;
    
    if (field === 'materialId') {
      const material = rawMaterials.find(m => m.id === value);
      if (material) {
        newRecipe[index].cost = material.costPerUnit || 0;
      }
    }
    
    if (field === 'cost') {
        newRecipe[index].cost = Number(value) || 0;
    }
    
    // Recalculate ingredients cost
    const newIngredientsCost = newRecipe.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.cost || 0)), 0);
    
    setFormData({
      ...formData,
      recipe: newRecipe,
      ingredientsCost: newIngredientsCost
    });
  };

  const removeRecipeItem = (index: number) => {
    const newRecipe = formData.recipe.filter((_, i) => i !== index);
    const newIngredientsCost = newRecipe.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.cost || 0)), 0);
    
    setFormData({
      ...formData,
      recipe: newRecipe,
      ingredientsCost: newIngredientsCost
    });
  };

  const handleSave = async () => {
    if (!formData.product) {
      setValidationError('الرجاء إدخال اسم المنتج');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }
    const margin = calculateMargin(formData);
    
    try {
      const batch = writeBatch(db);
      
      if (editingCosting) {
        batch.set(doc(db, 'costings', editingCosting.id), { ...formData, margin: Number(margin) }, { merge: true });
      } else {
        const costingRef = doc(collection(db, 'costings'));
        batch.set(costingRef, { ...formData, margin: Number(margin) });
      }

      // Sync with product recipe if linked
      if (formData.productId) {
        const productRef = doc(db, 'products', formData.productId);
        const yieldQty = Math.max(1, formData.yieldQuantity || 1);
        const unitTotalCost = (Number(formData.ingredientsCost) + Number(formData.packagingCost) + Number(formData.laborCost)) / yieldQty;
        
        // Normalize recipe amounts for a single unit
        const normalizedRecipe = formData.recipe.map(item => ({
          ...item,
          quantity: Number(item.quantity) / yieldQty
        }));
        
        batch.update(productRef, {
          cost: unitTotalCost,
          ingredients: normalizedRecipe,
          price: formData.sellingPrice
        });
      }

      await batch.commit();
      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'costings');
    }
  };

  const confirmDelete = (id: string) => {
    setCostingToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const executeDelete = async () => {
    if (costingToDelete) {
      try {
        await deleteDoc(doc(db, 'costings', costingToDelete));
        setIsDeleteModalOpen(false);
        setCostingToDelete(null);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `costings/${costingToDelete}`);
      }
    }
  };

  const handleOpenProduction = (costing: any) => {
    setProductionCosting(costing);
    setProductionQuantity(1);
    setIsProductionModalOpen(true);
  };

  const handleProduce = async () => {
    if (!productionCosting || productionQuantity <= 0) return;
    
    try {
      const batch = writeBatch(db);
      const yieldQty = Math.max(1, productionCosting.yieldQuantity || 1);
      const multiplier = productionQuantity / yieldQty;
      
      // Deduct raw materials
      if (productionCosting.recipe && productionCosting.recipe.length > 0) {
        for (const item of productionCosting.recipe) {
          if (item.materialId) {
            const materialRef = doc(db, 'raw_materials', item.materialId);
            const deductionQty = item.quantity * multiplier;
            batch.update(materialRef, { stock: increment(-deductionQty) });
            
            // Log stock movement for material
            const material = rawMaterials.find(m => m.id === item.materialId);
            const movementRef = doc(collection(db, 'stock_movements'));
            batch.set(movementRef, {
              materialId: item.materialId,
              materialName: material?.name || 'مادة محذوفة',
              type: 'out',
              quantity: deductionQty,
              date: new Date().toISOString(),
              source: 'production',
              note: `تصنيع المنتج: ${productionCosting.product}`,
              unit: material?.unit || ''
            });
          }
        }
      }

      // Add to product stock
      const product = products.find(p => p.id === productionCosting.productId || p.name === productionCosting.product);
      if (product) {
        const productRef = doc(db, 'products', product.id);
        batch.update(productRef, { stock: increment(productionQuantity) });
      }

      await batch.commit();
      setIsProductionModalOpen(false);
      setProductionCosting(null);
    } catch (error) {
       handleFirestoreError(error, OperationType.WRITE, 'production');
    }
  };

  const filteredCostings = costings.filter((c: any) => 
    (c.product && c.product.includes(searchTerm)) || (c.category && c.category.includes(searchTerm))
  );

  const averageMargin = costings.reduce((sum: number, c: any) => sum + Number(c.margin), 0) / (costings.length || 1);

  return (
    <div className="p-6 bg-background min-h-full text-foreground" dir="rtl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">التكاليف والتسعير</h1>
          <p className="text-muted">حساب تكلفة المنتجات وهوامش الربح</p>
        </div>
        <button onClick={() => handleOpenModal()} className="bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors">
          <Plus className="w-5 h-5" />
          <span>إضافة منتج</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <Calculator className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted mb-1">إجمالي المنتجات المسعرة</p>
              <h3 className="text-2xl font-bold text-foreground">{costings.length}</h3>
            </div>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500/20 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-muted mb-1">متوسط هامش الربح</p>
              <h3 className="text-2xl font-bold text-foreground">{averageMargin.toFixed(1)}%</h3>
            </div>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-500/20 rounded-lg flex items-center justify-center">
              <TrendingDown className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-muted mb-1">منتجات بهامش منخفض (&lt; 30%)</p>
              <h3 className="text-2xl font-bold text-foreground">{costings.filter((c:any) => c.margin < 30).length}</h3>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative w-full sm:w-96">
            <input
              type="text"
              placeholder="البحث عن منتج..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:border-primary-500 pr-10"
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          </div>
          <ExportButtons 
            onExport={() => {
              const exportData = filteredCostings.map((c: any) => {
                const yieldQty = Math.max(1, c.yieldQuantity || 1);
                const unitTotalCost = (Number(c.ingredientsCost) + Number(c.packagingCost) + Number(c.laborCost)) / yieldQty;
                return {
                  'المنتج': c.product,
                  'التصنيف': c.category,
                  'الكمية الناتجة': yieldQty,
                  'تكلفة المكونات للكمية': c.ingredientsCost,
                  'تكلفة المكونات للوحدة': Number(c.ingredientsCost) / yieldQty,
                  'تكلفة التغليف للوحدة': Number(c.packagingCost) / yieldQty,
                  'تكلفة العمالة للوحدة': Number(c.laborCost) / yieldQty,
                  'إجمالي التكلفة للوحدة': unitTotalCost,
                  'سعر البيع': c.sellingPrice,
                  'هامش الربح (%)': c.margin
                };
              });
              exportToExcel(exportData, 'التكاليف_والمقادير');
            }}
            onPrint={() => printTable('costings-table', 'التكاليف والمقادير')}
          />
        </div>
        
        <div className="overflow-x-auto">
          <table id="costings-table" className="w-full text-right">
            <thead>
              <tr className="bg-background border-b border-border">
                <th className="px-6 py-4 text-sm font-medium text-muted">المنتج</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">التصنيف</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">تكلفة المكونات للوحدة</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">تكلفة التغليف للوحدة</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">تكلفة العمالة للوحدة</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">إجمالي التكلفة للوحدة</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">سعر البيع</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">هامش الربح</th>
                <th className="px-6 py-4 text-sm font-medium text-muted">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCostings.map((costing: any) => {
                const yieldQty = Math.max(1, costing.yieldQuantity || 1);
                const unitIngredientsCost = Number(costing.ingredientsCost) / yieldQty;
                const unitPackagingCost = Number(costing.packagingCost) / yieldQty;
                const unitLaborCost = Number(costing.laborCost) / yieldQty;
                const unitTotalCost = unitIngredientsCost + unitPackagingCost + unitLaborCost;
                
                return (
                  <tr key={costing.id} className="hover:bg-surface-hover/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-foreground">
                      {costing.product}
                      {yieldQty > 1 && <span className="block text-xs text-muted">الكمية الناتجة: {yieldQty}</span>}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{costing.category}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{unitIngredientsCost.toFixed(2)} د.ل</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{unitPackagingCost.toFixed(2)} د.ل</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{unitLaborCost.toFixed(2)} د.ل</td>
                    <td className="px-6 py-4 text-sm font-bold text-amber-400">{unitTotalCost.toFixed(2)} د.ل</td>
                    <td className="px-6 py-4 text-sm font-bold text-emerald-400">{Number(costing.sellingPrice).toFixed(2)} د.ل</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        costing.margin >= 40 ? 'bg-emerald-500/10 text-emerald-400' : 
                        costing.margin >= 25 ? 'bg-amber-500/10 text-amber-400' : 
                        'bg-red-500/10 text-red-400'
                      }`}>
                        {costing.margin}%
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleOpenProduction(costing)} className="p-1.5 text-muted hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors" title="تصنيع (تعديل كميات)">
                          <Factory className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleOpenModal(costing)} className="p-1.5 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors" title="تعديل التكلفة والوصفة">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => confirmDelete(costing.id)} className="p-1.5 text-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors" title="حذف">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredCostings.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-muted-foreground">لا توجد نتائج مطابقة للبحث</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Costing Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-md flex flex-col max-h-[90vh] shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h3 className="text-lg font-bold text-foreground">{editingCosting ? `تعديل تكاليف: ${formData.product}` : 'إضافة منتج جديد'}</h3>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted mb-1">اسم المنتج</label>
                  <select 
                    value={formData.productId}
                    onChange={(e) => {
                      const selectedProduct = products.find(p => p.id === e.target.value);
                      if (selectedProduct) {
                         setFormData({
                           ...formData, 
                           productId: selectedProduct.id, 
                           product: selectedProduct.name,
                           category: selectedProduct.category || formData.category,
                           sellingPrice: selectedProduct.price || formData.sellingPrice
                         });
                      } else {
                         setFormData({...formData, productId: '', product: ''});
                      }
                    }}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                  >
                    <option value="">اختر المنتج...</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">التصنيف</label>
                  <input 
                    type="text" 
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">الكمية الناتجة عن هذه الوصفة</label>
                  <input 
                    type="number" 
                    min="1"
                    step="1"
                    value={formData.yieldQuantity}
                    onChange={(e) => setFormData({...formData, yieldQuantity: Number(e.target.value) || 1})}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">تكلفة المكونات</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={formData.ingredientsCost}
                    onChange={(e) => setFormData({...formData, ingredientsCost: Number(e.target.value)})}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                    readOnly={formData.recipe.length > 0}
                  />
                  {formData.recipe.length > 0 && (
                    <p className="text-xs text-muted mt-1">محسوبة تلقائياً من الوصفة</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">تكلفة التغليف</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={formData.packagingCost}
                    onChange={(e) => setFormData({...formData, packagingCost: Number(e.target.value)})}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">تكلفة العمالة</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={formData.laborCost}
                    onChange={(e) => setFormData({...formData, laborCost: Number(e.target.value)})}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">سعر البيع</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={formData.sellingPrice}
                    onChange={(e) => setFormData({...formData, sellingPrice: Number(e.target.value)})}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              <div className="border-t border-border pt-4 mt-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium text-foreground">وصفة المنتج (المواد الخام)</h4>
                  <button onClick={addRecipeItem} className="text-xs bg-surface-hover text-foreground px-2 py-1 rounded flex items-center gap-1">
                    <Plus className="w-3 h-3" /> إضافة مادة
                  </button>
                </div>
                
                <div className="space-y-2">
                  {formData.recipe.map((item, index) => (
                    <div key={index} className="flex gap-2 items-center bg-surface-hover/30 p-2 rounded-lg border border-border">
                      <select
                        value={item.materialId}
                        onChange={(e) => updateRecipeItem(index, 'materialId', e.target.value)}
                        className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-xs text-foreground"
                      >
                        <option value="">اختر المادة</option>
                        {rawMaterials.map(m => (
                          <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateRecipeItem(index, 'quantity', Number(e.target.value))}
                        className="w-20 bg-background border border-border rounded px-2 py-1.5 text-xs text-foreground"
                        placeholder="الكمية"
                        min="0"
                        step="0.01"
                      />
                      <div className="w-16 text-xs text-muted text-center">
                        {(Number(item.quantity || 0) * Number(item.cost || 0)).toFixed(2)}
                      </div>
                      <button onClick={() => removeRecipeItem(index)} className="p-1 text-red-500 hover:bg-red-500/10 rounded">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {formData.recipe.length === 0 && (
                    <p className="text-xs text-muted text-center py-2">لم يتم إضافة مواد خام. سيتم استخدام التكلفة اليدوية.</p>
                  )}
                </div>
              </div>
              
              <div className="mt-4 p-4 bg-background rounded-lg border border-border">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted">إجمالي التكلفة:</span>
                  <span className="font-bold text-amber-400">
                    {(Number(formData.ingredientsCost) + Number(formData.packagingCost) + Number(formData.laborCost)).toFixed(2)} د.ل
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted">هامش الربح المتوقع:</span>
                  <span className={`font-bold ${Number(calculateMargin(formData)) >= 40 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {calculateMargin(formData)}%
                  </span>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                إلغاء
              </button>
              <button onClick={handleSave} className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                <Save className="w-4 h-4" />
                <span>حفظ التعديلات</span>
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
              <p className="text-muted mb-6">هل أنت متأكد من رغبتك في حذف هذا المنتج؟ لا يمكن التراجع عن هذا الإجراء.</p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setCostingToDelete(null);
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

      {/* Production Modal */}
      {isProductionModalOpen && productionCosting && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-md flex flex-col max-h-[90vh] shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h3 className="text-lg font-bold text-foreground">تصنيع المنتج: {productionCosting.product}</h3>
              <button onClick={() => setIsProductionModalOpen(false)} className="text-muted hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 space-y-4 overflow-y-auto pos-scroll">
              <div className="bg-primary-500/10 border border-primary-500/20 rounded-lg p-3">
                <p className="text-sm text-primary-400">
                  قم بتحديد الكمية المراد تصنيعها. سيتم خصم المواد الخام من المخزون وإضافتها إلى مخزون المنتج النهائي تلقائياً بناءً على الوصفة.
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-muted mb-1">الكمية المراد تصنيعها</label>
                <input 
                  type="number" 
                  min="1"
                  step="1"
                  value={productionQuantity}
                  onChange={(e) => setProductionQuantity(Number(e.target.value) || 1)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>

              <div className="border-t border-border pt-4">
                <h4 className="font-medium text-foreground mb-3">المواد المستهلكة المتوقعة</h4>
                {productionCosting.recipe && productionCosting.recipe.length > 0 ? (
                  <div className="space-y-2">
                    {productionCosting.recipe.map((item: any, index: number) => {
                      const material = rawMaterials.find(m => m.id === item.materialId);
                      const yieldQty = Math.max(1, productionCosting.yieldQuantity || 1);
                      const multiplier = productionQuantity / yieldQty;
                      const requiredQty = item.quantity * multiplier;
                      const hasEnoughStock = material && (material.stock || 0) >= requiredQty;
                      
                      return (
                        <div key={index} className="flex justify-between items-center bg-background border border-border p-2 rounded-lg">
                          <div>
                            <p className="text-sm text-foreground">{material?.name || 'مادة محذوفة'}</p>
                            <p className="text-xs text-muted">
                              المتوفر: {material?.stock || 0} {material?.unit || ''}
                            </p>
                          </div>
                          <div className={`text-sm font-bold flex flex-col items-end ${hasEnoughStock ? 'text-amber-400' : 'text-red-400'}`}>
                            <span>- {requiredQty.toFixed(2)} {material?.unit || ''}</span>
                            {!hasEnoughStock && <span className="text-[10px] text-red-500 font-normal">الرصيد غير كافٍ</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted text-center py-4 bg-background rounded-lg border border-border">لا توجد مواد في الوصفة</p>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-border flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsProductionModalOpen(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                إلغاء
              </button>
              <button 
                onClick={handleProduce} 
                disabled={!productionCosting.recipe || productionCosting.recipe.length === 0}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <Factory className="w-4 h-4" />
                <span>إتمام التصنيع</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
