import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ShoppingBag, ArrowRight, Plus, Minus, X, User, Phone, MapPin, AlertCircle, Clock, CheckCircle, Trash2, MessageSquare, LogOut, Truck, Utensils, ChevronDown, Star, Navigation, Check, Home } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { useFormatCurrency } from '../hooks/useFormatCurrency';
import { db, auth } from '../firebase';
import { collection, onSnapshot, addDoc, serverTimestamp, writeBatch, doc, increment, query, where } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';

interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  status: string;
  branchId?: string;
  isAvailable?: boolean;
}

interface CartItem {
  product: Product;
  quantity: number;
  note?: string;
}

interface Order {
  id: string;
  orderId?: string;
  branchName?: string;
  items: any[];
  total: number;
  status: string;
  createdAt: any;
  updatedAt?: any;
  location?: { lat: number, lng: number };
  driverName?: string;
  driverPhone?: string;
}

export default function Customer() {
  const { storeSettings, invoiceSettings } = useSettings();
  const formatCurrency = useFormatCurrency();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{id: string, name: string, kitchenId?: string}[]>([]);
  const [branches, setBranches] = useState<{id: string, name: string, status: string}[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<{id: string, name: string} | null>(null);

  const [customerInfo, setCustomerInfo] = useState({
    name: '',
    phone: '',
    address: ''
  });
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [showMap, setShowMap] = useState(false);
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [myOrders, setMyOrders] = useState<Record<string, Order>>({});
  const [isMyOrdersOpen, setIsMyOrdersOpen] = useState(false);
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setCustomerInfo(prev => ({
          ...prev,
          name: currentUser.displayName || '',
          phone: currentUser.phoneNumber || ''
        }));
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        // User closed the popup, no need to show an error
        return;
      }
      console.error("Error signing in with Google:", error);
      setValidationError('حدث خطأ أثناء تسجيل الدخول: ' + (error.message || ''));
      setTimeout(() => setValidationError(null), 3000);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth).catch(e => console.error("Sign out error:", e));
      setCart([]);
      setMyOrders({});
      setSelectedBranch(null);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  useEffect(() => {
    if (!user) {
      setMyOrders({});
      return;
    }

    const q = query(collection(db, 'orders'), where('customerId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData: Record<string, Order> = {};
      snapshot.docs.forEach(doc => {
        ordersData[doc.id] = { id: doc.id, ...doc.data() } as Order;
      });
      setMyOrders(ordersData);
    }, (error) => {
      console.error("Error fetching my orders:", error);
    });

    return () => unsubscribe();
  }, [user]);

  const [costings, setCostings] = useState<any[]>([]);
  const [rawMaterials, setRawMaterials] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      const productsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Product[];
      setProducts(productsData);
    }, (error) => {
      console.error("Error fetching products:", error);
    });

    const unsubscribeCategories = onSnapshot(collection(db, 'product_categories'), (snapshot) => {
      const categoriesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as {id: string, name: string, kitchenId?: string}[];
      setCategories(categoriesData);
    }, (error) => {
      console.error("Error fetching categories:", error);
    });

    const unsubscribeBranches = onSnapshot(collection(db, 'branches'), (snapshot) => {
      const branchesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as {id: string, name: string, status: string}[];
      setBranches(branchesData.filter(b => b.status === 'نشط'));
    }, (error) => {
      console.error("Error fetching branches:", error);
    });

    const unsubscribeCostings = onSnapshot(collection(db, 'costings'), (snapshot) => {
      const costingsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCostings(costingsData);
    }, (error) => {
      console.error("Error fetching costings:", error);
    });

    const unsubscribeMaterials = onSnapshot(collection(db, 'raw_materials'), (snapshot) => {
      const materialsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRawMaterials(materialsData);
    }, (error) => {
      console.error("Error fetching raw materials:", error);
    });

    return () => {
      unsubscribe();
      unsubscribeCategories();
      unsubscribeBranches();
      unsubscribeCostings();
      unsubscribeMaterials();
    };
  }, [user]);

  const handleGetLocation = () => {
    setIsLocating(true);
    setLocationError('');
    setShowMap(true);

    if (!navigator.geolocation) {
      setLocationError('متصفحك لا يدعم تحديد الموقع');
      setIsLocating(false);
      return;
    }

    const successCallback = (position: GeolocationPosition) => {
      setLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude
      });
      setCustomerInfo(prev => ({
        ...prev,
        address: 'تم تحديد الموقع عبر GPS'
      }));
      setIsLocating(false);
    };

    const errorCallback = (error: GeolocationPositionError) => {
      console.error("Error getting location:", error);
      // Fallback: try without high accuracy if it's a timeout or other error
      if (error.code === error.TIMEOUT || error.code === error.POSITION_UNAVAILABLE) {
        navigator.geolocation.getCurrentPosition(
          successCallback,
          (fallbackError) => {
            console.error("Fallback error getting location:", fallbackError);
            let errorMessage = 'تعذر الحصول على الموقع، يرجى التأكد من تفعيل الـ GPS ومنح الصلاحية';
            if (fallbackError.code === fallbackError.PERMISSION_DENIED) {
              errorMessage = 'تم رفض صلاحية الوصول للموقع. يرجى تفعيلها من إعدادات المتصفح.';
            }
            setLocationError(errorMessage);
            setIsLocating(false);
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
        );
      } else {
        let errorMessage = 'تعذر تحديد الموقع الجغرافي';
        if (error.code === error.PERMISSION_DENIED) {
          errorMessage = 'تم رفض صلاحية الوصول للموقع. يرجى تفعيلها من إعدادات المتصفح.';
        }
        setLocationError(errorMessage);
        setIsLocating(false);
      }
    };

    // First try with high accuracy
    navigator.geolocation.getCurrentPosition(
      successCallback,
      errorCallback,
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  const filteredProducts = products.filter(product => {
    const matchesCategory = activeCategory === 'all' || product.category === activeCategory;
    const matchesSearch = product.name?.toLowerCase().includes(searchQuery.toLowerCase()) || false;
    const matchesBranch = !product.branchId || product.branchId === selectedBranch?.id;
    const isAvailable = product.isAvailable !== false;
    return matchesCategory && matchesSearch && matchesBranch && isAvailable && (product.status === 'متوفر' || product.stock > 0);
  });

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        const newQuantity = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQuantity };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const updateNote = (productId: string, note: string) => {
    setCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        return { ...item, note };
      }
      return item;
    }));
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const deliveryFee = storeSettings?.deliveryFee || 0;
  const total = subtotal + deliveryFee;

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleSubmitOrder = async () => {
    if (!customerInfo.name || !customerInfo.phone || !customerInfo.address) {
      setValidationError('الرجاء إدخال جميع معلومات التوصيل (الاسم، الجوال، العنوان) لإتمام الطلب');
      setTimeout(() => setValidationError(null), 4000);
      return;
    }
    if (!location) {
      setValidationError('الرجاء تحديد موقعك الحالي عبر الـ GPS أولاً لضمان دقة التوصيل');
      setTimeout(() => setValidationError(null), 4000);
      return;
    }
    
    setValidationError(null);
    setIsSubmitting(true);

    try {
      const orderId = `ORD-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
      
      const batch = writeBatch(db);
      
      const orderRef = doc(collection(db, 'orders'));
      const orderData = {
        orderId,
        type: 'توصيل',
        orderType: 'delivery',
        branchId: selectedBranch?.id || '',
        branchName: selectedBranch?.name || '',
        customerId: user?.uid || '',
        customerEmail: user?.email || '',
        customer: customerInfo.name,
        customerName: customerInfo.name,
        customerPhone: customerInfo.phone,
        customerAddress: customerInfo.address,
        deliveryAddress: customerInfo.address,
        location: location,
        paymentMethod: paymentMethod,
        status: 'new',
        items: cart.map(item => ({
          id: item.product.id,
          name: item.product.name,
          price: item.product.price,
          quantity: item.quantity,
          notes: item.note || ''
        })),
        subtotal,
        deliveryFee,
        total,
        createdAt: new Date().toISOString()
      };

      // Save to orders collection
      batch.set(orderRef, orderData);
      
      // Save to kitchen_orders collection
      const kitchenOrderRef = doc(collection(db, 'kitchen_orders'));
      batch.set(kitchenOrderRef, {
        orderId,
        orderRefId: orderRef.id,
        branchId: selectedBranch?.id || '',
        branchName: selectedBranch?.name || '',
        source: 'customer',
        type: 'توصيل',
        customer: customerInfo.name,
        status: 'new',
        time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
        createdAt: new Date().toISOString(),
        items: cart.map(item => {
          const productCategory = item.product.category || (item.product as any).categoryId;
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
      cart.forEach(item => {
        if (item.product.id) {
          const productRef = doc(db, 'products', item.product.id);
          batch.update(productRef, {
            stock: increment(-item.quantity)
          });

          // Deduct raw materials from product ingredients
          const productWithIngredients = item.product as any;
          if (productWithIngredients.ingredients && productWithIngredients.ingredients.length > 0) {
            productWithIngredients.ingredients.forEach((ingredient: any) => {
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
                  source: 'customer_order',
                  note: `طلب زبون - منتج: ${item.product.name} (كمية: ${item.quantity})`
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
                    source: 'customer_order',
                    note: `طلب زبون - منتج: ${item.product.name} (كمية: ${item.quantity})`
                  });
                }
              });
            }
          }
        }
      });

      await batch.commit();

      setCart([]);
      setCustomerInfo({ name: '', phone: '', address: '' });
      setShowMap(false);
      setLocation(null);
      setIsCartOpen(false);
      
      const successMsg = document.createElement('div');
      successMsg.className = 'fixed top-4 right-4 bg-emerald-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-in slide-in-from-top-2';
      successMsg.textContent = 'تم إرسال الطلب بنجاح!';
      document.body.appendChild(successMsg);
      setTimeout(() => {
        successMsg.remove();
      }, 3000);
    } catch (error) {
      console.error("Error submitting order:", error);
      setValidationError('حدث خطأ أثناء إرسال الطلب. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const [viewMode, setViewMode] = useState<'landing' | 'login'>('landing');

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!user) {
    if (viewMode === 'landing') {
      return (
        <div className="min-h-screen flex flex-col relative overflow-hidden font-sans" dir="rtl">
          {/* Top primary glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[100px] bg-primary-500/20 blur-[100px] rounded-full pointer-events-none"></div>

          {/* Background Image with Overlay */}
          <div className="absolute inset-0 z-0 bg-[#050505]">
            <img 
              src="https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=1934&auto=format&fit=crop" 
              alt="Restaurant Background" 
              className="w-full h-full object-cover opacity-30"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/80 to-transparent"></div>
            <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-transparent to-[#050505]"></div>
          </div>

          <header className="px-6 py-6 flex justify-start relative z-10 w-full max-w-sm mx-auto">
            <button onClick={() => navigate('/login')} className="text-primary-500 font-bold text-lg cursor-pointer hover:text-primary-400 transition-colors flex items-center gap-2">
              دخول الموظفين
              <ArrowRight className="w-5 h-5 rotate-180" />
            </button>
          </header>

          <main className="flex-1 flex flex-col items-center justify-center px-6 relative z-10 w-full max-w-sm mx-auto">
            <div className="mb-8 relative auto-fade-in-up">
              {invoiceSettings?.logoUrl ? (
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-white mb-6 shadow-2xl p-2 overflow-hidden border-2 border-primary-500">
                  <img src={invoiceSettings.logoUrl} alt={storeSettings?.nameAr || 'Logo'} className="w-full h-full object-contain" />
                </div>
              ) : (
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 mb-6 shadow-2xl">
                  <span className="text-primary-500 font-bold text-xl">{storeSettings?.nameAr || 'المطعم'}</span>
                </div>
              )}
            </div>

            <div className="text-center mb-12 auto-fade-in-up delay-100">
              <h1 className="text-4xl font-bold text-white mb-3 tracking-tight drop-shadow-sm">مرحباً بك</h1>
              <p className="text-lg text-gray-400">{storeSettings?.nameAr || 'مطعم الكناري'}</p>
            </div>

            <button
              onClick={() => setViewMode('login')}
              className="w-full bg-primary-600 rounded-3xl p-8 relative overflow-hidden flex items-center justify-between group hover:scale-[1.02] shadow-lg hover:shadow-2xl hover:-translate-y-1 shadow-primary-500/20 hover:shadow-primary-500/40 transition-all duration-300 auto-fade-in-up delay-200"
            >
              {/* Left Arrow */}
              <div className="text-white/80 group-hover:-translate-x-2 transition-transform duration-300 relative z-10">
                <ArrowRight className="w-8 h-8 rotate-180" />
              </div>

              {/* Center Text */}
              <div className="text-right flex-1 pr-6 relative z-10">
                <div className="text-3xl font-bold text-white mb-2">الدخول</div>
                <div className="text-3xl font-bold text-white mb-4">كزبون</div>
                <div className="text-sm text-white/90 font-medium leading-relaxed opacity-90">
                  تصفح<br />
                  القائمة<br />
                  واطلب<br />
                  مباشرة
                </div>
              </div>

              {/* Right Icon Area */}
              <div className="relative z-10 shrink-0 self-start">
                 <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/10 shadow-inner">
                   <User className="w-8 h-8 text-white" />
                 </div>
              </div>
              
              {/* Background Glow inside button */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-2xl rounded-full translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
            </button>
          </main>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex flex-col relative overflow-hidden font-sans" dir="rtl">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0 bg-[#050505]">
          <img 
            src="https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=1934&auto=format&fit=crop" 
            alt="Restaurant Background" 
            className="w-full h-full object-cover opacity-30"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/80 to-transparent"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-transparent to-[#050505]"></div>
        </div>

        <header className="h-16 flex items-center justify-end px-4 sticky top-0 z-20 mt-4 relative w-full max-w-sm mx-auto">
           <span className="text-white font-medium text-sm ml-2">عند الدخول كزبون</span>
           <button onClick={() => setViewMode('landing')} className="p-2 text-gray-400 hover:text-white rounded-lg transition-colors">
             <ArrowRight className="w-5 h-5" />
           </button>
        </header>

        <main className="flex-1 p-6 max-w-sm mx-auto w-full flex flex-col justify-center items-center relative z-10 -mt-20">
          <div className="text-center mb-10 w-full">
            <div className="w-24 h-24 bg-[#022c22] text-[#10b981] rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner border border-[#064e3b]/50">
              <User className="w-12 h-12" />
            </div>
            <h2 className="text-3xl font-bold mb-4 text-white">مرحباً بك في تطبيق الطلبات</h2>
            <p className="text-gray-400 font-medium text-base px-2">
              الرجاء تسجيل الدخول للمتابعة وطلب وجباتك المفضلة
            </p>
          </div>
          
          {validationError && (
            <div className="w-full bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded-xl text-sm text-center mb-4">
              {validationError}
            </div>
          )}

          <div className="w-full flex flex-col gap-3">
            <button
              onClick={handleLogin}
              className="w-full bg-white text-gray-900 hover:bg-gray-50 p-4 rounded-2xl flex items-center justify-center gap-4 transition-all hover:shadow-lg font-bold text-lg mb-6 shadow-sm border border-black/5"
            >
              <div className="w-7 h-7 shrink-0 flex items-center justify-center bg-white rounded-full">
                 <svg className="w-5 h-5" viewBox="0 0 24 24">
                   <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                   <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                   <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                   <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                 </svg>
              </div>
              المتابعة باستخدام Google
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!selectedBranch) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col font-sans" dir="rtl">
        <header className="h-16 bg-surface border-b border-border flex items-center justify-between px-4 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <h1 className="font-bold text-lg">اختيار الفرع</h1>
          </div>
          <button onClick={handleLogout} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-2 text-sm font-bold">
            تسجيل الخروج
            <LogOut className="w-4 h-4" />
          </button>
        </header>
        <main className="flex-1 p-4 max-w-md mx-auto w-full flex flex-col justify-center">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-[#10b981]/20 text-[#10b981] rounded-full flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold mb-2">مرحباً بك</h2>
            <p className="text-muted-foreground">الرجاء اختيار الفرع الأقرب إليك للبدء في الطلب</p>
          </div>
          
          <div className="space-y-3">
            {branches.map(branch => (
              <button
                key={branch.id}
                onClick={() => setSelectedBranch({ id: branch.id, name: branch.name })}
                className="w-full bg-surface border border-border hover:border-[#10b981] p-4 rounded-xl flex items-center justify-between transition-all hover:shadow-lg hover:shadow-[#10b981]/10 group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-background rounded-lg flex items-center justify-center group-hover:bg-[#10b981]/10 transition-colors">
                    <MapPin className="w-5 h-5 text-muted-foreground group-hover:text-[#10b981] transition-colors" />
                  </div>
                  <div className="text-right">
                    <h3 className="font-bold text-foreground">{branch.name}</h3>
                    <p className="text-xs text-muted-foreground">مفتوح الآن</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-[#10b981] rotate-180 transition-colors" />
              </button>
            ))}
            {branches.length === 0 && (
              <div className="text-center p-8 bg-surface rounded-xl border border-border">
                <p className="text-muted-foreground">لا توجد فروع متاحة حالياً</p>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans" dir="rtl">
      {/* Header */}
      <header className="h-16 bg-surface border-b border-border flex items-center justify-between px-4 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedBranch(null)} className="p-2 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors">
            <ArrowRight className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="bg-[#10b981] text-foreground p-1.5 rounded-lg">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h1 className="font-bold text-sm">قائمة الطعام</h1>
              <p className="text-[10px] text-muted">{selectedBranch.name}</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsMyOrdersOpen(true)}
            className="p-2 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors flex items-center gap-2 relative"
          >
            <Clock className="w-5 h-5" />
            {Object.keys(myOrders).length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full"></span>
            )}
          </button>
          <button 
            onClick={() => setIsCartOpen(true)}
            className="relative p-2 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors flex items-center gap-2"
          >
            <ShoppingBag className="w-5 h-5" />
            {totalItems > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-primary-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full">
                {totalItems}
              </span>
            )}
          </button>
          <button 
            onClick={handleLogout}
            className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
            title="تسجيل الخروج"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 max-w-5xl mx-auto w-full">
        {/* Welcome Banner */}
        <div className="bg-[#10b981] rounded-xl p-4 mb-6 flex items-center justify-between relative overflow-hidden shadow-lg shadow-emerald-500/20">
          <div className="relative z-10">
            <h2 className="text-lg font-bold text-foreground mb-1 flex items-center gap-2">
              <span>مرحباً بك!</span>
              <span>👋</span>
            </h2>
            <p className="text-emerald-50 text-xs">
              اختر أطباقك المفضلة وأرسل طلبك — لا حاجة لتسجيل الدخول
            </p>
          </div>
          <div className="text-4xl opacity-50 relative z-10">🍕</div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <input
            type="text"
            placeholder="ابحث عن طبقك المفضل..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface border border-border rounded-xl pl-4 pr-10 py-3 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
          />
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto pb-4 mb-2 no-scrollbar">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
              activeCategory === 'all'
                ? 'bg-[#10b981] text-foreground'
                : 'bg-surface text-muted hover:bg-surface-hover hover:text-foreground border border-border'
            }`}
          >
            الكل
          </button>
          {categories.map(category => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                activeCategory === category.id
                  ? 'bg-[#10b981] text-foreground'
                  : 'bg-surface text-muted hover:bg-surface-hover hover:text-foreground border border-border'
              }`}
            >
              {category.name}
            </button>
          ))}
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map(product => {
            const cartItem = cart.find(item => item.product.id === product.id);
            return (
            <div key={product.id} className="bg-surface border border-border rounded-2xl overflow-hidden flex flex-col">
              <div className="h-32 bg-surface-hover/50 flex items-center justify-center text-5xl">
                {product.name?.includes('برجر') ? '🍔' : 
                 product.name?.includes('بيتزا') ? '🍕' : 
                 product.name?.includes('شاورما') ? '🌯' : 
                 product.name?.includes('عصير') || product.name?.includes('كولا') ? '🥤' : 
                 product.name?.includes('سلطة') ? '🥗' : '🍟'}
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-bold text-sm text-foreground">{product.name}</h3>
                    <span className="text-xs text-yellow-500 flex items-center gap-1">
                      ★ 4.8
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-3">{product.category}</p>
                </div>
                <div className="flex items-center justify-between mt-auto">
                  <span className="font-bold text-primary-400 text-sm">{formatCurrency(product.price)}</span>
                  
                  {cartItem ? (
                    <div className="flex items-center gap-3 bg-surface-hover rounded-lg p-1 border border-border" onClick={(e) => e.stopPropagation()}>
                      <button 
                        onClick={() => updateQuantity(product.id, -1)}
                        className="w-7 h-7 flex items-center justify-center bg-red-500/10 text-red-500 rounded-md transition-colors hover:bg-red-500/20"
                      >
                         {cartItem.quantity === 1 ? <Trash2 className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                      </button>
                      <span className="font-bold text-foreground text-sm min-w-[1ch] text-center">{cartItem.quantity}</span>
                      <button 
                        onClick={() => updateQuantity(product.id, 1)}
                        className="w-7 h-7 flex items-center justify-center bg-primary-500/10 text-primary-500 rounded-md transition-colors hover:bg-primary-500/20"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => addToCart(product)}
                      className="bg-[#10b981] hover:bg-[#059669] text-foreground px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                    >
                      <span>أضف</span>
                      <Plus className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      </main>

      {/* Cart Sidebar Overlay */}
      {isCartOpen && (
        <div className="fixed inset-0 bg-black/60 z-30 flex justify-start" onClick={() => setIsCartOpen(false)}>
          <div 
            className="w-full max-w-sm bg-background h-full flex flex-col border-r border-border shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="h-16 border-b border-border flex items-center justify-between px-4 bg-surface">
              <div className="flex items-center gap-2 text-[#10b981]">
                <ShoppingBag className="w-5 h-5" />
                <h2 className="font-bold text-sm text-foreground">سلة الطلبات</h2>
                <span className="bg-surface-hover text-muted-foreground text-[10px] px-2 py-0.5 rounded-full">{totalItems}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setCart([])} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
                <button onClick={() => setIsCartOpen(false)} className="p-2 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-3">
                  <ShoppingBag className="w-12 h-12 opacity-20" />
                  <p className="text-sm">السلة فارغة</p>
                </div>
              ) : (
                cart.map(item => (
                  <div key={item.product.id} className="bg-surface border border-border rounded-xl p-3 flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-surface-hover/50 rounded-lg flex items-center justify-center text-2xl">
                        {item.product.name?.includes('برجر') ? '🍔' : 
                         item.product.name?.includes('بيتزا') ? '🍕' : 
                         item.product.name?.includes('شاورما') ? '🌯' : 
                         item.product.name?.includes('عصير') || item.product.name?.includes('كولا') ? '🥤' : 
                         item.product.name?.includes('سلطة') ? '🥗' : '🍟'}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-xs font-bold text-foreground mb-1">{item.product.name}</h4>
                        <p className="text-[10px] text-[#10b981] font-bold">{formatCurrency(item.product.price)}</p>
                      </div>
                      <div className="flex items-center gap-2 bg-background rounded-lg p-1 border border-border">
                        <button onClick={() => updateQuantity(item.product.id, 1)} className="w-6 h-6 flex items-center justify-center text-[#10b981] hover:bg-surface-hover rounded">
                          <Plus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.product.id, -1)} className="w-6 h-6 flex items-center justify-center text-red-400 hover:bg-surface-hover rounded">
                          <Minus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="relative mt-1">
                      <MessageSquare className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="إضافة ملاحظة (اختياري)..."
                        value={item.note || ''}
                        onChange={(e) => updateNote(item.product.id, e.target.value)}
                        className="w-full pl-2 pr-7 py-1.5 text-[10px] border border-border rounded-lg focus:ring-1 focus:ring-[#10b981] focus:border-transparent outline-none bg-background text-foreground placeholder-slate-500"
                      />
                    </div>
                  </div>
                ))
              )}

              {cart.length > 0 && (
                <div className="mt-6 space-y-3 pt-4 border-t border-border">
                  <h3 className="text-xs font-bold text-muted mb-2">معلومات التوصيل</h3>
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="الاسم" 
                      value={customerInfo.name}
                      onChange={(e) => setCustomerInfo({...customerInfo, name: e.target.value})}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:border-[#10b981] pr-9" 
                    />
                    <User className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="relative">
                    <input 
                      type="tel" 
                      placeholder="رقم الهاتف" 
                      value={customerInfo.phone}
                      onChange={(e) => setCustomerInfo({...customerInfo, phone: e.target.value})}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:border-[#10b981] pr-9" 
                    />
                    <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="العنوان" 
                      value={customerInfo.address}
                      onChange={(e) => setCustomerInfo({...customerInfo, address: e.target.value})}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:border-[#10b981] pr-9" 
                    />
                    <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  
                  <button 
                    onClick={handleGetLocation}
                    disabled={isLocating}
                    className="w-full bg-surface-hover hover:bg-slate-700 text-foreground rounded-lg py-2 text-xs font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{isLocating ? 'جاري تحديد الموقع...' : 'تحديد موقعي الحالي (GPS)'}</span>
                  </button>

                  {locationError && (
                    <p className="text-xs text-red-400 mt-1">{locationError}</p>
                  )}

                  {showMap && (
                    <div className="w-full h-48 bg-surface-hover rounded-lg overflow-hidden relative">
                      {/* Placeholder for Google Maps */}
                      <iframe 
                        src={location ? `https://maps.google.com/maps?q=${location.lat},${location.lng}&z=15&output=embed` : "https://maps.google.com/maps?q=Riyadh,Saudi+Arabia&z=12&output=embed"} 
                        width="100%" 
                        height="100%" 
                        style={{ border: 0 }} 
                        allowFullScreen={false} 
                        loading="lazy" 
                        referrerPolicy="no-referrer-when-downgrade"
                        title="Google Maps"
                      ></iframe>
                      <div className="absolute inset-0 pointer-events-none border-2 border-[#10b981] rounded-lg opacity-50"></div>
                    </div>
                  )}

                  {/* Payment Methods */}
                  <div className="pt-3 border-t border-border">
                    <h3 className="text-xs font-bold text-foreground mb-2">طريقة الدفع</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <label className={`flex items-center gap-2 bg-background border rounded-lg p-2 cursor-pointer transition-colors ${paymentMethod === 'cash' ? 'border-[#10b981]' : 'border-border hover:border-[#10b981]'}`}>
                        <input type="radio" name="payment" value="cash" checked={paymentMethod === 'cash'} onChange={(e) => setPaymentMethod(e.target.value)} className="text-[#10b981] focus:ring-[#10b981] bg-surface border-border" />
                        <span className="text-xs text-foreground">الدفع عند الاستلام</span>
                      </label>
                      <label className={`flex items-center gap-2 bg-background border rounded-lg p-2 cursor-pointer transition-colors ${paymentMethod === 'card' ? 'border-[#10b981]' : 'border-border hover:border-[#10b981]'}`}>
                        <input type="radio" name="payment" value="card" checked={paymentMethod === 'card'} onChange={(e) => setPaymentMethod(e.target.value)} className="text-[#10b981] focus:ring-[#10b981] bg-surface border-border" />
                        <span className="text-xs text-foreground">بطاقة ائتمانية</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="p-4 bg-surface border-t border-border space-y-3">
                <div className="flex justify-between text-xs text-muted">
                  <span>المجموع</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted">
                  <span>رسوم التوصيل</span>
                  <span>{formatCurrency(deliveryFee)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-foreground pt-2 border-t border-border">
                  <span>الإجمالي</span>
                  <span className="text-[#10b981]">{formatCurrency(total)}</span>
                </div>

                {validationError && (
                  <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 flex items-start gap-2 mt-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-400 leading-relaxed">{validationError}</p>
                  </div>
                )}

                <button 
                  onClick={handleSubmitOrder}
                  disabled={isSubmitting}
                  className="w-full bg-[#10b981] hover:bg-[#059669] text-foreground rounded-xl py-3 text-sm font-bold transition-colors flex items-center justify-center gap-2 mt-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>{isSubmitting ? 'جاري الإرسال...' : 'إرسال الطلب'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* My Orders Modal */}
      {isMyOrdersOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-0">
          <div className="bg-surface w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border border-border">
            <div className="p-4 border-b border-border flex justify-between items-center bg-background">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#10b981]" />
                <h2 className="font-bold text-sm text-foreground">طلباتي</h2>
              </div>
              <button onClick={() => setIsMyOrdersOpen(false)} className="p-2 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
              {(Object.values(myOrders) as Order[]).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-muted">
                  <ShoppingBag className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm">لا توجد طلبات سابقة</p>
                </div>
              ) : (
                (Object.values(myOrders) as Order[]).sort((a, b) => {
                  const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                  const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                  return timeB - timeA;
                }).map(order => (
                  <div key={order.id} className="bg-background border border-border rounded-xl p-4">
                    <div className="flex justify-between items-start mb-3 pb-3 border-b border-border">
                      <div>
                        <div className="text-xs text-muted mb-1">رقم الطلب</div>
                        <div className="font-bold text-foreground text-sm">{order.orderId || order.id.substring(0, 8)}</div>
                        {order.branchName && (
                          <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {order.branchName}
                          </div>
                        )}
                      </div>
                      <div className="text-left">
                        <div className="text-xs text-muted mb-1">الحالة</div>
                        <div className={`text-xs font-bold px-2 py-1 rounded-full inline-block ${
                          order.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' :
                          order.status === 'out_for_delivery' ? 'bg-teal-500/10 text-teal-500' :
                          order.status === 'ready' ? 'bg-blue-500/10 text-blue-500' :
                          order.status === 'preparing' ? 'bg-amber-500/10 text-amber-500' :
                          'bg-slate-500/10 text-muted'
                        }`}>
                          {order.status === 'completed' ? 'مكتمل' :
                           order.status === 'out_for_delivery' ? 'جاري التوصيل' :
                           order.status === 'ready' ? 'جاهز' :
                           order.status === 'preparing' ? 'قيد التحضير' : 'جديد'}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2 mb-3">
                      {order.items?.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{item.quantity}x {item.name}</span>
                          <span className="text-muted">{formatCurrency(item.price * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                    {order.driverName && order.status === 'out_for_delivery' && (
                      <div className="bg-surface-hover/50 rounded-lg p-3 mb-3 border border-border">
                        <div className="flex items-center gap-2 mb-1">
                          <Truck className="w-4 h-4 text-teal-500" />
                          <span className="text-xs font-bold text-foreground">مندوب التوصيل</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">{order.driverName}</span>
                          {order.driverPhone && (
                            <a href={`tel:${order.driverPhone}`} className="text-[#10b981] flex items-center gap-1 font-bold">
                              <Phone className="w-3 h-3" />
                              اتصال
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-3 border-t border-border">
                      <span className="text-xs text-muted">الإجمالي</span>
                      <span className="font-bold text-[#10b981] text-sm">{formatCurrency(order.total)}</span>
                    </div>
                    <button
                      onClick={() => { setIsMyOrdersOpen(false); setTrackingOrderId(order.id); }}
                      className="w-full mt-3 bg-[#10b981]/10 hover:bg-[#10b981]/20 text-[#10b981] py-2 rounded-lg text-sm font-bold transition-colors"
                    >
                      تتبع الطلب
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tracking Modal */}
      {trackingOrderId && myOrders[trackingOrderId] && (
        <div className="fixed inset-0 z-[60] bg-background flex flex-col font-sans" dir="rtl">
          {(() => {
            const order = myOrders[trackingOrderId];
            const isCompleted = order.status === 'completed';
            const isOutForDelivery = order.status === 'out_for_delivery';
            const isPreparing = order.status === 'preparing' || order.status === 'ready';
            const isNew = order.status === 'new';

            let statusColor = 'bg-primary-500';
            let statusTitle = 'طـلـبـك';
            let statusDesc = 'قيد المراجعة';
            let statusTimeOrDesc = 'سيتم التنفيذ قريباً';
            let statusTimeTitle = 'الوقت المتوقع';
            let currentStep = 0;

            if (isNew) {
              statusTitle = 'طلبك جديد';
              statusDesc = 'في انتظار التأكيد';
              currentStep = 0;
            } else if (isPreparing) {
              statusTitle = 'طلبك قيد التحضير';
              statusDesc = 'جاري التجهيز...';
              statusTimeOrDesc = '25-35 دقيقة';
              statusTimeTitle = 'الوقت المتوقع';
              currentStep = 1;
            } else if (isOutForDelivery) {
              statusTitle = 'طلبك في الطريق';
              statusDesc = 'استعد للاستلام';
              statusTimeOrDesc = '10-15 دقيقة';
              statusTimeTitle = 'يصل في غضون';
              currentStep = 2;
            } else if (isCompleted) {
              statusTitle = 'تم توصيل طلبك بنجاح';
              statusDesc = 'نتمنى لك وجبة شهية';
              statusTimeOrDesc = order.updatedAt ? new Date(order.updatedAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
              statusTimeTitle = 'وصل في تمام';
              statusColor = 'bg-emerald-500';
              currentStep = 3;
            }

            return (
              <>
                {/* Tracking Header */}
                <header className="h-14 bg-surface border-b border-border flex items-center justify-between px-4 z-10 shrink-0">
                  <div className="text-primary-500 font-bold text-lg">{storeSettings?.nameAr || 'المطعم'}</div>
                  <h1 className="font-bold text-foreground">تتبع الطلب</h1>
                  <button onClick={() => setTrackingOrderId(null)} className="p-2 text-muted hover:text-foreground hover:bg-surface-hover rounded-full transition-colors">
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </header>

                <div className="flex-1 overflow-y-auto px-4 pb-20 space-y-4">
                  {/* Status Banner */}
                  <div className={`${statusColor} rounded-3xl p-6 text-white shadow-xl flex items-center justify-between relative overflow-hidden mt-2`}>
                    <div className="bg-white/20 absolute -left-4 -top-4 w-24 h-24 rounded-full blur-xl"></div>
                    <div className="relative z-10 text-center bg-white/10 p-3 rounded-2xl border border-white/20 min-w-24">
                       <div className="text-[10px] sm:text-xs text-white/80 mb-1">{statusTimeTitle}</div>
                       <div className="font-bold text-lg sm:text-xl">{statusTimeOrDesc}</div>
                    </div>
                    <div className="relative z-10 text-right">
                       <div className="text-xs text-white/80 mb-1 font-medium">حالة الطلب الحالي</div>
                       <div className="font-bold text-xl sm:text-2xl tracking-tight leading-tight max-w-[140px] text-right" dir="rtl">{statusTitle}</div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="bg-surface rounded-3xl p-6 shadow-sm border border-border mt-4 relative">
                    <div className="absolute top-[42px] left-8 right-8 h-1 bg-surface-hover rounded-full" dir="rtl">
                      <div className={`h-full bg-primary-500 rounded-full transition-all duration-500`} style={{ width: `${(currentStep / 3) * 100}%` }}></div>
                    </div>
                    
                    <div className="flex justify-between relative z-10" dir="rtl">
                      {[
                        { title: 'تم الاستلام', icon: Home, stepIndex: 0 },
                        { title: 'قيد التحضير', icon: Utensils, stepIndex: 1 },
                        { title: 'جاري التوصيل', icon: Truck, stepIndex: 2 },
                        { title: 'تم التوصيل', icon: Check, stepIndex: 3 }
                      ].map((step, index) => {
                        const isActive = currentStep === index;
                        const isPast = currentStep > index;
                        
                        let Icon = step.icon;
                        if (isPast) Icon = Check; // Show check for completed steps

                        return (
                          <div key={index} className="flex flex-col items-center gap-2">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center border-4 border-surface shadow-sm transition-colors ${
                              isPast || isActive ? 'bg-primary-500 text-white' : 'bg-surface-hover text-muted'
                            } ${isActive && currentStep !== 3 ? 'ring-4 ring-primary-500/20 scale-110' : ''}`}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <span className={`text-[10px] font-bold ${isPast || isActive ? 'text-primary-500' : 'text-muted'}`}>{step.title}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Map */}
                  <div className="bg-surface rounded-3xl border border-border overflow-hidden shadow-sm h-48 relative">
                     <iframe 
                      src={order.location ? `https://maps.google.com/maps?q=${order.location.lat},${order.location.lng}&z=15&output=embed` : "https://maps.google.com/maps?q=Riyadh,Saudi+Arabia&z=12&output=embed"} 
                      width="100%" 
                      height="100%" 
                      style={{ border: 0 }} 
                      allowFullScreen={false} 
                      loading="lazy" 
                      referrerPolicy="no-referrer-when-downgrade"
                      title="Order Location Map"
                    ></iframe>
                    
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                       <div className="w-12 h-12 bg-primary-600 rounded-full border-4 border-surface flex items-center justify-center shadow-lg animate-pulse">
                         <Truck className="w-6 h-6 text-white" />
                       </div>
                    </div>
                  </div>

                  {/* Order Details */}
                  <div className="bg-surface rounded-3xl p-5 shadow-sm border border-border">
                    <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
                      <ChevronDown className="w-5 h-5 text-muted" />
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground">رقم الطلب #{order.orderId || order.id.substring(0, 4)}</span>
                        <ShoppingBag className="w-5 h-5 text-muted" />
                      </div>
                    </div>
                    
                    <div className="space-y-3 mb-4">
                      {order.items?.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center text-foreground">
                          <span className="font-bold text-sm">{formatCurrency(item.price * item.quantity)}</span>
                          <span className="text-sm">{item.name} {item.quantity > 1 ? `(${item.quantity})` : ''}</span>
                        </div>
                      ))}
                    </div>
                    
                    <div className="flex justify-between items-center pt-4 border-t border-border pb-4">
                      <span className="font-bold text-primary-500 text-lg">{formatCurrency(order.total)}</span>
                      <span className="font-bold text-primary-500 text-lg">الإجمالي</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Navigation */}
                <div className="h-16 bg-surface border-t border-border flex items-center justify-center gap-16 px-6 shrink-0 fixed bottom-0 left-0 right-0 z-20">
                  <div className="flex flex-col items-center gap-1 text-primary-500 cursor-pointer">
                     <div className="w-10 h-10 bg-primary-500/10 rounded-full flex items-center justify-center">
                       <Check className="w-5 h-5 text-primary-500" />
                     </div>
                     <span className="text-[10px] font-bold text-primary-500">طلباتي</span>
                  </div>
                  <div className="flex flex-col items-center gap-1 text-muted hover:text-foreground cursor-pointer transition-colors" onClick={() => setTrackingOrderId(null)}>
                     <Home className="w-5 h-5" />
                     <span className="text-[10px] font-medium">الرئيسية</span>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
