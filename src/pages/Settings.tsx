import React, { useState, useEffect, useRef } from 'react';
import { Save, Printer, Receipt, Store, Percent, Bell, Palette, Users, Shield, Lock, Database, Tag, Edit2, Trash2, Plus, X, Check, Upload, Download, AlertTriangle } from 'lucide-react';
import { db, secondaryAuth } from '../firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, onSnapshot, doc, setDoc, deleteDoc, addDoc, getDocs, writeBatch } from 'firebase/firestore';
import { handleFirestoreError, OperationType, generateInternalEmail } from '../lib/firestoreUtils';
import { ExportButtons } from '../components/ExportButtons';
import { exportToExcel, printTable } from '../lib/exportUtils';

interface Permission {
  id: string;
  name: string;
  description: string;
  module: string;
}

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem?: boolean;
}

interface Coupon {
  id: string;
  code: string;
  type: string;
  value: number;
  expiryDate: string;
  status: string;
}

interface User {
  id: string;
  name: string;
  username?: string;
  email: string;
  roleId: string;
  status: string;
  driverStatus?: string;
  permissions?: string[];
  branchId?: string;
}

interface StoreSettings {
  nameAr: string;
  nameEn: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  website: string;
  crNumber: string;
  deliveryFee: number;
  invoicePrefix: string;
  currency: string;
  language: string;
  invoiceStartNumber: number;
}

interface AppearanceSettings {
  primaryColor: string;
  theme: string;
}

interface InvoiceSettings {
  logoUrl: string;
  headerText: string;
  footerText: string;
  itemLayout: 'compact' | 'detailed';
  printerType?: 'browser' | 'network';
  printerAddress?: string;
  paperSize?: 'A4' | 'A5' | '80mm' | '58mm';
  printCopies?: number;
}

interface NotificationSettings {
  newOrders: boolean;
  lowStock: boolean;
  kitchenDelays: boolean;
  dailyReports: boolean;
}

interface SecuritySettings {
  requireStrongPassword: boolean;
  twoFactorAuth: boolean;
  sessionTimeout: number;
}

interface BackupSettings {
  autoBackup: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  lastBackupDate: string | null;
}

const DEFAULT_STORE_SETTINGS: StoreSettings = {
  nameAr: 'نظام نقاط البيع للمطاعم',
  nameEn: 'Restaurant POS System',
  address: 'شارع الملك فهد',
  city: 'الرياض',
  phone: '0111234567',
  email: 'info@restaurant-pos.com',
  website: 'www.restaurant-pos.com',
  crNumber: 'CR-123456',
  deliveryFee: 15,
  invoicePrefix: 'INV',
  currency: 'LYD',
  language: 'ar',
  invoiceStartNumber: 1001
};

const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  primaryColor: '#f97316',
  theme: 'dark'
};

const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  logoUrl: '',
  headerText: 'مرحباً بكم في مطعمنا\nنتمنى لكم وجبة شهية',
  footerText: 'شكراً لزيارتكم\nنراكم قريباً',
  itemLayout: 'compact',
  printerType: 'browser',
  printerAddress: '',
  paperSize: '80mm',
  printCopies: 1
};

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  newOrders: true,
  lowStock: true,
  kitchenDelays: true,
  dailyReports: true
};

const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  requireStrongPassword: true,
  twoFactorAuth: false,
  sessionTimeout: 30
};

const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  autoBackup: true,
  backupFrequency: 'daily',
  lastBackupDate: null
};

const AVAILABLE_PERMISSIONS: Permission[] = [
  { id: 'pos.access', name: 'الوصول لنقطة البيع', module: 'نقطة البيع', description: 'السماح بفتح شاشة الكاشير وإجراء الطلبات' },
  { id: 'pos.discount', name: 'تطبيق خصم', module: 'نقطة البيع', description: 'السماح بتطبيق خصومات على الطلبات' },
  { id: 'pos.void', name: 'إلغاء طلب', module: 'نقطة البيع', description: 'السماح بإلغاء الطلبات بعد الدفع' },
  { id: 'kitchen.access', name: 'الوصول للمطبخ', module: 'المطبخ', description: 'السماح بعرض شاشة المطبخ وتحديث حالة الطلبات' },
  { id: 'inventory.view', name: 'عرض المخزون', module: 'المخزون', description: 'السماح برؤية المنتجات والكميات' },
  { id: 'inventory.edit', name: 'تعديل المخزون', module: 'المخزون', description: 'السماح بإضافة وتعديل وحذف المنتجات' },
  { id: 'product.availability', name: 'تغيير حالة توفر المنتج', module: 'المخزون', description: 'السماح بتغيير حالة توفر المنتج (متاح/غير متاح)' },
  { id: 'reports.view', name: 'عرض التقارير', module: 'التقارير', description: 'السماح برؤية تقارير المبيعات والأداء' },
  { id: 'settings.access', name: 'إدارة الإعدادات', module: 'الإعدادات', description: 'السماح بتعديل إعدادات النظام' },
  { id: 'users.manage', name: 'إدارة المستخدمين', module: 'المستخدمين', description: 'السماح بإضافة وتعديل المستخدمين والصلاحيات' },
  { id: 'driver.access', name: 'شاشة المندوب', module: 'التوصيل', description: 'السماح بعرض شاشة المندوب واستلام الطلبات' },
  { id: 'branches.view_all', name: 'عرض كل الفروع', module: 'الفروع', description: 'السماح برؤية البيانات لجميع الفروع بدلا من فرع المستخدم فقط' }
];

const DEFAULT_ROLES: Role[] = [
  {
    id: 'admin',
    name: 'مدير النظام',
    description: 'صلاحيات كاملة على جميع أجزاء النظام',
    permissions: AVAILABLE_PERMISSIONS.map(p => p.id),
    isSystem: true
  },
  {
    id: 'manager',
    name: 'مدير فرع',
    description: 'إدارة الفرع والتقارير والمخزون',
    permissions: ['pos.access', 'pos.discount', 'pos.void', 'kitchen.access', 'inventory.view', 'inventory.edit', 'reports.view', 'product.availability', 'branches.view_all'],
    isSystem: true
  },
  {
    id: 'cashier',
    name: 'كاشير',
    description: 'استقبال الطلبات والمدفوعات',
    permissions: ['pos.access', 'product.availability'],
    isSystem: true
  },
  {
    id: 'chef',
    name: 'طباخ',
    description: 'إدارة شاشة المطبخ',
    permissions: ['kitchen.access', 'product.availability'],
    isSystem: true
  },
  {
    id: 'driver',
    name: 'مندوب توصيل',
    description: 'توصيل الطلبات للعملاء',
    permissions: ['driver.access'],
    isSystem: true
  }
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState('users');
  const [roles, setRoles] = useState<Role[]>(DEFAULT_ROLES);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetStep, setResetStep] = useState(1);
  const [isBackupBeforeReset, setIsBackupBeforeReset] = useState(true);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [fileToRestore, setFileToRestore] = useState<File | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [newUserPassword, setNewUserPassword] = useState('');
  
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [appearanceSettings, setAppearanceSettings] = useState<AppearanceSettings>(DEFAULT_APPEARANCE_SETTINGS);
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings>(DEFAULT_INVOICE_SETTINGS);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings>(DEFAULT_SECURITY_SETTINGS);
  const [backupSettings, setBackupSettings] = useState<BackupSettings>(DEFAULT_BACKUP_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string, type: 'user' | 'role' | 'coupon' } | null>(null);

  useEffect(() => {
    const unsubscribeRoles = onSnapshot(collection(db, 'roles'), (snapshot) => {
      const rolesData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Role[];
      const defaultRoleIds = DEFAULT_ROLES.map(r => r.id);
      const customRoles = rolesData.filter(r => !r.isSystem && !defaultRoleIds.includes(r.id));
      setRoles([...DEFAULT_ROLES, ...customRoles]);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'roles');
    });

    const unsubscribeCoupons = onSnapshot(collection(db, 'coupons'), (snapshot) => {
      const couponsData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Coupon[];
      setCoupons(couponsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'coupons');
    });

    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as User[];
      setUsers(usersData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    const unsubscribeBranches = onSnapshot(collection(db, 'branches'), (snapshot) => {
      const branchesData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setBranches(branchesData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'branches');
    });

    const unsubscribeStoreSettings = onSnapshot(doc(db, 'settings', 'general'), (docSnap) => {
      if (docSnap.exists()) {
        setStoreSettings(docSnap.data() as StoreSettings);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/general');
    });

    const unsubscribeAppearanceSettings = onSnapshot(doc(db, 'settings', 'appearance'), (docSnap) => {
      if (docSnap.exists()) {
        setAppearanceSettings(docSnap.data() as AppearanceSettings);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/appearance');
    });

    const unsubscribeInvoiceSettings = onSnapshot(doc(db, 'settings', 'invoice'), (docSnap) => {
      if (docSnap.exists()) {
        setInvoiceSettings(docSnap.data() as InvoiceSettings);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/invoice');
    });

    const unsubscribeNotifications = onSnapshot(doc(db, 'settings', 'notifications'), (docSnap) => {
      if (docSnap.exists()) {
        setNotificationSettings(docSnap.data() as NotificationSettings);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/notifications');
    });

    const unsubscribeSecurity = onSnapshot(doc(db, 'settings', 'security'), (docSnap) => {
      if (docSnap.exists()) {
        setSecuritySettings(docSnap.data() as SecuritySettings);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/security');
    });

    const unsubscribeBackup = onSnapshot(doc(db, 'settings', 'backup'), (docSnap) => {
      if (docSnap.exists()) {
        setBackupSettings(docSnap.data() as BackupSettings);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/backup');
    });

    return () => {
      unsubscribeRoles();
      unsubscribeCoupons();
      unsubscribeUsers();
      unsubscribeBranches();
      unsubscribeStoreSettings();
      unsubscribeAppearanceSettings();
      unsubscribeInvoiceSettings();
      unsubscribeNotifications();
      unsubscribeSecurity();
      unsubscribeBackup();
    };
  }, []);

  const handleSaveRole = async (role: Role) => {
    try {
      if (role.id && !role.id.toString().startsWith('temp_')) {
        await setDoc(doc(db, 'roles', role.id), {
          name: role.name,
          description: role.description,
          permissions: role.permissions,
          isSystem: false
        });
      } else {
        await addDoc(collection(db, 'roles'), {
          name: role.name,
          description: role.description,
          permissions: role.permissions,
          isSystem: false
        });
      }
      setShowRoleModal(false);
      setEditingRole(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'roles');
    }
  };

  const handleSaveCoupon = async (coupon: Coupon) => {
    try {
      if (coupon.id && !coupon.id.toString().startsWith('temp_')) {
        await setDoc(doc(db, 'coupons', coupon.id), {
          code: coupon.code,
          type: coupon.type,
          value: Number(coupon.value),
          expiryDate: coupon.expiryDate,
          status: coupon.status
        });
      } else {
        await addDoc(collection(db, 'coupons'), {
          code: coupon.code,
          type: coupon.type,
          value: Number(coupon.value),
          expiryDate: coupon.expiryDate,
          status: coupon.status
        });
      }
      setShowCouponModal(false);
      setEditingCoupon(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'coupons');
    }
  };

  const handleSaveUser = async (user: User) => {
    try {
      const isNewUser = user.id && user.id.toString().startsWith('temp_');
      
      let finalEmail = (user.email || '').trim();
      let finalUsername = (user.username || (finalEmail.includes('@') ? finalEmail.split('@')[0] : finalEmail)).trim();

      if (!finalEmail.includes('@') || finalEmail.endsWith('@restaurant.internal')) {
        if (!finalUsername) {
          setValidationError('يرجى إدخال اسم مستخدم');
          setTimeout(() => setValidationError(null), 3000);
          return;
        }
        finalEmail = generateInternalEmail(finalUsername);
      } else {
        finalEmail = finalEmail.toLowerCase();
      }

      if (isNewUser) {
        if (!newUserPassword || newUserPassword.length < 6) {
          setValidationError('يرجى إدخال كلمة مرور صالحة (6 أحرف على الأقل)');
          setTimeout(() => setValidationError(null), 3000);
          return;
        }
        try {
          const userCredential = await createUserWithEmailAndPassword(secondaryAuth, finalEmail, newUserPassword);
          const { updateProfile } = await import('firebase/auth');
          await updateProfile(userCredential.user, { displayName: user.name });
          await secondaryAuth.signOut().catch(e => console.error("Sign out error:", e)); // Sign out the newly created user from the secondary app
        } catch (authError: any) {
          console.error('Error creating user in Firebase Auth:', authError);
          if (authError.code === 'auth/email-already-in-use') {
             setValidationError('اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل.');
          } else if (authError.code === 'auth/invalid-email') {
             setValidationError('اسم المستخدم أو البريد الإلكتروني غير صالح. يرجى استخدام أحرف إنجليزية وأرقام فقط.');
          } else {
             setValidationError('حدث خطأ أثناء إنشاء حساب المستخدم. تأكد من تفعيل تسجيل الدخول بالبريد الإلكتروني في Firebase.');
          }
          setTimeout(() => setValidationError(null), 3000);
          return; // Stop if auth creation fails
        }
      }

      // Use raw username as the document ID for users so direct local fallback auth works
      const userDocRef = doc(db, 'users', finalUsername);
      
      const userData: any = {
        name: user.name,
        username: finalUsername,
        roleId: user.roleId,
        role: user.roleId, // to match picture
        status: user.status,
        permissions: user.permissions || [],
        branchId: user.branchId || ''
      };

      if (isNewUser) {
        userData.id = Date.now().toString();
        userData.createdAt = new Date().toISOString();
      }

      if (newUserPassword) {
         userData.password = newUserPassword;
      }

      if (isNewUser) {
         await setDoc(userDocRef, userData);
      } else {
         await setDoc(userDocRef, userData, { merge: true });
      }
      
      setShowUserModal(false);
      setEditingUser(null);
      setNewUserPassword('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users');
    }
  };

  const confirmDelete = (id: string, type: 'user' | 'role' | 'coupon') => {
    setItemToDelete({ id, type });
    setIsDeleteModalOpen(true);
  };

  const executeDelete = async () => {
    if (!itemToDelete) return;
    try {
      let collectionName = '';
      if (itemToDelete.type === 'user') collectionName = 'users';
      else if (itemToDelete.type === 'role') collectionName = 'roles';
      else if (itemToDelete.type === 'coupon') collectionName = 'coupons';

      await deleteDoc(doc(db, collectionName, itemToDelete.id));
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, itemToDelete.type === 'user' ? 'users' : itemToDelete.type === 'role' ? 'roles' : 'coupons');
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBackup = async () => {
    setIsSaving(true);
    try {
      const collectionsToBackup = [
        'orders', 'kitchen_orders', 'employees', 'branches', 'payroll', 
        'accounts', 'dailyTransactions', 'raw_materials', 'roles', 'coupons', 
        'users', 'products', 'product_categories', 'costings', 'partners', 
        'purchases', 'kitchen_stations', 'expense_categories', 'invoices', 'settings'
      ];

      const backupData: Record<string, any[]> = {};

      for (const colName of collectionsToBackup) {
        const querySnapshot = await getDocs(collection(db, colName));
        backupData[colName] = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      const backupString = JSON.stringify(backupData);
      const blob = new Blob([backupString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const newBackupSettings = { ...backupSettings, lastBackupDate: new Date().toISOString() };
      setBackupSettings(newBackupSettings);
      await setDoc(doc(db, 'settings', 'backup'), newBackupSettings);

      setSuccessMessage('تم إنشاء نسخة احتياطية بنجاح');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error("Backup failed:", error);
      setValidationError('حدث خطأ أثناء إنشاء النسخة الاحتياطية');
      setTimeout(() => setValidationError(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestore = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileToRestore(file);
    setIsRestoreModalOpen(true);
  };

  const executeRestore = async () => {
    if (!fileToRestore) return;
    setIsRestoreModalOpen(false);
    setIsSaving(true);
    try {
      const text = await fileToRestore.text();
      const backupData = JSON.parse(text);

      let batch = writeBatch(db);
      let operationCount = 0;

      for (const [colName, docs] of Object.entries(backupData)) {
        if (Array.isArray(docs)) {
          for (const docData of docs) {
            const { id, ...data } = docData;
            if (id) {
              const docRef = doc(db, colName, id);
              batch.set(docRef, data);
              operationCount++;

              if (operationCount >= 450) {
                await batch.commit();
                batch = writeBatch(db);
                operationCount = 0;
              }
            }
          }
        }
      }

      if (operationCount > 0) {
        await batch.commit();
      }

      setSuccessMessage('تم استعادة النسخة الاحتياطية بنجاح');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error("Restore failed:", error);
      setValidationError('حدث خطأ أثناء استعادة النسخة الاحتياطية. يرجى التأكد من صحة الملف.');
      setTimeout(() => setValidationError(null), 3000);
    } finally {
      setIsSaving(false);
      setFileToRestore(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleResetData = () => {
    setResetStep(1);
    setIsBackupBeforeReset(backupSettings?.autoBackup ?? true);
    setIsResetModalOpen(true);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) { // 1MB limit check
        setValidationError('حجم الصورة يجب أن لا يتجاوز 1 ميجابايت');
        setTimeout(() => setValidationError(null), 3000);
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setInvoiceSettings({ ...invoiceSettings, logoUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const confirmAndExecuteReset = async () => {
    if (isBackupBeforeReset) {
       await handleBackup();
    }
    await executeResetData();
  };

  const executeResetData = async () => {
    setIsResetModalOpen(false);
    setIsSaving(true);
    try {
      const collectionsToClear = [
        'orders', 'kitchen_orders', 'employees', 'branches', 'payroll',
        'accounts', 'dailyTransactions', 'raw_materials', 'coupons',
        'products', 'product_categories', 'costings', 'partners',
        'purchases', 'kitchen_stations', 'expense_categories', 'income_categories', 'invoices',
        'inventory_transfers', 'stock_movements'
      ];

      let batch = writeBatch(db);
      let operationCount = 0;

      for (const colName of collectionsToClear) {
        const querySnapshot = await getDocs(collection(db, colName));
        for (const docSnapshot of querySnapshot.docs) {
          batch.delete(docSnapshot.ref);
          operationCount++;

          if (operationCount >= 450) {
            await batch.commit();
            batch = writeBatch(db);
            operationCount = 0;
          }
        }
      }

      if (operationCount > 0) {
        await batch.commit();
      }

      setSuccessMessage('تم مسح جميع البيانات بنجاح');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error("Reset failed:", error);
      setValidationError('حدث خطأ أثناء مسح البيانات');
      setTimeout(() => setValidationError(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'general'), storeSettings);
      await setDoc(doc(db, 'settings', 'appearance'), appearanceSettings);
      await setDoc(doc(db, 'settings', 'invoice'), invoiceSettings);
      await setDoc(doc(db, 'settings', 'notifications'), notificationSettings);
      await setDoc(doc(db, 'settings', 'security'), securitySettings);
      await setDoc(doc(db, 'settings', 'backup'), backupSettings);
      setSuccessMessage('تم حفظ التغييرات بنجاح');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings');
      setValidationError('حدث خطأ أثناء حفظ التغييرات');
      setTimeout(() => setValidationError(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const tabs = [
    { id: 'general', label: 'عام', icon: Store },
    { id: 'appearance', label: 'المظهر', icon: Palette },
    { id: 'users', label: 'المستخدمين', icon: Users },
    { id: 'permissions', label: 'الصلاحيات', icon: Shield },
    { id: 'notifications', label: 'الإشعارات', icon: Bell },
    { id: 'printers', label: 'الطباعة', icon: Printer },
    { id: 'security', label: 'الأمان', icon: Lock },
    { id: 'backup', label: 'النسخ الاحتياطي', icon: Database },
    { id: 'coupons', label: 'الكوبونات', icon: Tag },
  ];

  return (
    <div className="p-6 bg-background min-h-full text-foreground" dir="rtl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">الإعدادات</h1>
          <p className="text-muted">إدارة إعدادات النظام وتخصيص نقطة البيع</p>
        </div>
        <button 
          onClick={handleSaveChanges}
          disabled={isSaving}
          className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg flex items-center gap-2 font-medium transition-colors"
        >
          <Save className="w-5 h-5" />
          <span>{isSaving ? 'جاري الحفظ...' : 'حفظ التغييرات'}</span>
        </button>
      </div>

      {validationError && (
        <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm">
          {validationError}
        </div>
      )}
      
      {successMessage && (
        <div className="mb-6 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <Check className="w-4 h-4" />
          {successMessage}
        </div>
      )}

      <div className="flex flex-col gap-6">
        {/* Horizontal Tabs */}
        <div className="w-full overflow-x-auto hide-scrollbar">
          <div className="flex gap-2 min-w-max pb-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive 
                      ? 'bg-primary-600 text-white' 
                      : 'bg-surface text-muted hover:bg-surface-hover hover:text-slate-200 border border-border'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 bg-surface border border-border rounded-xl p-6">
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-primary-500/20 flex items-center justify-center">
                  <Store className="w-5 h-5 text-primary-500" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">معلومات المتجر</h2>
                  <p className="text-xs text-muted">بيانات المتجر الأساسية</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">اسم المتجر (عربي)</label>
                  <input 
                    type="text" 
                    value={storeSettings.nameAr || ''}
                    onChange={(e) => setStoreSettings({ ...storeSettings, nameAr: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">اسم المتجر (إنجليزي)</label>
                  <input 
                    type="text" 
                    value={storeSettings.nameEn || ''}
                    onChange={(e) => setStoreSettings({ ...storeSettings, nameEn: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-left"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">العنوان</label>
                  <input 
                    type="text" 
                    value={storeSettings.address || ''}
                    onChange={(e) => setStoreSettings({ ...storeSettings, address: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">المدينة</label>
                  <input 
                    type="text" 
                    value={storeSettings.city || ''}
                    onChange={(e) => setStoreSettings({ ...storeSettings, city: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">الهاتف</label>
                  <input 
                    type="text" 
                    value={storeSettings.phone || ''}
                    onChange={(e) => setStoreSettings({ ...storeSettings, phone: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-left"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">البريد الإلكتروني</label>
                  <input 
                    type="email" 
                    value={storeSettings.email || ''}
                    onChange={(e) => setStoreSettings({ ...storeSettings, email: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-left"
                    dir="ltr"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-muted mb-2">الموقع الإلكتروني</label>
                  <input 
                    type="url" 
                    value={storeSettings.website || ''}
                    onChange={(e) => setStoreSettings({ ...storeSettings, website: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-left"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="h-px bg-surface-hover my-8"></div>

              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <Receipt className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">الرسوم والسجل التجاري</h2>
                  <p className="text-xs text-muted">بيانات التوصيل والتراخيص</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">قيمة التوصيل</label>
                  <input 
                    type="number" 
                    value={storeSettings.deliveryFee || 0}
                    onChange={(e) => setStoreSettings({ ...storeSettings, deliveryFee: Number(e.target.value) })}
                    className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-left"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">السجل التجاري</label>
                  <input 
                    type="text" 
                    value={storeSettings.crNumber || ''}
                    onChange={(e) => setStoreSettings({ ...storeSettings, crNumber: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-left"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">بادئة الفاتورة</label>
                  <input 
                    type="text" 
                    value={storeSettings.invoicePrefix || ''}
                    onChange={(e) => setStoreSettings({ ...storeSettings, invoicePrefix: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-left"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="h-px bg-surface-hover my-8"></div>

              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Database className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">النظام والعملة</h2>
                  <p className="text-xs text-muted">إعدادات العملة والتوقيت</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">العملة</label>
                  <select 
                    value={storeSettings.currency || ''}
                    onChange={(e) => setStoreSettings({ ...storeSettings, currency: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="LYD">دينار ليبي (د.ل)</option>
                    <option value="SAR">ريال سعودي (ر.س)</option>
                    <option value="USD">دولار أمريكي ($)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">اللغة</label>
                  <select 
                    value={storeSettings.language || ''}
                    onChange={(e) => setStoreSettings({ ...storeSettings, language: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="ar">العربية</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">رقم بدء الفواتير</label>
                  <input 
                    type="number" 
                    value={storeSettings.invoiceStartNumber || 1}
                    onChange={(e) => setStoreSettings({ ...storeSettings, invoiceStartNumber: Number(e.target.value) })}
                    className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-left"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <Palette className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">المظهر والألوان</h2>
                  <p className="text-xs text-muted">تخصيص ألوان وشعار النظام</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-muted mb-2">شعار النظام</label>
                  <div className="flex items-center gap-4">
                    <div className="w-24 h-24 bg-background border-2 border-dashed border-border rounded-xl flex items-center justify-center">
                      <Store className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <div>
                      <button className="bg-surface-hover text-foreground px-4 py-2 rounded-lg text-sm hover:bg-slate-700 transition-colors">
                        تغيير الشعار
                      </button>
                      <p className="text-xs text-muted-foreground mt-2">PNG, JPG حتى 2MB</p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted mb-2">اللون الأساسي</label>
                  <div className="flex gap-3">
                    {['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899'].map((color) => (
                      <button
                        key={color}
                        onClick={() => setAppearanceSettings({ ...appearanceSettings, primaryColor: color })}
                        className={`w-8 h-8 rounded-full border-2 ${appearanceSettings.primaryColor === color ? 'border-white' : 'border-transparent'}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted mb-2">نمط الواجهة</label>
                  <select 
                    value={appearanceSettings.theme || 'light'}
                    onChange={(e) => setAppearanceSettings({ ...appearanceSettings, theme: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="dark">داكن (افتراضي)</option>
                    <option value="light">فاتح</option>
                    <option value="system">حسب النظام</option>
                  </select>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'users' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Users className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground">المستخدمين</h2>
                    <p className="text-xs text-muted">إدارة حسابات الموظفين</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    const defaultRole = roles.find(r => r.id === 'cashier') || roles[0];
                    setEditingUser({ 
                      id: 'temp_' + Date.now(), 
                      name: '', 
                      email: '', 
                      roleId: defaultRole?.id || 'cashier', 
                      status: 'نشط',
                      permissions: defaultRole?.permissions || []
                    });
                    setNewUserPassword('');
                    setShowUserModal(true);
                  }}
                  className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة مستخدم جديد</span>
                </button>
                <div className="mr-2">
                  <ExportButtons 
                    onExport={() => exportToExcel(users, 'المستخدمين')}
                    onPrint={() => printTable('users-table', 'المستخدمين')}
                  />
                </div>
              </div>

              <div className="bg-background border border-border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table id="users-table" className="w-full text-right">
                    <thead>
                      <tr className="border-b border-border bg-surface">
                        <th className="px-4 py-3 text-sm font-medium text-muted">الاسم</th>
                        <th className="px-4 py-3 text-sm font-medium text-muted">اسم المستخدم</th>
                        <th className="px-4 py-3 text-sm font-medium text-muted">البريد الإلكتروني</th>
                        <th className="px-4 py-3 text-sm font-medium text-muted">الدور</th>
                        <th className="px-4 py-3 text-sm font-medium text-muted">الحالة</th>
                        <th className="px-4 py-3 text-sm font-medium text-muted">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {users.map((user) => {
                        const userRole = roles.find(r => r.id === user.roleId);
                        return (
                          <tr key={user.id} className="hover:bg-surface-hover/50 transition-colors">
                            <td className="px-4 py-3 text-sm font-medium text-foreground">{user.name}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground" dir="ltr">{user.username || (user.email ? user.email.split('@')[0] : '')}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground" dir="ltr">{user.email || ''}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{userRole?.name || 'غير محدد'}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 text-xs rounded-full ${user.status === 'نشط' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                {user.status}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => {
                                    const userRole = roles.find(r => r.id === user.roleId);
                                    setEditingUser({
                                      ...user,
                                      permissions: user.permissions || userRole?.permissions || []
                                    });
                                    setShowUserModal(true);
                                  }}
                                  className="p-1.5 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => {
                                    setItemToDelete({ id: user.id, type: 'user' });
                                    setIsDeleteModalOpen(true);
                                  }}
                                  className="p-1.5 text-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {users.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                            لا يوجد مستخدمين مضافين
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'permissions' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground">الصلاحيات والأدوار</h2>
                    <p className="text-xs text-muted">تحديد صلاحيات كل دور في النظام</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setEditingRole({ id: 'temp_' + Date.now(), name: '', description: '', permissions: [] });
                    setShowRoleModal(true);
                  }}
                  className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة دور جديد</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {roles.map((role) => (
                  <div key={role.id} className="bg-background border border-border rounded-xl p-5 flex flex-col">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="text-base font-bold text-foreground">{role.name}</h3>
                        <p className="text-xs text-muted mt-1">{role.description}</p>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            setEditingRole(role);
                            setShowRoleModal(true);
                          }}
                          className="p-1.5 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {!role.isSystem && (
                          <button 
                            onClick={() => confirmDelete(role.id, 'role')}
                            className="p-1.5 text-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-auto pt-4 border-t border-border">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted">الصلاحيات الممنوحة:</span>
                        <span className="bg-primary-500/20 text-primary-400 px-2 py-1 rounded-md font-medium">
                          {role.permissions.length} صلاحية
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                  <Bell className="w-5 h-5 text-yellow-500" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">الإشعارات والتنبيهات</h2>
                  <p className="text-xs text-muted">إعدادات التنبيهات الصوتية والمرئية</p>
                </div>
              </div>
              <div className="space-y-3">
                {[
                  { id: 'newOrders', title: 'إشعارات الطلبات الجديدة', desc: 'تنبيه صوتي ومرئي عند وصول طلب جديد من العملاء أو تطبيقات التوصيل' },
                  { id: 'lowStock', title: 'تنبيهات المخزون', desc: 'إشعار عند انخفاض كمية منتج في المخزن عن الحد الأدنى' },
                  { id: 'kitchenDelays', title: 'إشعارات المطبخ', desc: 'تنبيه عند تأخر تحضير الطلب في المطبخ عن الوقت المحدد' },
                  { id: 'dailyReports', title: 'التقارير اليومية', desc: 'إرسال ملخص المبيعات اليومي عبر البريد الإلكتروني' },
                ].map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-4 bg-background border border-border rounded-lg">
                    <div>
                      <h3 className="text-sm font-medium text-foreground">{item.title}</h3>
                      <p className="text-xs text-muted mt-1">{item.desc}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={notificationSettings[item.id as keyof NotificationSettings]} 
                        onChange={(e) => setNotificationSettings({...notificationSettings, [item.id]: e.target.checked})}
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-surface-hover peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'printers' && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-slate-500/20 flex items-center justify-center">
                  <Printer className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">الطباعة والفواتير</h2>
                  <p className="text-xs text-muted">إعدادات الطابعات وتصميم الفاتورة</p>
                </div>
              </div>

              <div className="bg-surface-hover rounded-xl p-6 border border-slate-800">
                <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-primary-500" />
                  تخصيص الفاتورة
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-2">الشعار (Logo)</label>
                      <div className="flex gap-2">
                        <label className="flex-1 cursor-pointer bg-surface-hover hover:bg-slate-700 border border-slate-700 rounded-lg px-4 py-2.5 text-center text-sm font-medium transition-colors">
                          <span>اختيار ملف (Max 1MB)</span>
                          <input 
                            type="file" 
                            accept="image/*" 
                            onChange={handleLogoUpload}
                            className="hidden" 
                          />
                        </label>
                        <input
                          type="text"
                          value={invoiceSettings.logoUrl || ''}
                          onChange={(e) => setInvoiceSettings({ ...invoiceSettings, logoUrl: e.target.value })}
                          className="flex-[2] bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-foreground focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm"
                          placeholder="أو ضع رابط مباشر للصورة هنا"
                          dir="ltr"
                        />
                      </div>
                      {invoiceSettings.logoUrl && (
                        <div className="mt-2 text-right">
                          <button 
                            onClick={() => setInvoiceSettings({ ...invoiceSettings, logoUrl: '' })}
                            className="text-xs text-red-500 hover:text-red-400"
                          >
                            إزالة الشعار
                          </button>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-2">النص العلوي (Header)</label>
                      <textarea
                        value={invoiceSettings.headerText || ''}
                        onChange={(e) => setInvoiceSettings({ ...invoiceSettings, headerText: e.target.value })}
                        className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-foreground focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none min-h-[100px]"
                        placeholder="مرحباً بكم في مطعمنا..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-2">النص السفلي (Footer)</label>
                      <textarea
                        value={invoiceSettings.footerText || ''}
                        onChange={(e) => setInvoiceSettings({ ...invoiceSettings, footerText: e.target.value })}
                        className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-foreground focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none min-h-[100px]"
                        placeholder="شكراً لزيارتكم..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-2">تخطيط العناصر (Item Layout)</label>
                      <select
                        value={invoiceSettings.itemLayout || 'compact'}
                        onChange={(e) => setInvoiceSettings({ ...invoiceSettings, itemLayout: e.target.value as 'compact' | 'detailed' })}
                        className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-foreground focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      >
                        <option value="compact">مضغوط (Compact)</option>
                        <option value="detailed">مفصل (Detailed)</option>
                      </select>
                    </div>
                    
                    <div className="pt-4 border-t border-slate-700/50 mt-4">
                      <h4 className="text-md font-semibold text-foreground mb-4">إعدادات الطباعة</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-2">نوع الطابعة</label>
                          <select
                            value={invoiceSettings.printerType || 'browser'}
                            onChange={(e) => setInvoiceSettings({ ...invoiceSettings, printerType: e.target.value as 'browser' | 'network' })}
                            className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-foreground focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                          >
                            <option value="browser">طابعة المتصفح الافتراضية</option>
                            <option value="network">طابعة شبكة (IP)</option>
                          </select>
                        </div>
                        
                        {invoiceSettings.printerType === 'network' && (
                          <div>
                            <label className="block text-sm font-medium text-muted-foreground mb-2">عنوان الطابعة (IP Address)</label>
                            <input
                              type="text"
                              value={invoiceSettings.printerAddress || ''}
                              onChange={(e) => setInvoiceSettings({ ...invoiceSettings, printerAddress: e.target.value })}
                              className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-foreground focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                              placeholder="192.168.1.100"
                            />
                          </div>
                        )}
                        
                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-2">حجم الورق</label>
                          <select
                            value={invoiceSettings.paperSize || '80mm'}
                            onChange={(e) => setInvoiceSettings({ ...invoiceSettings, paperSize: e.target.value as 'A4' | 'A5' | '80mm' | '58mm' })}
                            className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-foreground focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                          >
                            <option value="80mm">إيصال 80 مم</option>
                            <option value="58mm">إيصال 58 مم</option>
                            <option value="A4">ورق A4</option>
                            <option value="A5">ورق A5</option>
                          </select>
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-2">عدد النسخ</label>
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={invoiceSettings.printCopies || 1}
                            onChange={(e) => setInvoiceSettings({ ...invoiceSettings, printCopies: parseInt(e.target.value) || 1 })}
                            className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-foreground focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Preview Section */}
                  <div className="bg-white rounded-lg p-6 text-black shadow-inner min-h-[400px] flex flex-col max-w-sm mx-auto w-full">
                    <div className="text-center mb-6 border-b border-dashed border-gray-300 pb-4">
                      {invoiceSettings.logoUrl ? (
                        <img src={invoiceSettings.logoUrl} alt="Logo" className="h-16 mx-auto mb-2 object-contain" />
                      ) : (
                        <div className="w-16 h-16 bg-gray-200 rounded-full mx-auto mb-2 flex items-center justify-center">
                          <Store className="w-8 h-8 text-gray-400" />
                        </div>
                      )}
                      <h2 className="font-bold text-xl">{storeSettings.nameAr}</h2>
                      <div className="text-sm text-gray-600 whitespace-pre-wrap mt-2">{invoiceSettings.headerText}</div>
                    </div>
                    
                    <div className="flex-1">
                      <div className="text-xs text-gray-500 mb-2 flex justify-between">
                        <span>رقم الفاتورة: #1001</span>
                        <span>التاريخ: {new Date().toLocaleDateString('ar-SA')}</span>
                      </div>
                      
                      <table className="w-full text-sm mb-4">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-right py-1">الصنف</th>
                            <th className="text-center py-1">الكمية</th>
                            <th className="text-left py-1">السعر</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="py-1">برجر لحم</td>
                            <td className="text-center py-1">2</td>
                            <td className="text-left py-1">50.00</td>
                          </tr>
                          {invoiceSettings.itemLayout === 'detailed' && (
                            <tr>
                              <td colSpan={3} className="text-xs text-gray-500 pb-1">- بدون بصل</td>
                            </tr>
                          )}
                          <tr>
                            <td className="py-1">بطاطس مقلية</td>
                            <td className="text-center py-1">1</td>
                            <td className="text-left py-1">15.00</td>
                          </tr>
                        </tbody>
                      </table>
                      
                      <div className="border-t border-gray-200 pt-2 space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span>المجموع</span>
                          <span>65.00</span>
                        </div>
                        <div className="flex justify-between font-bold text-lg pt-1 border-t border-gray-200">
                          <span>الإجمالي</span>
                          <span>65.00</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-center mt-6 border-t border-dashed border-gray-300 pt-4">
                      <div className="text-sm text-gray-600 whitespace-pre-wrap">{invoiceSettings.footerText}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-8 text-center border-2 border-dashed border-border rounded-xl mt-6">
                <Printer className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="text-lg font-medium text-foreground mb-1">لا توجد طابعات مضافة</h3>
                <p className="text-sm text-muted mb-4">قم بإضافة طابعة كاشير أو طابعة مطبخ لتبدأ</p>
                <button className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm transition-colors">
                  + إضافة طابعة جديدة
                </button>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                  <Lock className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">الأمان وحماية البيانات</h2>
                  <p className="text-xs text-muted">إعدادات الأمان وتسجيل الدخول</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-background border border-border rounded-xl p-6">
                  <h3 className="text-sm font-bold text-foreground mb-4">سياسة كلمات المرور</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">كلمات مرور قوية</p>
                        <p className="text-xs text-muted mt-1">إلزام المستخدمين بكلمات مرور معقدة</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={securitySettings.requireStrongPassword}
                          onChange={(e) => setSecuritySettings({...securitySettings, requireStrongPassword: e.target.checked})}
                          className="sr-only peer" 
                        />
                        <div className="w-11 h-6 bg-surface-hover peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="bg-background border border-border rounded-xl p-6">
                  <h3 className="text-sm font-bold text-foreground mb-4">التحقق بخطوتين</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">تفعيل التحقق بخطوتين</p>
                        <p className="text-xs text-muted mt-1">حماية إضافية لحسابات المستخدمين</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={securitySettings.twoFactorAuth}
                          onChange={(e) => setSecuritySettings({...securitySettings, twoFactorAuth: e.target.checked})}
                          className="sr-only peer" 
                        />
                        <div className="w-11 h-6 bg-surface-hover peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="bg-background border border-border rounded-xl p-6">
                  <h3 className="text-sm font-bold text-foreground mb-4">الجلسات</h3>
                  <div>
                    <label className="block text-sm font-medium text-muted mb-2">مدة انتهاء الجلسة (بالدقائق)</label>
                    <input 
                      type="number" 
                      value={securitySettings.sessionTimeout}
                      onChange={(e) => setSecuritySettings({...securitySettings, sessionTimeout: Number(e.target.value)})}
                      className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'backup' && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                  <Database className="w-5 h-5 text-indigo-500" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">النسخ الاحتياطي</h2>
                  <p className="text-xs text-muted">النسخ الاحتياطي واستعادة البيانات</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-background border border-border rounded-xl p-6">
                  <h3 className="text-sm font-bold text-foreground mb-4">النسخ الاحتياطي التلقائي</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">تفعيل النسخ التلقائي</p>
                        <p className="text-xs text-muted mt-1">حفظ نسخة من البيانات تلقائياً</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={backupSettings.autoBackup}
                          onChange={(e) => setBackupSettings({...backupSettings, autoBackup: e.target.checked})}
                          className="sr-only peer" 
                        />
                        <div className="w-11 h-6 bg-surface-hover peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                      </label>
                    </div>
                    
                    {backupSettings.autoBackup && (
                      <div>
                        <label className="block text-sm font-medium text-muted mb-2">تكرار النسخ الاحتياطي</label>
                        <select 
                          value={backupSettings.backupFrequency}
                          onChange={(e) => setBackupSettings({...backupSettings, backupFrequency: e.target.value as any})}
                          className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500"
                        >
                          <option value="daily">يومياً</option>
                          <option value="weekly">أسبوعياً</option>
                          <option value="monthly">شهرياً</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-background border border-border rounded-xl p-6 flex flex-col justify-center items-center text-center">
                  <Database className="w-12 h-12 text-indigo-500 mb-3" />
                  <h3 className="text-sm font-bold text-foreground mb-1">نسخة احتياطية يدوية</h3>
                  <p className="text-xs text-muted mb-4">
                    آخر نسخة احتياطية: {backupSettings.lastBackupDate ? new Date(backupSettings.lastBackupDate).toLocaleString('ar-SA') : 'لا يوجد'}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
                    <button 
                      onClick={handleBackup}
                      disabled={isSaving}
                      className="bg-primary-600 hover:bg-primary-500 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Download className="w-4 h-4" />
                      <span>إنشاء نسخة احتياطية الآن</span>
                    </button>
                    
                    <input 
                      type="file" 
                      accept=".json" 
                      className="hidden" 
                      ref={fileInputRef}
                      onChange={handleRestore}
                    />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isSaving}
                      className="bg-surface border border-border hover:bg-surface-hover text-foreground px-6 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Upload className="w-4 h-4" />
                      <span>استعادة نسخة احتياطية</span>
                    </button>
                  </div>
                </div>

                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-6 flex flex-col justify-center items-center text-center mt-6">
                  <Trash2 className="w-12 h-12 text-red-500 mb-3" />
                  <h3 className="text-sm font-bold text-red-500 mb-1">مسح جميع البيانات (إعادة ضبط المصنع)</h3>
                  <p className="text-xs text-red-400/80 mb-4 max-w-md">
                    تحذير: هذا الإجراء سيقوم بحذف جميع البيانات من النظام بشكل نهائي (الطلبات، المنتجات، العملاء، الخ). لا يمكن التراجع عن هذا الإجراء.
                  </p>
                  <button 
                    onClick={handleResetData}
                    disabled={isSaving}
                    className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>مسح جميع البيانات نهائياً</span>
                  </button>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'coupons' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-pink-500/20 flex items-center justify-center">
                    <Tag className="w-5 h-5 text-pink-500" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground">الكوبونات والخصومات</h2>
                    <p className="text-xs text-muted">إدارة كوبونات الخصم والعروض الترويجية</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ExportButtons 
                    onExport={() => exportToExcel(coupons, 'الكوبونات')}
                    onPrint={() => printTable('coupons-table', 'الكوبونات والخصومات')}
                  />
                  <button 
                    onClick={() => {
                      setEditingCoupon({ id: 'temp_' + Date.now(), code: '', type: 'نسبة مئوية', value: 0, expiryDate: '', status: 'نشط' });
                      setShowCouponModal(true);
                    }}
                    className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    + إضافة كوبون جديد
                  </button>
                </div>
              </div>

              <div className="bg-background border border-border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table id="coupons-table" className="w-full text-right">
                    <thead>
                      <tr className="border-b border-border bg-surface">
                        <th className="px-4 py-3 text-sm font-medium text-muted">رمز الكوبون</th>
                        <th className="px-4 py-3 text-sm font-medium text-muted">نوع الخصم</th>
                        <th className="px-4 py-3 text-sm font-medium text-muted">القيمة</th>
                        <th className="px-4 py-3 text-sm font-medium text-muted">تاريخ الانتهاء</th>
                        <th className="px-4 py-3 text-sm font-medium text-muted">الحالة</th>
                        <th className="px-4 py-3 text-sm font-medium text-muted">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {coupons.map((coupon) => (
                        <tr key={coupon.id} className="hover:bg-surface-hover/50 transition-colors">
                          <td className="px-4 py-3 text-sm font-medium text-foreground">{coupon.code}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{coupon.type}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{coupon.value} {coupon.type === 'نسبة مئوية' ? '%' : 'د.ل'}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{coupon.expiryDate}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs rounded-full ${coupon.status === 'نشط' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                              {coupon.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => {
                                  setEditingCoupon(coupon);
                                  setShowCouponModal(true);
                                }}
                                className="text-muted hover:text-foreground transition-colors"
                              >
                                تعديل
                              </button>
                              <button 
                                onClick={() => confirmDelete(coupon.id, 'coupon')}
                                className="text-red-400 hover:text-red-300 transition-colors"
                              >
                                حذف
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {coupons.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                            لا توجد كوبونات مضافة
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showRoleModal && editingRole && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-border">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-xl font-bold text-foreground">
                {editingRole.id && !editingRole.id.toString().startsWith('temp_') ? 'تعديل دور' : 'إضافة دور جديد'}
              </h2>
              <button 
                onClick={() => setShowRoleModal(false)}
                className="p-2 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted mb-2">اسم الدور</label>
                    <input 
                      type="text" 
                      value={editingRole.name || ''}
                      onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })}
                      className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                      placeholder="مثال: كاشير"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted mb-2">الوصف</label>
                    <input 
                      type="text" 
                      value={editingRole.description || ''}
                      onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })}
                      className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                      placeholder="وصف مختصر للدور"
                    />
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-foreground mb-4">الصلاحيات</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Array.from(new Set(AVAILABLE_PERMISSIONS.map(p => p.module))).map(module => (
                      <div key={module} className="bg-background border border-border rounded-lg p-4">
                        <h4 className="text-sm font-bold text-primary-400 mb-3">{module}</h4>
                        <div className="space-y-3">
                          {AVAILABLE_PERMISSIONS.filter(p => p.module === module).map(permission => (
                            <label key={permission.id} className="flex items-start gap-3 cursor-pointer group">
                              <div className="relative flex items-center justify-center mt-0.5">
                                <input 
                                  type="checkbox" 
                                  className="peer sr-only"
                                  checked={editingRole.permissions.includes(permission.id)}
                                  onChange={(e) => {
                                    const newPermissions = e.target.checked
                                      ? [...editingRole.permissions, permission.id]
                                      : editingRole.permissions.filter(id => id !== permission.id);
                                    setEditingRole({ ...editingRole, permissions: newPermissions });
                                  }}
                                />
                                <div className="w-5 h-5 border-2 border-slate-500 rounded bg-surface peer-checked:bg-primary-500 peer-checked:border-primary-500 transition-colors"></div>
                                <Check className="w-3.5 h-3.5 text-foreground absolute opacity-0 peer-checked:opacity-100 transition-opacity" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-slate-200 group-hover:text-foreground transition-colors">{permission.name}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{permission.description}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-border flex justify-end gap-3">
              <button 
                onClick={() => setShowRoleModal(false)}
                className="px-6 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
              >
                إلغاء
              </button>
              <button 
                onClick={() => handleSaveRole(editingRole)}
                disabled={!(editingRole.name || '').trim()}
                className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>حفظ الدور</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showCouponModal && editingCoupon && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl w-full max-w-md flex flex-col max-h-[90vh] border border-border">
            <div className="flex items-center justify-between p-6 border-b border-border shrink-0">
              <h2 className="text-xl font-bold text-foreground">
                {editingCoupon.id && !editingCoupon.id.toString().startsWith('temp_') ? 'تعديل كوبون' : 'إضافة كوبون جديد'}
              </h2>
              <button 
                onClick={() => setShowCouponModal(false)}
                className="p-2 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4 overflow-y-auto pos-scroll">
              <div>
                <label className="block text-sm font-medium text-muted mb-2">رمز الكوبون</label>
                <input 
                  type="text" 
                  value={editingCoupon.code || ''}
                  onChange={(e) => setEditingCoupon({ ...editingCoupon, code: e.target.value })}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-2">نوع الخصم</label>
                <select 
                  value={editingCoupon.type || 'percentage'}
                  onChange={(e) => setEditingCoupon({ ...editingCoupon, type: e.target.value })}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                >
                  <option value="نسبة مئوية">نسبة مئوية</option>
                  <option value="مبلغ ثابت">مبلغ ثابت</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-2">القيمة</label>
                <input 
                  type="number" 
                  value={editingCoupon.value || 0}
                  onChange={(e) => setEditingCoupon({ ...editingCoupon, value: Number(e.target.value) })}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-2">تاريخ الانتهاء</label>
                <input 
                  type="date" 
                  value={editingCoupon.expiryDate || ''}
                  onChange={(e) => setEditingCoupon({ ...editingCoupon, expiryDate: e.target.value })}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-2">الحالة</label>
                <select 
                  value={editingCoupon.status || 'active'}
                  onChange={(e) => setEditingCoupon({ ...editingCoupon, status: e.target.value })}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                >
                  <option value="نشط">نشط</option>
                  <option value="غير نشط">غير نشط</option>
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-border flex justify-end gap-3 shrink-0">
              <button 
                onClick={() => setShowCouponModal(false)}
                className="px-6 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
              >
                إلغاء
              </button>
              <button 
                onClick={() => handleSaveCoupon(editingCoupon)}
                disabled={!(editingCoupon.code || '').trim()}
                className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>حفظ الكوبون</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {showUserModal && editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl w-full max-w-md flex flex-col max-h-[90vh] border border-border">
            <div className="flex items-center justify-between p-6 border-b border-border shrink-0">
              <h2 className="text-xl font-bold text-foreground">
                {editingUser.id && !editingUser.id.toString().startsWith('temp_') ? 'تعديل مستخدم' : 'إضافة مستخدم جديد'}
              </h2>
              <button 
                onClick={() => setShowUserModal(false)}
                className="p-2 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4 overflow-y-auto pos-scroll">
              <div>
                <label className="block text-sm font-medium text-muted mb-2">الاسم</label>
                <input 
                  type="text" 
                  value={editingUser.name || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-2">اسم المستخدم</label>
                <input 
                  type="text" 
                  value={editingUser.username || (editingUser.email?.includes('@') ? editingUser.email.split('@')[0] : editingUser.email || '')}
                  onChange={(e) => {
                    const val = e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_.-]/g, '');
                    setEditingUser({ ...editingUser, username: val, email: val ? `${val}@restaurant.internal` : '' });
                  }}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-left"
                  dir="ltr"
                  placeholder="مثال: ahmad_2024"
                  disabled={!(editingUser.id && editingUser.id.toString().startsWith('temp_'))}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-muted mb-2">كلمة المرور</label>
                <input 
                  type="password" 
                  value={newUserPassword || ''}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-left"
                  dir="ltr"
                  placeholder={editingUser.id && editingUser.id.toString().startsWith('temp_') ? "6 أحرف على الأقل" : "اتركه فارغاً إذا لم ترد تغييره"}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-2">الدور</label>
                <select 
                  value={editingUser.roleId || ''}
                  onChange={(e) => {
                    const newRoleId = e.target.value;
                    const newRole = roles.find(r => r.id === newRoleId);
                    setEditingUser({ 
                      ...editingUser, 
                      roleId: newRoleId,
                      permissions: newRole?.permissions || []
                    });
                  }}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                >
                  {roles.map(role => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-2">الفرع التابع له</label>
                <select 
                  value={editingUser.branchId || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, branchId: e.target.value })}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">جميع الفروع (صلاحية عامة)</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-2">الحالة</label>
                <select 
                  value={editingUser.status || 'نشط'}
                  onChange={(e) => setEditingUser({ ...editingUser, status: e.target.value })}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                >
                  <option value="نشط">نشط</option>
                  <option value="غير نشط">غير نشط</option>
                </select>
              </div>

              <div className="pt-4 border-t border-border">
                <label className="block text-sm font-bold text-foreground mb-3">تأكيد وتخصيص الصلاحيات</label>
                <p className="text-xs text-muted mb-4">يمكنك تعديل الصلاحيات الممنوحة لهذا المستخدم بشكل فردي (مستقلة عن الدور الأساسي).</p>
                <div className="space-y-3 max-h-60 overflow-y-auto pos-scroll pr-2">
                  {AVAILABLE_PERMISSIONS.map(permission => {
                    const isGranted = editingUser.permissions?.includes(permission.id);
                    return (
                      <div key={permission.id} className="flex items-start gap-3 p-3 bg-surface-hover rounded-lg border border-border">
                        <div className="flex items-center h-5">
                          <input
                            type="checkbox"
                            checked={isGranted || false}
                            onChange={(e) => {
                              const newPermissions = e.target.checked 
                                ? [...(editingUser.permissions || []), permission.id]
                                : (editingUser.permissions || []).filter(p => p !== permission.id);
                              setEditingUser({ ...editingUser, permissions: newPermissions });
                            }}
                            className="w-4 h-4 text-primary-600 bg-background border-border rounded focus:ring-primary-500 focus:ring-2"
                          />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground">{permission.name}</span>
                          <span className="text-xs text-muted mt-0.5">{permission.description}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-border flex justify-end gap-3 shrink-0">
              <button 
                onClick={() => setShowUserModal(false)}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground bg-surface-hover hover:bg-slate-700 rounded-lg transition-colors"
              >
                إلغاء
              </button>
              <button 
                onClick={() => handleSaveUser(editingUser)}
                disabled={!(editingUser.name || '').trim() || (!(editingUser.username || '').trim() && !(editingUser.email || '').trim())}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                حفظ
              </button>
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
              <h3 className="text-xl font-bold text-foreground mb-2">تأكيد الحذف</h3>
              <p className="text-muted mb-6">
                هل أنت متأكد من رغبتك في حذف {
                  itemToDelete.type === 'user' ? 'هذا المستخدم' :
                  itemToDelete.type === 'role' ? 'هذا الدور' :
                  'هذا الكوبون'
                }؟ لا يمكن التراجع عن هذا الإجراء.
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

      {/* Reset Confirmation Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-red-500/30 rounded-xl w-full max-w-md flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-bold text-red-500 mb-2">
                {resetStep === 1 ? 'تحذير خطير' : 'تأكيد نهائي'}
              </h3>
              <p className="text-foreground mb-6">
                {resetStep === 1 
                  ? 'هل أنت متأكد من رغبتك في مسح جميع بيانات النظام؟ (الطلبات، المنتجات، العملاء، الخ)'
                  : 'هذا الإجراء لا يمكن التراجع عنه. سيتم حذف جميع البيانات نهائياً. هل تريد المتابعة؟'
                }
              </p>
              
              {resetStep === 2 && (
                <label className="flex items-center gap-3 mb-6 p-4 bg-surface-hover rounded-xl border border-border w-full text-right cursor-pointer transition-colors hover:bg-surface">
                  <input
                    type="checkbox"
                    checked={isBackupBeforeReset}
                    onChange={(e) => setIsBackupBeforeReset(e.target.checked)}
                    className="w-5 h-5 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                  />
                  <div>
                    <p className="font-bold text-foreground focus:outline-none">أخذ نسخة احتياطية أولاً</p>
                    <p className="text-xs text-muted">يوصى به بشدة لحفظ بياناتك قبل المسح النهائي</p>
                  </div>
                </label>
              )}

              <div className="flex gap-3 w-full">
                <button
                  onClick={() => {
                    setIsResetModalOpen(false);
                    setResetStep(1);
                  }}
                  className="flex-1 py-3 bg-surface-hover hover:bg-slate-700 text-foreground rounded-xl font-bold transition-colors"
                >
                  إلغاء
                </button>
                <button
                  onClick={async () => {
                    if (resetStep === 1) {
                      setResetStep(2);
                    } else {
                      await confirmAndExecuteReset();
                    }
                  }}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors"
                >
                  {resetStep === 1 ? 'نعم، أريد المتابعة' : 'مسح جميع البيانات'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Restore Confirmation Modal */}
      {isRestoreModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-yellow-500/30 rounded-xl w-full max-w-md flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-yellow-500/20 text-yellow-500 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-bold text-yellow-500 mb-2">تحذير</h3>
              <p className="text-foreground mb-6">
                استعادة النسخة الاحتياطية ستؤدي إلى استبدال جميع البيانات الحالية. هل أنت متأكد من رغبتك في المتابعة؟
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => {
                    setIsRestoreModalOpen(false);
                    setFileToRestore(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="flex-1 py-3 bg-surface-hover hover:bg-slate-700 text-foreground rounded-xl font-bold transition-colors"
                >
                  إلغاء
                </button>
                <button
                  onClick={executeRestore}
                  className="flex-1 py-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-xl font-bold transition-colors"
                >
                  تأكيد الاستعادة
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
