import { useSettings } from '../context/SettingsContext';

export const useFormatCurrency = () => {
  const { storeSettings } = useSettings();
  
  return (amount: number) => {
    const currency = storeSettings?.currency || 'LYD';
    const locale = currency === 'LYD' ? 'ar-LY' : currency === 'SAR' ? 'ar-SA' : 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };
};
