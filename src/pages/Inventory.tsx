import React, { useState, useEffect } from "react";
import { useUserAuth } from "../hooks/useUserAuth";

import {
  Package,
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  X,
  Store,
  Settings,
  AlertTriangle,
} from "lucide-react";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  addDoc,
  writeBatch,
  increment,
} from "firebase/firestore";
import { handleFirestoreError, OperationType } from "../lib/firestoreUtils";
import { ExportButtons } from "../components/ExportButtons";
import { exportToExcel, printTable } from "../lib/exportUtils";

export default function Inventory() {
  const { branchId: userBranchId, hasPermission } = useUserAuth();
  const canViewAllBranches = hasPermission("branches.view_all");
  useEffect(() => {
    if (!canViewAllBranches && userBranchId) {
      setSelectedBranchFilter(userBranchId);
    }
  }, [canViewAllBranches, userBranchId]);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBranchFilter, setSelectedBranchFilter] =
    useState<string>("all");
  const [products, setProducts] = useState<any[]>([]);
  const [allBranches, setBranches] = useState<any[]>([]);
  const branches = canViewAllBranches
    ? allBranches
    : allBranches.filter((b) => b.id === userBranchId);
  const [categories, setCategories] = useState<any[]>([]);
  const [kitchens, setKitchens] = useState<any[]>([]);
  const [rawMaterials, setRawMaterials] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteType, setDeleteType] = useState<
    "product" | "category" | "kitchen"
  >("product");
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isWasteModalOpen, setIsWasteModalOpen] = useState(false);
  const [wasteData, setWasteData] = useState({
    product: null as any,
    quantity: 0,
    reason: "تالف",
  });
  const [settingsTab, setSettingsTab] = useState<"categories" | "kitchens">(
    "categories",
  );
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    price: 0,
    cost: 0,
    stock: 0,
    minStock: 0,
    status: "متوفر",
    branchId: "",
    ingredients: [] as any[],
    isAvailable: true,
  });
  const [categoryFormData, setCategoryFormData] = useState({
    name: "",
    kitchenId: "",
  });
  const [kitchenFormData, setKitchenFormData] = useState({ name: "" });
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [editingKitchen, setEditingKitchen] = useState<any>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [showLowStockOnly, setShowLowStockOnly] = useState(false);

  useEffect(() => {
    const unsubscribeProducts = onSnapshot(
      collection(db, "products"),
      (snapshot) => {
        const productsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setProducts(productsData);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "products");
      },
    );

    const unsubscribeBranches = onSnapshot(
      collection(db, "branches"),
      (snapshot) => {
        const branchesData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setBranches(branchesData);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "branches");
      },
    );

    const unsubscribeCategories = onSnapshot(
      collection(db, "product_categories"),
      (snapshot) => {
        const categoriesData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setCategories(categoriesData);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "product_categories");
      },
    );

    const unsubscribeKitchens = onSnapshot(
      collection(db, "kitchen_stations"),
      (snapshot) => {
        const kitchensData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setKitchens(kitchensData);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "kitchen_stations");
      },
    );

    const unsubscribeRawMaterials = onSnapshot(
      collection(db, "raw_materials"),
      (snapshot) => {
        const materialsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setRawMaterials(materialsData);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "raw_materials");
      },
    );

    return () => {
      unsubscribeProducts();
      unsubscribeBranches();
      unsubscribeCategories();
      unsubscribeKitchens();
      unsubscribeRawMaterials();
    };
  }, []);

  const confirmDelete = (
    id: string,
    type: "product" | "category" | "kitchen",
  ) => {
    setItemToDelete(id);
    setDeleteType(type);
    setIsDeleteModalOpen(true);
  };

  const executeDelete = async () => {
    if (itemToDelete) {
      try {
        let collectionName = "products";
        if (deleteType === "category") collectionName = "product_categories";
        if (deleteType === "kitchen") collectionName = "kitchen_stations";

        await deleteDoc(doc(db, collectionName, itemToDelete));
        setIsDeleteModalOpen(false);
        setItemToDelete(null);
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.DELETE,
          `${deleteType}/${itemToDelete}`,
        );
      }
    }
  };

  const handleOpenModal = (product: any = null) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name || "",
        category: product.category || product.categoryId || "",
        price: product.price || 0,
        cost: product.cost || 0,
        stock: product.stock || 0,
        minStock: product.minStock || 0,
        status: product.status || (product.isAvailable ? "متوفر" : "نفذ"),
        branchId: product.branchId || "",
        ingredients: product.ingredients || [],
        isAvailable: product.isAvailable !== false,
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: "",
        category: "",
        price: 0,
        cost: 0,
        stock: 0,
        minStock: 0,
        status: "متوفر",
        branchId: "",
        ingredients: [],
        isAvailable: true,
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name) {
      setValidationError("الرجاء إدخال اسم المنتج");
      setTimeout(() => setValidationError(null), 3000);
      return;
    }
    if (!formData.category) {
      setValidationError("الرجاء اختيار التصنيف");
      setTimeout(() => setValidationError(null), 3000);
      return;
    }
    if (!formData.branchId) {
      setValidationError("الرجاء اختيار الفرع");
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    try {
      if (editingProduct) {
        await setDoc(doc(db, "products", editingProduct.id), formData, {
          merge: true,
        });
      } else {
        await addDoc(collection(db, "products"), formData);
      }
      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "products");
    }
  };

  const addIngredient = () => {
    setFormData((prev) => ({
      ...prev,
      ingredients: [
        ...prev.ingredients,
        { materialId: "", quantity: 1, cost: 0 },
      ],
    }));
  };

  const updateIngredient = (index: number, field: string, value: any) => {
    setFormData((prev) => {
      const newIngredients = [...prev.ingredients];
      newIngredients[index] = { ...newIngredients[index], [field]: value };

      if (field === "materialId" || field === "quantity") {
        const material = rawMaterials.find(
          (m) => m.id === newIngredients[index].materialId,
        );
        if (material) {
          newIngredients[index].cost =
            Number(newIngredients[index].quantity) *
            Number(material.costPerUnit || 0);
        }
      }

      const totalCost = newIngredients.reduce(
        (sum, item) => sum + (item.cost || 0),
        0,
      );
      return {
        ...prev,
        ingredients: newIngredients,
        cost: totalCost > 0 ? totalCost : prev.cost,
      };
    });
  };

  const removeIngredient = (index: number) => {
    setFormData((prev) => {
      const newIngredients = prev.ingredients.filter((_, i) => i !== index);
      const totalCost = newIngredients.reduce(
        (sum, item) => sum + (item.cost || 0),
        0,
      );
      return {
        ...prev,
        ingredients: newIngredients,
        cost: totalCost > 0 ? totalCost : prev.cost,
      };
    });
  };

  const handleSaveCategory = async () => {
    if (!categoryFormData.name) {
      setValidationError("الرجاء إدخال اسم التصنيف");
      setTimeout(() => setValidationError(null), 3000);
      return;
    }
    try {
      if (editingCategory) {
        await setDoc(
          doc(db, "product_categories", editingCategory.id),
          categoryFormData,
          { merge: true },
        );
      } else {
        await addDoc(collection(db, "product_categories"), categoryFormData);
      }
      setCategoryFormData({ name: "", kitchenId: "" });
      setEditingCategory(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "product_categories");
    }
  };

  const handleSaveKitchen = async () => {
    if (!kitchenFormData.name) {
      setValidationError("الرجاء إدخال اسم المطبخ");
      setTimeout(() => setValidationError(null), 3000);
      return;
    }
    try {
      if (editingKitchen) {
        await setDoc(
          doc(db, "kitchen_stations", editingKitchen.id),
          kitchenFormData,
          { merge: true },
        );
      } else {
        await addDoc(collection(db, "kitchen_stations"), kitchenFormData);
      }
      setKitchenFormData({ name: "" });
      setEditingKitchen(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "kitchen_stations");
    }
  };

  const handleSaveWaste = async () => {
    if (!wasteData.product || wasteData.quantity <= 0) {
      setValidationError("الرجاء إدخال كمية صحيحة");
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    if (wasteData.quantity > wasteData.product.stock) {
      setValidationError("الكمية تتجاوز المخزون الحالي");
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    try {
      const batch = writeBatch(db);
      const productRef = doc(db, "products", wasteData.product.id);

      // Update stock
      batch.update(productRef, {
        stock: wasteData.product.stock - wasteData.quantity,
      });

      // Deduct raw materials as well if applicable
      if (
        wasteData.product.ingredients &&
        wasteData.product.ingredients.length > 0
      ) {
        wasteData.product.ingredients.forEach((ingredient: any) => {
          if (ingredient.materialId) {
            const materialRef = doc(db, "raw_materials", ingredient.materialId);
            batch.update(materialRef, {
              stock: increment(-(ingredient.quantity * wasteData.quantity)),
            });

            // Log stock movement
            const material = rawMaterials.find(
              (m: any) => m.id === ingredient.materialId,
            );
            const movementRef = doc(collection(db, "stock_movements"));
            batch.set(movementRef, {
              materialId: ingredient.materialId,
              materialName: material?.name || "مادة محذوفة",
              type: "out",
              quantity: ingredient.quantity * wasteData.quantity,
              unit: material?.unit || "",
              date: new Date().toISOString(),
              source: "waste",
              note: `تالف/هدر من منتج: ${wasteData.product.name} (كمية: ${wasteData.quantity})`,
            });
          }
        });
      }

      await batch.commit();
      setIsWasteModalOpen(false);
      setWasteData({ product: null as any, quantity: 0, reason: "تالف" });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "products");
    }
  };

  const filteredProducts = products.filter((p: any) => {
    const matchesSearch =
      (p.name && p.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.category &&
        p.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.categoryId &&
        p.categoryId.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesBranch =
      selectedBranchFilter === "all" || p.branchId === selectedBranchFilter;
    const isLowStock = p.stock <= (p.minStock || 0);
    const matchesLowStock = showLowStockOnly ? isLowStock : true;
    return matchesSearch && matchesBranch && matchesLowStock;
  });

  return (
    <div className="p-6 bg-background min-h-full text-foreground" dir="rtl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            المخازن والمنتجات
          </h1>
          <p className="text-muted">إدارة المنتجات، الكميات، والتصنيفات</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            className="bg-surface border border-border hover:bg-surface-hover text-foreground px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors"
          >
            <Settings className="w-5 h-5" />
            <span className="hidden sm:inline">إدارة التصنيفات والمطابخ</span>
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>إضافة منتج</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <Package className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted mb-1">إجمالي المنتجات</p>
              <h3 className="text-2xl font-bold text-foreground">
                {products.length}
              </h3>
            </div>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-red-500/20 rounded-lg flex items-center justify-center">
              <Package className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <p className="text-sm text-muted mb-1">نواقص المخزون</p>
              <h3 className="text-2xl font-bold text-foreground">
                {
                  products.filter(
                    (p: any) => p.status === "نفذ" || p.stock <= p.minStock,
                  ).length
                }
              </h3>
            </div>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500/20 rounded-lg flex items-center justify-center">
              <Package className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-muted mb-1">المنتجات المتوفرة</p>
              <h3 className="text-2xl font-bold text-foreground">
                {products.filter((p: any) => p.status === "متوفر").length}
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
              placeholder="البحث عن منتج..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:border-primary-500 pr-10"
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <button
              onClick={() => setShowLowStockOnly(!showLowStockOnly)}
              className={`px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                showLowStockOnly
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : "bg-background border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Filter className="w-4 h-4" />
              <span>نواقص المخزون</span>
            </button>
            <select
              value={selectedBranchFilter}
              onChange={(e) => setSelectedBranchFilter(e.target.value)}
              className="w-full sm:w-64 bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary-500"
            >
              {canViewAllBranches && <option value="all">جميع الفروع</option>}
              {branches
                .filter((b) => b.status === "نشط")
                .map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
            </select>
            <ExportButtons
              onExport={() => exportToExcel(filteredProducts, "المخزون")}
              onPrint={() => printTable("inventory-table", "تقرير المخزون")}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table id="inventory-table" className="w-full text-right">
            <thead>
              <tr className="bg-background border-b border-border">
                <th className="px-6 py-4 text-sm font-medium text-muted">
                  المنتج
                </th>
                <th className="px-6 py-4 text-sm font-medium text-muted">
                  الفرع
                </th>
                <th className="px-6 py-4 text-sm font-medium text-muted">
                  التصنيف
                </th>
                <th className="px-6 py-4 text-sm font-medium text-muted">
                  السعر
                </th>
                <th className="px-6 py-4 text-sm font-medium text-muted">
                  المخزون
                </th>
                <th className="px-6 py-4 text-sm font-medium text-muted">
                  الحالة
                </th>
                <th className="px-6 py-4 text-sm font-medium text-muted">
                  إجراءات
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredProducts.map((product: any) => {
                const isLowStock = product.stock <= (product.minStock || 0);
                return (
                  <tr
                    key={product.id}
                    className={`hover:bg-surface-hover/50 transition-colors ${isLowStock ? "bg-red-500/5" : ""}`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-background overflow-hidden relative">
                          {product.image ? (
                            <img
                              src={product.image}
                              alt={product.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                              <Package className="w-5 h-5" />
                            </div>
                          )}
                          {isLowStock && (
                            <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 border-2 border-background rounded-full animate-pulse"></div>
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground flex items-center gap-2">
                            {product.name}
                            {isLowStock && (
                              <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 text-[10px] font-bold">
                                نواقص
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {branches.find((b) => b.id === product.branchId)?.name ||
                        "غير محدد"}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {product.category || product.categoryId}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {product.price} د.ل
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={
                          isLowStock
                            ? "text-red-400 font-bold"
                            : "text-muted-foreground"
                        }
                      >
                        {product.stock || 0}
                      </span>
                      {isLowStock && (
                        <span className="text-[10px] text-red-500 block">
                          الحد الأدنى: {product.minStock || 0}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-medium ${product.stock > 0 && (product.status === "متوفر" || product.isAvailable) ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}
                      >
                        {product.stock <= 0
                          ? "نفذ"
                          : product.status ||
                            (product.isAvailable ? "متوفر" : "غير متوفر")}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setWasteData({ ...wasteData, product });
                            setIsWasteModalOpen(true);
                          }}
                          className="p-1.5 text-muted hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors"
                          title="تسجيل هدر/تالف"
                        >
                          <AlertTriangle className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenModal(product)}
                          className="p-1.5 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => confirmDelete(product.id, "product")}
                          className="p-1.5 text-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredProducts.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-8 text-center text-muted-foreground"
                  >
                    لا توجد منتجات مطابقة للبحث
                  </td>
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
              <h3 className="text-lg font-bold text-foreground">
                {editingProduct ? "تعديل منتج" : "إضافة منتج جديد"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-muted hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto pos-scroll">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  الفرع
                </label>
                <select
                  value={formData.branchId}
                  onChange={(e) =>
                    setFormData({ ...formData, branchId: e.target.value })
                  }
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                >
                  <option value="">اختر الفرع</option>
                  {branches
                    .filter((b) => b.status === "نشط")
                    .map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  اسم المنتج
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  التصنيف
                </label>
                <select
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                >
                  <option value="">اختر التصنيف</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                  {formData.category &&
                    !categories.find((c) => c.name === formData.category) && (
                      <option value={formData.category}>
                        {formData.category}
                      </option>
                    )}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">
                    السعر (د.ل)
                  </label>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        price: Number(e.target.value),
                      })
                    }
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">
                    التكلفة (د.ل)
                  </label>
                  <input
                    type="number"
                    value={formData.cost}
                    onChange={(e) =>
                      setFormData({ ...formData, cost: Number(e.target.value) })
                    }
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">
                    المخزون الحالي
                  </label>
                  <input
                    type="number"
                    value={formData.stock}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        stock: Number(e.target.value),
                      })
                    }
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">
                    الحد الأدنى للمخزون
                  </label>
                  <input
                    type="number"
                    value={formData.minStock}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        minStock: Number(e.target.value),
                      })
                    }
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              {/* Ingredients Section */}
              <div className="border border-border rounded-lg p-4 bg-surface-hover/30">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium text-foreground text-sm">
                    مكونات المنتج (مواد خام)
                  </h4>
                  <button
                    onClick={addIngredient}
                    className="text-xs text-primary-500 hover:text-primary-400 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    إضافة مكون
                  </button>
                </div>
                <div className="space-y-3">
                  {formData.ingredients.map((item, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      <div className="flex-1">
                        <select
                          value={item.materialId}
                          onChange={(e) =>
                            updateIngredient(
                              index,
                              "materialId",
                              e.target.value,
                            )
                          }
                          className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary-500"
                        >
                          <option value="">اختر المادة</option>
                          {rawMaterials
                            .filter(
                              (m) =>
                                !formData.branchId ||
                                m.branchId === formData.branchId,
                            )
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name} ({m.unit})
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="w-20">
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="الكمية"
                          value={item.quantity}
                          onChange={(e) =>
                            updateIngredient(
                              index,
                              "quantity",
                              Number(e.target.value),
                            )
                          }
                          className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary-500"
                        />
                      </div>
                      <div className="w-20">
                        <div className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-muted text-center">
                          {item.cost?.toFixed(2) || "0.00"}
                        </div>
                      </div>
                      <button
                        onClick={() => removeIngredient(index)}
                        className="p-1.5 text-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {formData.ingredients.length === 0 && (
                    <div className="text-center py-2 text-xs text-muted">
                      لم يتم إضافة مكونات
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  الحالة
                </label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value })
                  }
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                >
                  <option value="متوفر">متوفر</option>
                  <option value="قليل">قليل</option>
                  <option value="نفذ">نفذ</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-3 bg-surface-hover rounded-lg border border-border">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    متاح للطلب
                  </p>
                  <p className="text-xs text-muted">
                    إظهار المنتج في شاشة المطبخ ونقطة البيع وتطبيق الزبائن
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={formData.isAvailable}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        isAvailable: e.target.checked,
                      })
                    }
                  />
                  <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                </label>
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
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
              <h3 className="text-xl font-bold text-foreground mb-2">
                تأكيد الحذف
              </h3>
              <p className="text-muted mb-6">
                هل أنت متأكد من رغبتك في حذف{" "}
                {deleteType === "product"
                  ? "هذا المنتج"
                  : deleteType === "category"
                    ? "هذا التصنيف"
                    : "هذا المطبخ"}
                ؟ لا يمكن التراجع عن هذا الإجراء.
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setItemToDelete(null);
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
      {/* Settings Modal */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-2xl flex flex-col max-h-[90vh] shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h3 className="text-lg font-bold text-foreground">
                إدارة التصنيفات والمطابخ
              </h3>
              <button
                onClick={() => setIsSettingsModalOpen(false)}
                className="text-muted hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex border-b border-border">
              <button
                onClick={() => setSettingsTab("categories")}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${settingsTab === "categories" ? "text-primary-500 border-b-2 border-primary-500" : "text-muted hover:text-foreground"}`}
              >
                التصنيفات
              </button>
              <button
                onClick={() => setSettingsTab("kitchens")}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${settingsTab === "kitchens" ? "text-primary-500 border-b-2 border-primary-500" : "text-muted hover:text-foreground"}`}
              >
                المطابخ
              </button>
            </div>

            <div className="p-4 overflow-y-auto pos-scroll flex-1">
              {settingsTab === "categories" ? (
                <div className="space-y-6">
                  <div className="bg-background p-4 rounded-xl border border-border">
                    <h4 className="font-medium text-foreground mb-4">
                      {editingCategory ? "تعديل تصنيف" : "إضافة تصنيف جديد"}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-muted mb-1">
                          اسم التصنيف
                        </label>
                        <input
                          type="text"
                          value={categoryFormData.name}
                          onChange={(e) =>
                            setCategoryFormData({
                              ...categoryFormData,
                              name: e.target.value,
                            })
                          }
                          className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-muted mb-1">
                          المطبخ المرتبط
                        </label>
                        <select
                          value={categoryFormData.kitchenId}
                          onChange={(e) =>
                            setCategoryFormData({
                              ...categoryFormData,
                              kitchenId: e.target.value,
                            })
                          }
                          className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                        >
                          <option value="">بدون مطبخ</option>
                          {kitchens.map((k) => (
                            <option key={k.id} value={k.id}>
                              {k.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      {editingCategory && (
                        <button
                          onClick={() => {
                            setEditingCategory(null);
                            setCategoryFormData({ name: "", kitchenId: "" });
                          }}
                          className="px-4 py-2 text-sm font-medium text-muted hover:text-foreground"
                        >
                          إلغاء
                        </button>
                      )}
                      <button
                        onClick={handleSaveCategory}
                        className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        {editingCategory ? "تحديث" : "إضافة"}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-medium text-foreground mb-2">
                      التصنيفات الحالية
                    </h4>
                    {categories.map((cat) => (
                      <div
                        key={cat.id}
                        className="flex items-center justify-between p-3 bg-background border border-border rounded-lg"
                      >
                        <div>
                          <p className="font-medium text-foreground">
                            {cat.name}
                          </p>
                          <p className="text-xs text-muted">
                            المطبخ:{" "}
                            {kitchens.find((k) => k.id === cat.kitchenId)
                              ?.name || "غير محدد"}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingCategory(cat);
                              setCategoryFormData({
                                name: cat.name,
                                kitchenId: cat.kitchenId || "",
                              });
                            }}
                            className="p-1.5 text-muted hover:text-primary-500 transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => confirmDelete(cat.id, "category")}
                            className="p-1.5 text-muted hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {categories.length === 0 && (
                      <p className="text-center text-muted py-4">
                        لا توجد تصنيفات
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="bg-background p-4 rounded-xl border border-border">
                    <h4 className="font-medium text-foreground mb-4">
                      {editingKitchen ? "تعديل مطبخ" : "إضافة مطبخ جديد"}
                    </h4>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-muted mb-1">
                        اسم المطبخ (محطة التحضير)
                      </label>
                      <input
                        type="text"
                        value={kitchenFormData.name}
                        onChange={(e) =>
                          setKitchenFormData({
                            ...kitchenFormData,
                            name: e.target.value,
                          })
                        }
                        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                        placeholder="مثال: مطبخ المشويات، قسم المشروبات..."
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      {editingKitchen && (
                        <button
                          onClick={() => {
                            setEditingKitchen(null);
                            setKitchenFormData({ name: "" });
                          }}
                          className="px-4 py-2 text-sm font-medium text-muted hover:text-foreground"
                        >
                          إلغاء
                        </button>
                      )}
                      <button
                        onClick={handleSaveKitchen}
                        className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        {editingKitchen ? "تحديث" : "إضافة"}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-medium text-foreground mb-2">
                      المطابخ الحالية
                    </h4>
                    {kitchens.map((kitchen) => (
                      <div
                        key={kitchen.id}
                        className="flex items-center justify-between p-3 bg-background border border-border rounded-lg"
                      >
                        <span className="font-medium text-foreground">
                          {kitchen.name}
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingKitchen(kitchen);
                              setKitchenFormData({ name: kitchen.name });
                            }}
                            className="p-1.5 text-muted hover:text-primary-500 transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => confirmDelete(kitchen.id, "kitchen")}
                            className="p-1.5 text-muted hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {kitchens.length === 0 && (
                      <p className="text-center text-muted py-4">
                        لا توجد مطابخ
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Waste Modal */}
      {isWasteModalOpen && wasteData.product && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-sm flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                تسجيل تالف / هدر من المنتجات
              </h3>
              <button
                onClick={() => setIsWasteModalOpen(false)}
                className="text-muted hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {validationError && (
              <div className="mx-4 mt-4 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm">
                {validationError}
              </div>
            )}

            <div className="p-4 space-y-4">
              <div className="bg-background border border-border p-3 rounded-lg flex justify-between items-center">
                <span className="text-foreground">
                  {wasteData.product.name}
                </span>
                <span className="text-muted-foreground">
                  {wasteData.product.stock} (متاح مسبقاً)
                </span>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  الكمية التالفة/المهدرة
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  max={wasteData.product.stock}
                  value={wasteData.quantity || ""}
                  onChange={(e) =>
                    setWasteData({
                      ...wasteData,
                      quantity: Number(e.target.value),
                    })
                  }
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
                <p className="text-xs text-muted mt-1">
                  سيتم خصم هذه الكمية من المنتجات الجاهزة، وأيضاً من مكوناتها
                  (المواد الخام) إن وجدت.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  السبب
                </label>
                <select
                  value={wasteData.reason}
                  onChange={(e) =>
                    setWasteData({ ...wasteData, reason: e.target.value })
                  }
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                >
                  <option value="تالف">تالف (انتهاء صلاحية أو تلف)</option>
                  <option value="هدر">
                    هدر (أثناء التحضير أو خطأ في الطلب)
                  </option>
                  <option value="استخدام شخصي/ضيافة">
                    استخدام شخصي / ضيافة
                  </option>
                  <option value="أخرى">سبب آخر</option>
                </select>
              </div>
            </div>

            <div className="p-4 border-t border-border flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setIsWasteModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveWaste}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>تأكيد الخصم</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
