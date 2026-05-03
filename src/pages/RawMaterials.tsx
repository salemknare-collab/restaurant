import React, { useState, useEffect } from "react";
import { useUserAuth } from "../hooks/useUserAuth";

import {
  Package,
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  ArrowRightLeft,
  History,
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
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { handleFirestoreError, OperationType } from "../lib/firestoreUtils";
import { ExportButtons } from "../components/ExportButtons";
import { exportToExcel, printTable } from "../lib/exportUtils";

export default function RawMaterials() {
  const { branchId: userBranchId, hasPermission } = useUserAuth();
  const canViewAllBranches = hasPermission("branches.view_all");
  useEffect(() => {
    if (!canViewAllBranches && userBranchId) {
      setFilterBranchId(userBranchId);
    }
  }, [canViewAllBranches, userBranchId]);

  const [activeTab, setActiveTab] = useState<"materials" | "transfers">(
    "materials",
  );
  const [materials, setMaterials] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [allBranches, setBranches] = useState<any[]>([]);
  const branches = canViewAllBranches
    ? allBranches
    : allBranches.filter((b) => b.id === userBranchId);
  const [searchTerm, setSearchTerm] = useState("");
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [filterBranchId, setFilterBranchId] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{
    id: string;
    type: "material" | "transfer";
  } | null>(null);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
  const [selectedMaterialForLedger, setSelectedMaterialForLedger] =
    useState<any>(null);
  const [stockMovements, setStockMovements] = useState<any[]>([]);
  const [editingMaterial, setEditingMaterial] = useState<any>(null);

  // Units Management
  const [measurementUnits, setMeasurementUnits] = useState<any[]>([]);
  const [isUnitsModalOpen, setIsUnitsModalOpen] = useState(false);
  const [isWasteModalOpen, setIsWasteModalOpen] = useState(false);
  const [newUnitName, setNewUnitName] = useState("");
  const [wasteData, setWasteData] = useState({
    material: null as any,
    quantity: 0,
    reason: "تالف",
  });
  const DEFAULT_UNITS = ["كجم", "جرام", "لتر", "مل", "حبة", "كرتون", "عبوة"];
  const activeUnits =
    measurementUnits.length > 0
      ? measurementUnits
      : DEFAULT_UNITS.map((u) => ({ id: u, name: u }));

  const handleAddUnit = async () => {
    if (!newUnitName.trim()) return;
    try {
      if (measurementUnits.length === 0) {
        // Bootstrap defaults first
        const batch = writeBatch(db);
        DEFAULT_UNITS.forEach((u) => {
          const docRef = doc(collection(db, "measurement_units"));
          batch.set(docRef, { name: u });
        });
        await batch.commit();
      }
      await addDoc(collection(db, "measurement_units"), {
        name: newUnitName.trim(),
      });
      setNewUnitName("");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "measurement_units");
    }
  };

  const handleDeleteUnit = async (unitId: string) => {
    try {
      if (measurementUnits.length === 0) {
        setValidationError(
          "لا يمكن حذف الوحدات الافتراضية، يرجى إضافة وحدة جديدة أولاً وبعدها يمكنك التحكم بالوحدات.",
        );
        setTimeout(() => setValidationError(null), 3000);
        return;
      }
      await deleteDoc(doc(db, "measurement_units", unitId));
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `measurement_units/${unitId}`,
      );
    }
  };

  const [transferData, setTransferData] = useState({
    material: null as any,
    destinationBranchId: "",
    quantity: 0,
  });
  const [formData, setFormData] = useState({
    name: "",
    unit: "كجم",
    costPerUnit: 0,
    stock: 0,
    minStock: 0,
    branchId: "",
  });
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeMaterials = onSnapshot(
      collection(db, "raw_materials"),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setMaterials(data);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "raw_materials");
      },
    );

    const unsubscribeTransfers = onSnapshot(
      collection(db, "inventory_transfers"),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        // Sort by date descending
        data.sort(
          (a: any, b: any) =>
            new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
        setTransfers(data);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "inventory_transfers");
      },
    );

    const unsubscribeBranches = onSnapshot(
      collection(db, "branches"),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setBranches(data);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "branches");
      },
    );

    const unsubscribeMovements = onSnapshot(
      collection(db, "stock_movements"),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        data.sort(
          (a: any, b: any) =>
            new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
        setStockMovements(data);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "stock_movements");
      },
    );

    const unsubscribeUnits = onSnapshot(
      collection(db, "measurement_units"),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setMeasurementUnits(data);
      },
      (error) => {
        console.error("Error fetching units:", error);
      },
    );

    return () => {
      unsubscribeMaterials();
      unsubscribeTransfers();
      unsubscribeBranches();
      unsubscribeMovements();
      unsubscribeUnits();
    };
  }, []);

  const handleOpenModal = (material?: any) => {
    if (material) {
      setEditingMaterial(material);
      setFormData({
        name: material.name || "",
        unit: material.unit || "كجم",
        costPerUnit: material.costPerUnit || 0,
        stock: material.stock || 0,
        minStock: material.minStock || 0,
        branchId: material.branchId || "",
      });
    } else {
      setEditingMaterial(null);
      setFormData({
        name: "",
        unit: "كجم",
        costPerUnit: 0,
        stock: 0,
        minStock: 0,
        branchId: "",
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.branchId) {
      setValidationError("الرجاء إدخال اسم المادة واختيار الفرع/المخزن");
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    try {
      const batch = writeBatch(db);
      let materialId = editingMaterial?.id;

      if (editingMaterial) {
        const materialRef = doc(db, "raw_materials", editingMaterial.id);
        batch.set(materialRef, formData, { merge: true });

        // Log movement if stock changed
        const stockDiff = formData.stock - (editingMaterial.stock || 0);
        if (stockDiff !== 0) {
          const movementRef = doc(collection(db, "stock_movements"));
          batch.set(movementRef, {
            materialId: editingMaterial.id,
            materialName: formData.name,
            type: stockDiff > 0 ? "in" : "out",
            quantity: Math.abs(stockDiff),
            unit: formData.unit,
            date: new Date().toISOString(),
            source: "manual_adjustment",
            note: "تعديل يدوي للرصيد",
          });
        }
      } else {
        const newMaterialRef = doc(collection(db, "raw_materials"));
        materialId = newMaterialRef.id;
        batch.set(newMaterialRef, formData);

        if (formData.stock > 0) {
          const movementRef = doc(collection(db, "stock_movements"));
          batch.set(movementRef, {
            materialId: materialId,
            materialName: formData.name,
            type: "in",
            quantity: formData.stock,
            unit: formData.unit,
            date: new Date().toISOString(),
            source: "initial_stock",
            note: "رصيد افتتاحي",
          });
        }
      }

      await batch.commit();
      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "raw_materials");
    }
  };

  const confirmDelete = (
    id: string,
    type: "material" | "transfer" = "material",
  ) => {
    setItemToDelete({ id, type });
    setIsDeleteModalOpen(true);
  };

  const executeDelete = async () => {
    if (!itemToDelete) return;
    try {
      if (itemToDelete.type === "transfer") {
        const batch = writeBatch(db);
        batch.delete(doc(db, "inventory_transfers", itemToDelete.id));
        // You might also want to reverse stock if necessary, but "deleting the log" typically means just the log
        await batch.commit();
      } else {
        await deleteDoc(doc(db, "raw_materials", itemToDelete.id));
      }
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
    } catch (error) {
      const collectionName =
        itemToDelete.type === "transfer"
          ? "inventory_transfers"
          : "raw_materials";
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `${collectionName}/${itemToDelete.id}`,
      );
    }
  };

  const handleOpenTransferModal = (material: any) => {
    setTransferData({
      material,
      destinationBranchId: "",
      quantity: 0,
    });
    setIsTransferModalOpen(true);
  };

  const handleTransfer = async () => {
    if (!transferData.destinationBranchId || transferData.quantity <= 0) {
      setValidationError("الرجاء اختيار الفرع الوجهة وإدخال كمية صحيحة");
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    if (transferData.quantity > transferData.material.stock) {
      setValidationError("الكمية المطلوبة للتحويل أكبر من المخزون المتاح");
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    try {
      const batch = writeBatch(db);

      // 1. Decrease stock from source
      const sourceRef = doc(db, "raw_materials", transferData.material.id);
      batch.update(sourceRef, {
        stock: transferData.material.stock - transferData.quantity,
      });

      // 2. Find or create material in destination branch
      const destQuery = query(
        collection(db, "raw_materials"),
        where("name", "==", transferData.material.name),
        where("branchId", "==", transferData.destinationBranchId),
      );
      const destSnapshot = await getDocs(destQuery);

      let destMaterialId = "";
      if (!destSnapshot.empty) {
        // Update existing
        const destDoc = destSnapshot.docs[0];
        destMaterialId = destDoc.id;
        batch.update(doc(db, "raw_materials", destDoc.id), {
          stock: destDoc.data().stock + transferData.quantity,
        });
      } else {
        // Create new
        const newDestRef = doc(collection(db, "raw_materials"));
        destMaterialId = newDestRef.id;
        const { id, ...materialDataWithoutId } = transferData.material;
        batch.set(newDestRef, {
          ...materialDataWithoutId,
          branchId: transferData.destinationBranchId,
          stock: transferData.quantity,
        });
      }

      // 3. Log the transfer
      const transferLogRef = doc(collection(db, "inventory_transfers"));
      batch.set(transferLogRef, {
        materialName: transferData.material.name,
        quantity: transferData.quantity,
        unit: transferData.material.unit,
        sourceBranchId: transferData.material.branchId,
        destinationBranchId: transferData.destinationBranchId,
        date: new Date().toISOString(),
        status: "completed",
      });

      // 4. Log stock movements
      const sourceMovementRef = doc(collection(db, "stock_movements"));
      batch.set(sourceMovementRef, {
        materialId: transferData.material.id,
        materialName: transferData.material.name,
        type: "out",
        quantity: transferData.quantity,
        unit: transferData.material.unit,
        date: new Date().toISOString(),
        source: "transfer_out",
        note: `تحويل إلى فرع: ${branches.find((b) => b.id === transferData.destinationBranchId)?.name || "غير محدد"}`,
      });

      const destMovementRef = doc(collection(db, "stock_movements"));
      batch.set(destMovementRef, {
        materialId: destMaterialId,
        materialName: transferData.material.name,
        type: "in",
        quantity: transferData.quantity,
        unit: transferData.material.unit,
        date: new Date().toISOString(),
        source: "transfer_in",
        note: `تحويل من فرع: ${branches.find((b) => b.id === transferData.material.branchId)?.name || "غير محدد"}`,
      });

      await batch.commit();
      setIsTransferModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "raw_materials");
    }
  };

  const handleSaveWaste = async () => {
    if (!wasteData.material || wasteData.quantity <= 0) {
      setValidationError("الرجاء إدخال كمية صحيحة");
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    if (wasteData.quantity > wasteData.material.stock) {
      setValidationError("الكمية تتجاوز المخزون الحالي");
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    try {
      const batch = writeBatch(db);
      const materialRef = doc(db, "raw_materials", wasteData.material.id);

      // Update stock
      batch.update(materialRef, {
        stock: wasteData.material.stock - wasteData.quantity,
      });

      // Log movement as waste/loss
      const movementRef = doc(collection(db, "stock_movements"));
      batch.set(movementRef, {
        materialId: wasteData.material.id,
        materialName: wasteData.material.name,
        type: "out",
        quantity: wasteData.quantity,
        unit: wasteData.material.unit,
        date: new Date().toISOString(),
        source: "waste",
        note: `تسجيل ${wasteData.reason}`,
      });

      await batch.commit();
      setIsWasteModalOpen(false);
      setWasteData({ material: null as any, quantity: 0, reason: "تالف" });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "raw_materials");
    }
  };

  const filteredMaterials = materials.filter((m) => {
    const matchesSearch = m.name
      ?.toLowerCase()
      .includes(searchTerm.toLowerCase());
    const isLowStock = m.stock <= (m.minStock || 0);
    const matchesLowStock = showLowStockOnly ? isLowStock : true;
    const matchesBranch =
      filterBranchId === "all" || m.branchId === filterBranchId;
    return matchesSearch && matchesLowStock && matchesBranch;
  });

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            المواد الخام
          </h1>
          <p className="text-muted">إدارة مخزون المواد الخام والمكونات</p>
        </div>
        {activeTab === "materials" && (
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>إضافة مادة خام</span>
          </button>
        )}
      </div>

      <div className="flex gap-4 mb-6 border-b border-border">
        <button
          onClick={() => setActiveTab("materials")}
          className={`pb-3 px-2 font-medium text-sm transition-colors relative ${
            activeTab === "materials"
              ? "text-primary-600"
              : "text-muted hover:text-foreground"
          }`}
        >
          المواد الخام
          {activeTab === "materials" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 rounded-t-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("transfers")}
          className={`pb-3 px-2 font-medium text-sm transition-colors relative ${
            activeTab === "transfers"
              ? "text-primary-600"
              : "text-muted hover:text-foreground"
          }`}
        >
          سجل التحويلات
          {activeTab === "transfers" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 rounded-t-full" />
          )}
        </button>
      </div>

      {activeTab === "materials" ? (
        <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4 justify-between items-center">
            <div className="relative w-full sm:w-96">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
              <input
                type="text"
                placeholder="بحث عن مادة خام..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-background border border-border rounded-lg pr-10 pl-4 py-2 text-foreground focus:outline-none focus:border-primary-500"
              />
            </div>
            <div className="flex w-full flex-wrap sm:flex-nowrap sm:w-auto gap-2">
              <select
                value={filterBranchId}
                onChange={(e) => setFilterBranchId(e.target.value)}
                className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary-500 flex-1 sm:flex-none min-w-[150px]"
              >
                <option value="all">كل الفروع/المخازن</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setShowLowStockOnly(!showLowStockOnly)}
                className={`px-4 py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors flex-1 sm:flex-none ${
                  showLowStockOnly
                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                    : "bg-background border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <Package className="w-4 h-4" />
                <span>نواقص المخزون</span>
              </button>
              <ExportButtons
                onExport={() =>
                  exportToExcel(filteredMaterials, "المواد_الخام")
                }
                onPrint={() =>
                  printTable("raw-materials-table", "المواد الخام")
                }
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table id="raw-materials-table" className="w-full text-right">
              <thead className="bg-surface-hover border-b border-border">
                <tr>
                  <th className="px-6 py-4 text-sm font-semibold text-foreground">
                    الاسم
                  </th>
                  <th className="px-6 py-4 text-sm font-semibold text-foreground">
                    الفرع/المخزن
                  </th>
                  <th className="px-6 py-4 text-sm font-semibold text-foreground">
                    الوحدة
                  </th>
                  <th className="px-6 py-4 text-sm font-semibold text-foreground">
                    التكلفة (د.ل)
                  </th>
                  <th className="px-6 py-4 text-sm font-semibold text-foreground">
                    المخزون
                  </th>
                  <th className="px-6 py-4 text-sm font-semibold text-foreground">
                    إجراءات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredMaterials.map((material) => {
                  const isLowStock = material.stock <= (material.minStock || 0);
                  return (
                    <tr
                      key={material.id}
                      className={`hover:bg-surface-hover/50 transition-colors ${isLowStock ? "bg-red-500/5" : ""}`}
                    >
                      <td className="px-6 py-4 text-foreground font-medium">
                        <div className="flex items-center gap-2">
                          {material.name}
                          {isLowStock && (
                            <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 text-[10px] font-bold flex items-center gap-1">
                              <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>
                              نواقص
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted">
                        {branches.find((b) => b.id === material.branchId)
                          ?.name || "غير محدد"}
                      </td>
                      <td className="px-6 py-4 text-muted">{material.unit}</td>
                      <td className="px-6 py-4 text-muted">
                        {material.costPerUnit}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-medium ${isLowStock ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}
                        >
                          {material.stock}
                        </span>
                        {isLowStock && (
                          <span className="text-[10px] text-red-500 block mt-1">
                            الحد الأدنى: {material.minStock || 0}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedMaterialForLedger(material);
                              setIsLedgerModalOpen(true);
                            }}
                            className="p-1.5 text-muted hover:text-primary-500 hover:bg-primary-500/10 rounded-lg transition-colors"
                            title="سجل حركات المخزون"
                          >
                            <History className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenTransferModal(material)}
                            className="p-1.5 text-muted hover:text-primary-500 hover:bg-primary-500/10 rounded-lg transition-colors"
                            title="تحويل لمخزن آخر"
                          >
                            <ArrowRightLeft className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setWasteData({ ...wasteData, material });
                              setIsWasteModalOpen(true);
                            }}
                            className="p-1.5 text-muted hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors"
                            title="تسجيل تالف/هدر"
                          >
                            <AlertTriangle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenModal(material)}
                            className="p-1.5 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => confirmDelete(material.id)}
                            className="p-1.5 text-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredMaterials.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-8 text-center text-muted-foreground"
                    >
                      لا توجد مواد خام
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden flex flex-col gap-4">
          <div className="flex justify-end p-4 border-b border-border">
            <ExportButtons
              onExport={() => exportToExcel(transfers, "سجل_التحويلات")}
              onPrint={() => printTable("transfers-table", "سجل التحويلات")}
            />
          </div>
          <div className="overflow-x-auto">
            <table id="transfers-table" className="w-full text-right">
              <thead className="bg-surface-hover border-b border-border">
                <tr>
                  <th className="px-6 py-4 text-sm font-semibold text-foreground">
                    التاريخ
                  </th>
                  <th className="px-6 py-4 text-sm font-semibold text-foreground">
                    المادة
                  </th>
                  <th className="px-6 py-4 text-sm font-semibold text-foreground">
                    الكمية
                  </th>
                  <th className="px-6 py-4 text-sm font-semibold text-foreground">
                    من فرع/مخزن
                  </th>
                  <th className="px-6 py-4 text-sm font-semibold text-foreground">
                    إلى فرع/مخزن
                  </th>
                  <th className="px-6 py-4 text-sm font-semibold text-foreground">
                    الحالة
                  </th>
                  <th className="px-6 py-4 text-sm font-semibold text-foreground w-16">
                    إجراءات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transfers.map((transfer) => (
                  <tr
                    key={transfer.id}
                    className="hover:bg-surface-hover/50 transition-colors"
                  >
                    <td className="px-6 py-4 text-muted">
                      {new Date(transfer.date).toLocaleString("ar-SA")}
                    </td>
                    <td className="px-6 py-4 text-foreground font-medium">
                      {transfer.materialName}
                    </td>
                    <td className="px-6 py-4 text-foreground font-bold">
                      {transfer.quantity} {transfer.unit}
                    </td>
                    <td className="px-6 py-4 text-muted">
                      {branches.find((b) => b.id === transfer.sourceBranchId)
                        ?.name || "غير محدد"}
                    </td>
                    <td className="px-6 py-4 text-muted">
                      {branches.find(
                        (b) => b.id === transfer.destinationBranchId,
                      )?.name || "غير محدد"}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400">
                        مكتمل
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => confirmDelete(transfer.id, "transfer")}
                        className="p-1.5 text-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                        title="حذف السجل"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {transfers.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-8 text-center text-muted-foreground"
                    >
                      لا توجد سجلات تحويل
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {isTransferModalOpen && transferData.material && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-md flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-primary-500" />
                تحويل مادة خام
              </h3>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="text-muted hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {validationError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                  {validationError}
                </div>
              )}

              <div className="bg-surface-hover p-3 rounded-lg border border-border">
                <div className="text-sm font-medium text-foreground mb-1">
                  {transferData.material.name}
                </div>
                <div className="text-xs text-muted flex justify-between">
                  <span>
                    من:{" "}
                    {branches.find(
                      (b) => b.id === transferData.material.branchId,
                    )?.name || "غير محدد"}
                  </span>
                  <span>
                    المتاح: {transferData.material.stock}{" "}
                    {transferData.material.unit}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  إلى الفرع/المخزن
                </label>
                <select
                  value={transferData.destinationBranchId}
                  onChange={(e) =>
                    setTransferData({
                      ...transferData,
                      destinationBranchId: e.target.value,
                    })
                  }
                  className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-primary-500"
                >
                  <option value="">اختر الفرع الوجهة</option>
                  {branches
                    .filter((b) => b.id !== transferData.material.branchId)
                    .map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  الكمية المراد تحويلها ({transferData.material.unit})
                </label>
                <input
                  type="number"
                  min="0"
                  max={transferData.material.stock}
                  value={transferData.quantity || ""}
                  onChange={(e) =>
                    setTransferData({
                      ...transferData,
                      quantity: Number(e.target.value),
                    })
                  }
                  className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>
            <div className="p-4 border-t border-border flex gap-2 shrink-0">
              <button
                onClick={handleTransfer}
                className="flex-1 bg-primary-600 hover:bg-primary-500 text-white py-2 rounded-lg font-medium transition-colors"
              >
                تأكيد التحويل
              </button>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="flex-1 bg-surface-hover hover:bg-border text-foreground py-2 rounded-lg font-medium transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ledger Modal */}
      {isLedgerModalOpen && selectedMaterialForLedger && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-4xl flex flex-col max-h-[90vh] shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <History className="w-5 h-5 text-primary-500" />
                  سجل حركات المخزون
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  المادة:{" "}
                  <span className="font-bold text-foreground">
                    {selectedMaterialForLedger.name}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setIsLedgerModalOpen(false)}
                className="text-muted hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-4 p-4 border-b border-border bg-surface-hover/50 shrink-0">
              <ExportButtons
                onExport={() => {
                  const ledgerEntries = stockMovements
                    .filter(
                      (m) => m.materialId === selectedMaterialForLedger.id,
                    )
                    .map((m) => ({
                      التاريخ: new Date(m.date).toLocaleString("ar-SA"),
                      النوع: m.type === "in" ? "وارد" : "منصرف",
                      الكمية: `${m.type === "in" ? "+" : "-"}${m.quantity} ${m.unit || ""}`,
                      "المصدر/الوجهة":
                        m.source === "initial_stock"
                          ? "رصيد افتتاحي"
                          : m.source === "manual_adjustment"
                            ? "تعديل يدوي"
                            : m.source === "purchase"
                              ? "مشتريات"
                              : m.source === "transfer"
                                ? "تحويل"
                                : m.source === "kitchen"
                                  ? "استهلاك مطبخ"
                                  : "غير معروف",
                      ملاحظات: m.note || "-",
                    }));
                  exportToExcel(ledgerEntries, "سجل_الحركات");
                }}
                onPrint={() =>
                  printTable(
                    "ledger-table",
                    `حركات المخزون - ${selectedMaterialForLedger.name}`,
                  )
                }
              />
            </div>
            <div className="p-0 overflow-y-auto pos-scroll flex-1">
              <table id="ledger-table" className="w-full text-right">
                <thead className="bg-surface-hover border-b border-border sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-4 text-sm font-semibold text-foreground">
                      التاريخ
                    </th>
                    <th className="px-6 py-4 text-sm font-semibold text-foreground">
                      النوع
                    </th>
                    <th className="px-6 py-4 text-sm font-semibold text-foreground">
                      الكمية
                    </th>
                    <th className="px-6 py-4 text-sm font-semibold text-foreground">
                      المصدر/الوجهة
                    </th>
                    <th className="px-6 py-4 text-sm font-semibold text-foreground">
                      ملاحظات
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stockMovements
                    .filter(
                      (m) => m.materialId === selectedMaterialForLedger.id,
                    )
                    .map((movement) => (
                      <tr
                        key={movement.id}
                        className="hover:bg-surface-hover/50 transition-colors"
                      >
                        <td className="px-6 py-4 text-muted">
                          {new Date(movement.date).toLocaleString("ar-SA")}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                              movement.type === "in"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-red-500/10 text-red-400"
                            }`}
                          >
                            {movement.type === "in" ? "وارد" : "منصرف"}
                          </span>
                        </td>
                        <td
                          className="px-6 py-4 text-foreground font-bold"
                          dir="ltr"
                        >
                          {movement.type === "in" ? "+" : "-"}
                          {movement.quantity} {movement.unit}
                        </td>
                        <td className="px-6 py-4 text-muted">
                          {movement.source === "initial_stock" &&
                            "رصيد افتتاحي"}
                          {movement.source === "manual_adjustment" &&
                            "تعديل يدوي"}
                          {movement.source === "purchase" && "مشتريات"}
                          {movement.source === "pos_sale" &&
                            "مبيعات (نقطة البيع)"}
                          {movement.source === "transfer_in" && "تحويل وارد"}
                          {movement.source === "transfer_out" && "تحويل صادر"}
                        </td>
                        <td className="px-6 py-4 text-muted text-sm">
                          {movement.note || "-"}
                        </td>
                      </tr>
                    ))}
                  {stockMovements.filter(
                    (m) => m.materialId === selectedMaterialForLedger.id,
                  ).length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-8 text-center text-muted-foreground"
                      >
                        لا توجد حركات مسجلة لهذه المادة
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-md flex flex-col max-h-[90vh] shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h3 className="text-lg font-bold text-foreground">
                {editingMaterial ? "تعديل مادة خام" : "إضافة مادة خام"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-muted hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto">
              {validationError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                  {validationError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  الاسم
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
                  الفرع/المخزن
                </label>
                <select
                  value={formData.branchId}
                  onChange={(e) =>
                    setFormData({ ...formData, branchId: e.target.value })
                  }
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                >
                  <option value="">اختر الفرع</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-muted">
                      الوحدة
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsUnitsModalOpen(true)}
                      className="text-xs text-primary-500 hover:text-primary-600"
                    >
                      إدارة الوحدات
                    </button>
                  </div>
                  <select
                    value={formData.unit}
                    onChange={(e) =>
                      setFormData({ ...formData, unit: e.target.value })
                    }
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                  >
                    {activeUnits.map((u: any) => (
                      <option key={u.id} value={u.name}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">
                    التكلفة للوحدة (د.ل)
                  </label>
                  <input
                    type="number"
                    value={formData.costPerUnit}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        costPerUnit: Number(e.target.value),
                      })
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
                    الحد الأدنى
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
            </div>
            <div className="p-4 border-t border-border shrink-0">
              <button
                onClick={handleSave}
                className="w-full bg-primary-600 hover:bg-primary-500 text-white py-2 rounded-lg font-medium transition-colors"
              >
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Units Management Modal */}
      {isUnitsModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-sm flex flex-col max-h-[90vh] shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h3 className="text-lg font-bold text-foreground">
                إدارة الوحدات
              </h3>
              <button
                onClick={() => setIsUnitsModalOpen(false)}
                className="text-muted hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex flex-col gap-4 overflow-y-auto">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                  placeholder="وحدة جديدة..."
                  onKeyPress={(e) => e.key === "Enter" && handleAddUnit()}
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
                <button
                  onClick={handleAddUnit}
                  className="bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  إضافة
                </button>
              </div>

              {validationError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                  {validationError}
                </div>
              )}

              <div className="space-y-2 mt-2">
                {activeUnits.map((u: any) => (
                  <div
                    key={u.id}
                    className="flex justify-between items-center p-3 bg-surface-hover border border-border rounded-lg"
                  >
                    <span className="text-foreground">{u.name}</span>
                    <button
                      onClick={() => handleDeleteUnit(u.id)}
                      className="text-muted hover:text-red-400 transition-colors p-1"
                      title="حذف الوحدة"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && itemToDelete && (
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
                {itemToDelete.type === "transfer"
                  ? "هل أنت متأكد من مسح سجل التحويل؟ (لن يتم تعديل المخزون)"
                  : "هل أنت متأكد من رغبتك في حذف هذه المادة؟ لا يمكن التراجع عن هذا الإجراء."}
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

      {/* Waste Modal */}
      {isWasteModalOpen && wasteData.material && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-sm flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                تسجيل تالف / هدر
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
                  {wasteData.material.name}
                </span>
                <span className="text-muted-foreground">
                  {wasteData.material.stock} {wasteData.material.unit} (متاح)
                </span>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  الكمية التالفة ({wasteData.material.unit})
                </label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  max={wasteData.material.stock}
                  value={wasteData.quantity || ""}
                  onChange={(e) =>
                    setWasteData({
                      ...wasteData,
                      quantity: Number(e.target.value),
                    })
                  }
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary-500"
                />
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
                  <option value="هدر">هدر (أثناء التحضير)</option>
                  <option value="استخدام شخصي/ضيافة">
                    استخدام شخصي / ضيافة
                  </option>
                  <option value="أخرى">سبب آخر (يرجى التوضيح)</option>
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
