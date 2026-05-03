import React, { useState, useEffect } from 'react';
import { useUserAuth } from '../hooks/useUserAuth';

import { useNavigate } from 'react-router-dom';
import { useCart } from '../hooks/useCart';
import { useSettings } from '../context/SettingsContext';
import { useFormatCurrency } from '../hooks/useFormatCurrency';
import { 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  CreditCard, 
  Banknote, 
  Smartphone,
  Utensils,
  ShoppingBag,
  ShoppingCart,
  Truck,
  ArrowRight,
  MessageSquare,
  LogOut,
  Printer
} from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, addDoc, onSnapshot, writeBatch, doc, increment } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { printInvoice } from '../lib/exportUtils';

export default function POS() {
  const { branchId: userBranchId, hasPermission } = useUserAuth();
  const canViewAllBranches = hasPermission('branches.view_all');
  useEffect(() => {
    // Branch permissions check hook dependency
  }, [canViewAllBranches, userBranchId]);

  const { storeSettings, invoiceSettings } = useSettings();
  const formatCurrency = useFormatCurrency();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut(auth).catch(e => console.error("Sign out error:", e));
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [allBranches, setBranches] = useState<any[]>([]);
  const branches = canViewAllBranches ? allBranches : allBranches.filter(b => b.id === userBranchId);
  const [financeAccounts, setFinanceAccounts] = useState<any[]>([]);
  const [costings, setCostings] = useState<any[]>([]);
  const [rawMaterials, setRawMaterials] = useState<any[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [isCartOpen, setIsCartOpen] = useState(window.innerWidth >= 1024);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastOrder, setLastOrder] = useState<any>(null);
  const [showProductToggleConfirm, setShowProductToggleConfirm] = useState<{ productId: string, currentStatus: boolean, name?: string } | null>(null);
  const [lastOrderTotal, setLastOrderTotal] = useState(0);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserBranchId, setCurrentUserBranchId] = useState<string | null>(null);

  useEffect(() => {
    const fetchPermissions = async () => {
      const directSessionStr = localStorage.getItem('direct_employee_session');
      if (directSessionStr) {
        try {
          const session = JSON.parse(directSessionStr);
          setUserPermissions(session.permissions || []);
          if (session.roleId === 'admin') setIsAdmin(true);
        } catch(e) {}
      }

      const user = auth.currentUser;
      if (!user) return;
      const email = user.email || '';
      if (!email) return;
      if (!email) return;

      try {
        const { getDoc } = await import('firebase/firestore');
        const userDoc = await getDoc(doc(db, 'users', email));
        if (userDoc.exists()) {
          const data = userDoc.data();
          const roleId = data.roleId;
          const userPermissions = data.permissions;
          
          if (data.branchId) {
            setCurrentUserBranchId(data.branchId);
            setSelectedBranch(data.branchId);
          }

          if (userPermissions && userPermissions.length > 0) {
            setUserPermissions(userPermissions);
          } else if (roleId) {
            const roleDoc = await getDoc(doc(db, 'roles', roleId));
            if (roleDoc.exists()) {
              setUserPermissions(roleDoc.data().permissions || []);
            } else {
              if (roleId === 'cashier') setUserPermissions(['pos.access', 'product.availability']);
            }
          }
        }
      } catch (e) {
        console.error(e);
      }

      if (email === 'salem.sam59@gmail.com' || email.endsWith('@restaurant.internal')) {
        setIsAdmin(true);
      }
    };
    fetchPermissions();
  }, []);

  useEffect(() => {
    const unsubscribeProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const productsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(productsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'products');
    });

    const unsubscribeCategories = onSnapshot(collection(db, 'product_categories'), (snapshot) => {
      const categoriesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCategories(categoriesData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'product_categories');
    });

    const unsubscribeBranches = onSnapshot(collection(db, 'branches'), (snapshot) => {
      const branchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBranches(branchesData.filter((b: any) => b.status === 'نشط'));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'branches');
    });

    const unsubscribeAccounts = onSnapshot(collection(db, 'accounts'), (snapshot) => {
      const accountsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      setFinanceAccounts(accountsData);
      
      if (accountsData.length > 0) {
        if (currentUserBranchId) {
          const branchAccount = accountsData.find((a: any) => a.branchId === currentUserBranchId);
          if (branchAccount) {
            setSelectedAccountId(branchAccount.id);
          } else {
            setSelectedAccountId(accountsData[0].id);
          }
        } else {
          setSelectedAccountId(accountsData[0].id);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'accounts');
    });

    const unsubscribeCostings = onSnapshot(collection(db, 'costings'), (snapshot) => {
      const costingsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCostings(costingsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'costings');
    });

    const unsubscribeRawMaterials = onSnapshot(collection(db, 'raw_materials'), (snapshot) => {
      const rawMaterialsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRawMaterials(rawMaterialsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'raw_materials');
    });

    return () => {
      unsubscribeProducts();
      unsubscribeCategories();
      unsubscribeBranches();
      unsubscribeAccounts();
      unsubscribeCostings();
      unsubscribeRawMaterials();
    };
  }, []);

  useEffect(() => {
    if (financeAccounts.length > 0) {
      if (selectedBranch && selectedBranch !== 'all') {
        const branchAccount = financeAccounts.find(a => a.branchId === selectedBranch);
        if (branchAccount) {
          setSelectedAccountId(branchAccount.id);
        }
      }
    }
  }, [selectedBranch, financeAccounts]);

  const { 
    items, 
    addItem, 
    removeItem, 
    updateQuantity, 
    updateNote,
    clearCart, 
    subtotal, 
    deliveryFee, 
    total,
    orderType,
    setOrderType,
    tableNumber,
    setTableNumber,
    customerName,
    setCustomerName,
    customerPhone,
    setCustomerPhone
  } = useCart();

  const hasAvailabilityPermission = isAdmin || userPermissions.includes('product.availability');

  const filteredProducts = products.filter(product => {
    const productCategory = product.category || product.categoryId;
    const categoryMatch = categories.find(c => c.id === activeCategory);
    const matchesCategory = activeCategory === 'all' || productCategory === activeCategory || productCategory === categoryMatch?.name;
    const matchesSearch = product.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesBranch = selectedBranch === 'all' || !product.branchId || product.branchId === selectedBranch;
    const isAvailable = product.isAvailable !== false;
    const shouldShow = isAvailable || hasAvailabilityPermission;
    return matchesCategory && matchesSearch && matchesBranch && shouldShow;
  });

  const toggleProductAvailability = async (e: React.ChangeEvent<HTMLInputElement> | React.MouseEvent, product: any, currentStatus: boolean) => {
    e.stopPropagation();
    setShowProductToggleConfirm({
      productId: product.id,
      name: product.name,
      currentStatus: currentStatus
    });
  };

  const executeToggleAvailability = async () => {
    if (!showProductToggleConfirm) return;
    try {
      const { updateDoc } = await import('firebase/firestore');
      await updateDoc(doc(db, 'products', showProductToggleConfirm.productId), {
        isAvailable: !showProductToggleConfirm.currentStatus
      });
      setShowProductToggleConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `products/${showProductToggleConfirm.productId}`);
    }
  };

  const handleCheckout = async (method: string) => {
    if (items.length === 0) return;
    if (selectedBranch === 'all') {
      setValidationError('الرجاء تحديد الفرع لإنشاء الطلب');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }
    if (!selectedAccountId) {
      setValidationError('الرجاء اختيار الخزينة/الحساب المالي');
      setTimeout(() => setValidationError(null), 3000);
      return;
    }
    
    try {
      const batch = writeBatch(db);

      const orderRef = doc(collection(db, 'orders'));
      const currentUser = auth.currentUser;
      const branchName = branches.find(b => b.id === selectedBranch)?.name || '';
      const account = financeAccounts.find(a => a.id === selectedAccountId);
      
      const orderData = {
        items: items.map(item => ({
          productId: item.product.id,
          name: item.product.name,
          price: item.product.price,
          quantity: item.quantity,
          notes: item.note || ''
        })),
        subtotal,
        deliveryFee,
        total,
        method,
        orderType,
        branchId: selectedBranch === 'all' ? '' : selectedBranch,
        branchName: selectedBranch === 'all' ? '' : branchName,
        accountId: selectedAccountId,
        accountName: account?.name || '',
        tableNumber: orderType === 'dine_in' ? tableNumber : null,
        customerName: (orderType === 'takeaway' || orderType === 'delivery') ? customerName : null,
        customerPhone: (orderType === 'takeaway' || orderType === 'delivery') ? customerPhone : null,
        status: 'new',
        createdAt: new Date().toISOString(),
        cashierId: currentUser?.uid || 'unknown',
        cashierName: currentUser?.displayName || currentUser?.email || 'موظف غير معروف',
      };
      batch.set(orderRef, orderData);
      
      // Update finance account balance
      if (account) {
        const accountRef = doc(db, 'accounts', selectedAccountId);
        batch.update(accountRef, { balance: Number(account.balance) + total });
      }
      
      // Also add to kitchen orders
      const kitchenOrderRef = doc(collection(db, 'kitchen_orders'));
      batch.set(kitchenOrderRef, {
        orderRefId: orderRef.id,
        source: 'pos',
        type: orderType === 'dine_in' ? 'داخلي' : orderType === 'takeaway' ? 'سفري' : 'توصيل',
        branchId: selectedBranch === 'all' ? '' : selectedBranch,
        branchName: selectedBranch === 'all' ? '' : branchName,
        table: orderType === 'dine_in' ? tableNumber : null,
        customer: (orderType === 'takeaway' || orderType === 'delivery') ? customerName : null,
        status: 'new',
        time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
        createdAt: new Date().toISOString(),
        items: items.map(item => {
          const productCategory = item.product.category || item.product.categoryId;
          const category = categories.find(c => c.name === productCategory);
          return {
            name: item.product.name,
            quantity: item.quantity,
            notes: item.note || '',
            kitchenId: category?.kitchenId || ''
          };
        })
      });

      // Decrement stock for each product and its raw materials
      items.forEach(item => {
        if (item.product.id) {
          const productRef = doc(db, 'products', item.product.id);
          batch.update(productRef, {
            stock: increment(-item.quantity)
          });

          // Deduct raw materials from product ingredients
          if (item.product.ingredients && item.product.ingredients.length > 0) {
            item.product.ingredients.forEach((ingredient: any) => {
              if (ingredient.materialId) {
                const materialRef = doc(db, 'raw_materials', ingredient.materialId);
                const deductionQty = ingredient.quantity * item.quantity;
                batch.update(materialRef, {
                  stock: increment(-deductionQty)
                });

                // Log stock movement
                const material = rawMaterials.find(m => m.id === ingredient.materialId);
                const movementRef = doc(collection(db, 'stock_movements'));
                batch.set(movementRef, {
                  materialId: ingredient.materialId,
                  materialName: material?.name || 'مادة محذوفة',
                  type: 'out',
                  quantity: deductionQty,
                  unit: material?.unit || '',
                  date: new Date().toISOString(),
                  source: 'pos_sale',
                  note: `مبيعات نقطة البيع - منتج: ${item.product.name} (كمية: ${item.quantity})`
                });
              }
            });
          } else {
            // Find costing/recipe for this product as fallback
            const costing = costings.find(c => c.product === item.product.name);
            if (costing && costing.recipe && costing.recipe.length > 0) {
              const yieldQty = Math.max(1, costing.yieldQuantity || 1);
              costing.recipe.forEach((recipeItem: any) => {
                if (recipeItem.materialId) {
                  const materialRef = doc(db, 'raw_materials', recipeItem.materialId);
                  const deductionQty = (recipeItem.quantity / yieldQty) * item.quantity;
                  batch.update(materialRef, {
                    stock: increment(-deductionQty)
                  });

                  // Log stock movement
                  const material = rawMaterials.find(m => m.id === recipeItem.materialId);
                  const movementRef = doc(collection(db, 'stock_movements'));
                  batch.set(movementRef, {
                    materialId: recipeItem.materialId,
                    materialName: material?.name || 'مادة محذوفة',
                    type: 'out',
                    quantity: deductionQty,
                    unit: material?.unit || '',
                    date: new Date().toISOString(),
                    source: 'pos_sale',
                    note: `مبيعات نقطة البيع - منتج: ${item.product.name} (كمية: ${item.quantity})`
                  });
                }
              });
            }
          }
        }
      });

      // Execute batch without awaiting so it works offline immediately
      batch.commit().catch(error => {
        console.error("Batch commit error (might be offline):", error);
      });

      setLastOrderTotal(total);
      setLastOrder({ id: orderRef.id, ...orderData });
      setShowSuccessModal(true);
      clearCart();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'orders');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {validationError && (
        <div className="fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-in slide-in-from-top-2">
          {validationError}
        </div>
      )}
      {/* POS Header */}
      <header className="h-14 bg-surface border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/hub')}
            className="p-2 text-muted hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
            title="العودة للشاشة الرئيسية"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <button 
            onClick={handleLogout}
            className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
            title="تسجيل الخروج"
          >
            <LogOut className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsCartOpen(!isCartOpen)}
              className={`p-1.5 rounded-lg transition-colors relative ${isCartOpen ? 'bg-primary-600 text-white' : 'bg-surface-hover text-muted hover:text-foreground'}`}
              title={isCartOpen ? 'إخفاء السلة' : 'عرض السلة'}
            >
              <ShoppingCart className="w-4 h-4" />
              {!isCartOpen && items.length > 0 && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-surface"></span>
              )}
            </button>
            <h1 className="font-bold text-foreground hidden sm:block">نقطة البيع</h1>
          </div>
          <div className="mr-4 border-r border-border pr-4">
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              disabled={!!currentUserBranchId && !isAdmin}
              className="bg-input-bg border border-border text-foreground text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block w-full p-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {canViewAllBranches && <option value="all">جميع الفروع</option>}
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="text-sm font-medium text-muted hidden sm:block">
          {new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Products Section */}
        <div className={`flex-1 flex flex-col min-w-0 border-l border-border ${isCartOpen ? 'hidden lg:flex' : 'flex'}`}>
          {/* Top Bar: Search & Categories */}
          <div className="p-4 bg-surface border-b border-border flex flex-col gap-4 shadow-sm z-10">
            {/* Search */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="ابحث عن منتج أو امسح الباركود..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filteredProducts.length === 1) {
                    addItem(filteredProducts[0]);
                    setSearchQuery('');
                  }
                }}
                className="w-full pl-4 pr-10 py-3 bg-input-bg border border-border rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-foreground transition-all shadow-sm"
              />
            </div>
            {/* Categories */}
            <div className="flex gap-2 overflow-x-auto pos-scroll pb-1">
              <button
                onClick={() => setActiveCategory('all')}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                  activeCategory === 'all'
                    ? 'bg-primary-600 text-white shadow-md scale-105'
                    : 'bg-surface-hover text-foreground hover:bg-border'
                }`}
              >
                الكل
              </button>
              {categories.map(category => (
                <button
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  className={`px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                    activeCategory === category.id
                      ? 'bg-primary-600 text-white shadow-md scale-105'
                      : 'bg-surface-hover text-foreground hover:bg-border'
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 pos-scroll bg-background">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
            {filteredProducts.map(product => {
              const isAvailable = product.isAvailable !== false;
              const cartItem = items.find(item => item.product.id === product.id);
              return (
                <div
                  key={product.id}
                  className={`bg-surface rounded-2xl shadow-sm border border-border overflow-hidden transition-all duration-300 flex flex-col relative ${isAvailable ? 'hover:shadow-lg hover:-translate-y-1 hover:border-primary-300 group' : 'opacity-60 grayscale'}`}
                >
                  <button
                    onClick={() => isAvailable && !cartItem && addItem(product)}
                    disabled={!isAvailable}
                    className="w-full text-right flex-1 flex flex-col relative"
                  >
                    <div className="aspect-[4/3] relative overflow-hidden bg-surface-hover w-full">
                      {product.image ? (
                        <img 
                          src={product.image} 
                          alt={product.name}
                          className={`w-full h-full object-cover transition-transform duration-500 ${isAvailable ? 'group-hover:scale-110' : ''}`}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2 bg-gradient-to-br from-surface-hover to-border">
                          <Utensils className={`w-8 h-8 opacity-40 transition-transform duration-500 ${isAvailable ? 'group-hover:scale-110' : ''}`} />
                        </div>
                      )}
                      {isAvailable && <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>}
                      
                      {/* Price Tag */}
                      <div className="absolute top-3 left-3 bg-surface/95 backdrop-blur-md px-3 py-1.5 rounded-xl text-sm font-bold text-primary-600 shadow-sm border border-border flex items-center gap-1">
                        {formatCurrency(product.price)}
                      </div>

                      {/* Availability Toggle */}
                      {hasAvailabilityPermission && (
                        <div className="absolute top-3 right-3 z-10" onClick={(e) => e.stopPropagation()}>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="sr-only peer"
                              checked={isAvailable}
                              onChange={(e) => toggleProductAvailability(e, product, isAvailable)}
                            />
                            <div className="w-9 h-5 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-500"></div>
                          </label>
                        </div>
                      )}

                      {/* Add Icon Overlay */}
                      {isAvailable && !cartItem && (
                        <div className="absolute bottom-3 right-3 bg-primary-600 text-white p-2 rounded-full opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 shadow-lg">
                          <Plus className="w-5 h-5" />
                        </div>
                      )}
                      
                      {!isAvailable && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
                          <span className="bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold">غير متاح</span>
                        </div>
                      )}
                    </div>
                    
                    <div className={`p-4 flex-1 flex flex-col justify-start w-full ${cartItem ? 'pb-14' : ''}`}>
                      <h3 className="font-bold text-foreground line-clamp-2 leading-snug mb-1.5 group-hover:text-primary-600 transition-colors">
                        {product.name}
                      </h3>
                      <p className="text-xs font-medium text-muted-foreground bg-surface-hover inline-block px-2 py-1 rounded-md self-start">
                        {product.category || product.categoryId || 'بدون تصنيف'}
                      </p>
                    </div>
                  </button>

                  {/* +/- Controls overlay when in cart */}
                  {cartItem && isAvailable && (
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between bg-surface shadow-md rounded-xl p-1 border border-border z-20">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (cartItem.quantity > 1) {
                            updateQuantity(product.id, cartItem.quantity - 1);
                          } else {
                            removeItem(product.id);
                          }
                        }}
                        className="w-10 h-10 flex items-center justify-center bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg transition-colors"
                      >
                         {cartItem.quantity === 1 ? <Trash2 className="w-5 h-5" /> : <span className="text-xl font-bold leading-none">-</span>}
                      </button>
                      <span className="font-bold text-foreground text-lg mx-2">{cartItem.quantity}</span>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          updateQuantity(product.id, cartItem.quantity + 1);
                        }}
                        className="w-10 h-10 flex items-center justify-center bg-primary-500/10 text-primary-600 hover:bg-primary-500/20 rounded-lg transition-colors"
                      >
                         <Plus className="w-5 h-5 text-primary-600" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {filteredProducts.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground min-h-[400px]">
              <div className="w-24 h-24 bg-surface-hover rounded-full flex items-center justify-center mb-4">
                <Search className="w-10 h-10 text-muted" />
              </div>
              <p className="text-xl font-bold text-foreground mb-2">لم يتم العثور على منتجات</p>
              <p className="text-sm">جرب البحث بكلمات مختلفة أو اختر فئة أخرى</p>
            </div>
          )}
        </div>
      </div>

      {/* Cart Section */}
      <div className={`w-full lg:w-[400px] bg-surface flex flex-col shadow-[-4px_0_25px_-5px_rgba(0,0,0,0.1)] z-20 border-r border-border ${isCartOpen ? 'flex absolute top-14 bottom-0 left-0 right-0 lg:relative lg:top-auto lg:bottom-auto lg:left-auto lg:right-auto' : 'hidden'}`}>
        
        {/* Cart Header with Clear Button */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-surface">
          <h2 className="font-bold text-lg flex items-center gap-2 text-foreground">
            <ShoppingCart className="w-5 h-5 text-primary-600" />
            الطلب الحالي
            {items.length > 0 && (
              <span className="bg-primary-100 text-primary-700 text-xs px-2 py-0.5 rounded-full">
                {items.length}
              </span>
            )}
          </h2>
          {items.length > 0 && (
            <button 
              onClick={clearCart}
              className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors flex items-center gap-1 text-sm font-medium"
            >
              <Trash2 className="w-4 h-4" />
              إفراغ
            </button>
          )}
        </div>

        {/* Order Type Tabs */}
        <div className="p-3 bg-surface-hover border-b border-border">
          <div className="flex bg-input-bg p-1 rounded-xl border border-border">
            {[
              { id: 'dine_in', label: 'محلي', icon: Utensils },
              { id: 'takeaway', label: 'سفري', icon: ShoppingBag },
              { id: 'delivery', label: 'توصيل', icon: Truck },
            ].map((type) => (
              <button
                key={type.id}
                onClick={() => setOrderType(type.id as any)}
                className={`flex-1 flex items-center justify-center py-2 px-2 rounded-lg text-sm font-bold transition-all gap-2 ${
                  orderType === type.id
                    ? 'bg-surface text-primary-600 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
                }`}
              >
                <type.icon className="w-4 h-4" />
                {type.label}
              </button>
            ))}
          </div>
        </div>

        {/* Order Details Form */}
        <div className="p-4 border-b border-border space-y-3 bg-surface">
          {orderType === 'dine_in' && (
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1.5">رقم الطاولة</label>
              <input
                type="text"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                placeholder="مثال: 12"
                className="w-full px-3 py-2.5 bg-input-bg border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-foreground transition-all"
              />
            </div>
          )}
          {(orderType === 'takeaway' || orderType === 'delivery') && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1.5">اسم العميل</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="اسم العميل..."
                  className="w-full px-3 py-2.5 bg-input-bg border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-foreground transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1.5">رقم الجوال</label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="05xxxxxxxx"
                  className="w-full px-3 py-2.5 bg-input-bg border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-left text-foreground transition-all"
                  dir="ltr"
                />
              </div>
            </div>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 pos-scroll bg-surface-hover/30">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <div className="w-24 h-24 bg-surface-hover rounded-full flex items-center justify-center mb-4 border border-border">
                <ShoppingCart className="w-10 h-10 text-muted" />
              </div>
              <p className="font-bold text-foreground text-lg">السلة فارغة</p>
              <p className="text-sm mt-1">اختر منتجات لإضافتها للطلب</p>
            </div>
          ) : (
            items.map((item) => (
              <div key={item.product.id} className="flex gap-3 bg-surface p-3 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all relative group">
                <div className="w-20 h-20 rounded-xl overflow-hidden bg-surface-hover shrink-0 border border-border relative">
                  {item.product.image ? (
                    <img src={item.product.image} alt={item.product.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Utensils className="w-6 h-6 text-muted" />
                    </div>
                  )}
                </div>
                
                <div className="flex-1 flex flex-col justify-between py-0.5">
                  <div className="flex justify-between items-start pr-6">
                    <h4 className="font-bold text-sm text-foreground line-clamp-2 leading-snug">
                      {item.product.name}
                    </h4>
                    <button 
                      onClick={() => removeItem(item.product.id)}
                      className="absolute top-2 left-2 text-muted-foreground hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      title="إزالة المنتج"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between mt-2">
                    <span className="font-bold text-primary-600 text-sm">
                      {formatCurrency(item.product.price * item.quantity)}
                    </span>
                    
                    <div className="flex items-center gap-1 bg-input-bg rounded-lg border border-border p-1">
                      <button 
                        onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                        className="w-7 h-7 flex items-center justify-center bg-surface rounded-md shadow-sm text-foreground hover:text-primary-600 hover:bg-primary-50 transition-all active:scale-95"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm font-bold text-foreground">{item.quantity}</span>
                      <button 
                        onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                        className="w-7 h-7 flex items-center justify-center bg-surface rounded-md shadow-sm text-foreground hover:text-primary-600 hover:bg-primary-50 transition-all active:scale-95"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="mt-2">
                    <div className="relative">
                      <MessageSquare className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="إضافة ملاحظة..."
                        value={item.note || ''}
                        onChange={(e) => updateNote(item.product.id, e.target.value)}
                        className="w-full pl-2 pr-8 py-1.5 text-xs bg-input-bg border border-border rounded-lg focus:ring-1 focus:ring-primary-500 focus:border-transparent outline-none text-foreground transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Order Summary */}
        <div className="p-5 bg-surface border-t border-border space-y-4 pb-24 lg:pb-5 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)] z-10">
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>المجموع الفرعي</span>
              <span className="font-medium text-foreground">{formatCurrency(subtotal)}</span>
            </div>
            {orderType === 'delivery' && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>رسوم التوصيل</span>
                <span className="font-medium text-foreground">{formatCurrency(deliveryFee)}</span>
              </div>
            )}
            <div className="flex justify-between text-xl font-black text-foreground pt-3 border-t border-border">
              <span>الإجمالي</span>
              <span className="text-primary-600">{formatCurrency(total)}</span>
            </div>
          </div>

          <div className="pt-2">
            <label className="block text-xs font-bold text-muted-foreground mb-1.5">حساب الدفع</label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full px-3 py-2.5 bg-input-bg border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-foreground transition-all"
            >
              <option value="">اختر الحساب...</option>
              {financeAccounts
                .filter(account => selectedBranch === 'all' || !account.branchId || account.branchId === selectedBranch)
                .map(account => (
                <option key={account.id} value={account.id}>{account.name} ({account.type === 'bank' ? 'بنك' : 'خزينة'})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => handleCheckout('cash')}
              disabled={items.length === 0}
              className="flex flex-col items-center justify-center gap-1.5 py-3 bg-primary-600/10 border-2 border-primary-500/20 rounded-xl text-primary-600 hover:bg-primary-600 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <Banknote className="w-6 h-6 transition-colors" />
              <span className="text-sm font-bold">دفع نقدي</span>
            </button>
            <button
              onClick={() => handleCheckout('card')}
              disabled={items.length === 0}
              className="flex flex-col items-center justify-center gap-1.5 py-3 bg-surface border-2 border-border rounded-xl text-foreground hover:bg-surface-hover hover:border-primary-500 hover:text-primary-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <CreditCard className="w-6 h-6 text-muted-foreground group-hover:text-primary-600 transition-colors" />
              <span className="text-sm font-bold">بطاقة مصرفية</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Cart Toggle Button */}
      <div className="lg:hidden fixed bottom-4 left-4 right-4 z-20">
        <button
          onClick={() => setIsCartOpen(!isCartOpen)}
          className="w-full bg-primary-600 text-white rounded-xl py-4 font-bold shadow-lg flex items-center justify-center gap-2"
        >
          <ShoppingCart className="w-5 h-5" />
          <span>{isCartOpen ? 'العودة للمنتجات' : 'عرض السلة'}</span>
          {!isCartOpen && items.length > 0 && (
            <span className="bg-white text-primary-600 px-2 py-0.5 rounded-full text-xs ml-2">
              {items.length}
            </span>
          )}
        </button>
      </div>
      </div>

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-3xl w-full max-w-sm flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 border border-border">
            <div className="p-8 flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mb-6 ring-8 ring-emerald-500/5">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-black text-foreground mb-2">تم إصدار الفاتورة!</h3>
              <p className="text-muted-foreground mb-6">تم إرسال الطلب إلى المطبخ بنجاح.</p>
              <div className="bg-surface-hover rounded-2xl p-5 w-full mb-8 border border-border">
                <p className="text-sm text-muted-foreground mb-1 font-medium">إجمالي الفاتورة</p>
                <p className="text-3xl font-black text-primary-600">{formatCurrency(lastOrderTotal)}</p>
              </div>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => lastOrder && printInvoice(lastOrder, storeSettings, invoiceSettings)}
                  className="flex-1 py-4 bg-surface border-2 border-border hover:bg-surface-hover text-foreground rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2"
                >
                  <Printer className="w-5 h-5" />
                  طباعة
                </button>
                <button
                  onClick={() => setShowSuccessModal(false)}
                  className="flex-1 py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold text-lg transition-all shadow-md hover:shadow-lg"
                >
                  طلب جديد
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Product Toggle Confirm Modal */}
      {showProductToggleConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => e.stopPropagation()}>
          <div className="bg-surface border border-border rounded-xl w-full max-w-sm flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-primary-500/20 text-primary-500 rounded-full flex items-center justify-center mb-4">
                 <Utensils className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">تأكيد الإجراء</h3>
              <p className="text-muted mb-6">
                هل أنت متأكد من تغيير حالة المنتج "{showProductToggleConfirm.name}" إلى {showProductToggleConfirm.currentStatus ? 'غير متاح' : 'متاح'}؟
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setShowProductToggleConfirm(null)}
                  className="flex-1 py-3 bg-surface-hover hover:bg-slate-700 text-foreground rounded-xl font-bold transition-colors"
                >
                  إلغاء
                </button>
                <button
                  onClick={executeToggleAvailability}
                  className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold transition-colors"
                >
                  تأكيد
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
