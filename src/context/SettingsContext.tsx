import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

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

interface SettingsContextType {
  storeSettings: StoreSettings | null;
  appearanceSettings: AppearanceSettings | null;
  invoiceSettings: InvoiceSettings | null;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextType>({
  storeSettings: null,
  appearanceSettings: null,
  invoiceSettings: null,
  loading: true,
});

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [appearanceSettings, setAppearanceSettings] = useState<AppearanceSettings | null>(null);
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let loadedCount = 0;
    const checkLoading = () => {
      loadedCount++;
      if (loadedCount >= 3) setLoading(false);
    };

    const unsubGeneral = onSnapshot(doc(db, 'settings', 'general'), (docSnap) => {
      if (docSnap.exists()) {
        setStoreSettings(docSnap.data() as StoreSettings);
      } else {
        setStoreSettings({
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
        });
      }
      checkLoading();
    }, (error) => {
      console.error('Error fetching general settings:', error);
      checkLoading();
    });

    const unsubAppearance = onSnapshot(doc(db, 'settings', 'appearance'), (docSnap) => {
      if (docSnap.exists()) {
        setAppearanceSettings(docSnap.data() as AppearanceSettings);
      } else {
        setAppearanceSettings({ primaryColor: '#f97316', theme: 'dark' });
      }
      checkLoading();
    }, (error) => {
      console.error('Error fetching appearance settings:', error);
      checkLoading();
    });

    const unsubInvoice = onSnapshot(doc(db, 'settings', 'invoice'), (docSnap) => {
      if (docSnap.exists()) {
        setInvoiceSettings(docSnap.data() as InvoiceSettings);
      } else {
        setInvoiceSettings({
          logoUrl: '',
          headerText: 'مرحباً بكم في مطعمنا\nنتمنى لكم وجبة شهية',
          footerText: 'شكراً لزيارتكم\nنراكم قريباً',
          itemLayout: 'compact',
          printerType: 'browser',
          printerAddress: '',
          paperSize: '80mm',
          printCopies: 1
        });
      }
      checkLoading();
    }, (error) => {
      console.error('Error fetching invoice settings:', error);
      checkLoading();
    });

    return () => {
      unsubGeneral();
      unsubAppearance();
      unsubInvoice();
    };
  }, []);

  useEffect(() => {
    if (appearanceSettings?.primaryColor) {
      document.documentElement.style.setProperty('--color-primary-500', appearanceSettings.primaryColor);
      document.documentElement.style.setProperty('--color-primary-600', appearanceSettings.primaryColor);
      document.documentElement.style.setProperty('--color-primary-400', appearanceSettings.primaryColor);
    }
    
    if (appearanceSettings?.theme) {
      localStorage.setItem('theme', appearanceSettings.theme);
      if (appearanceSettings.theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [appearanceSettings]);

  return (
    <SettingsContext.Provider value={{ storeSettings, appearanceSettings, invoiceSettings, loading }}>
      {children}
    </SettingsContext.Provider>
  );
};
