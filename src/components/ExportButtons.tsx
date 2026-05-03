import React from 'react';
import { Download, Printer } from 'lucide-react';
import { exportToExcel, printTable } from '../lib/exportUtils';

interface ExportButtonsProps {
  onExport: () => void;
  onPrint: () => void;
}

export function ExportButtons({ onExport, onPrint }: ExportButtonsProps) {
  return (
    <div className="flex gap-2">
      <button
        onClick={onExport}
        className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
        title="تصدير إلى إكسيل"
      >
        <Download className="w-4 h-4" />
        <span className="hidden sm:inline">إكسيل</span>
      </button>
      <button
        onClick={onPrint}
        className="flex items-center gap-2 px-3 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors text-sm font-medium"
        title="طباعة"
      >
        <Printer className="w-4 h-4" />
        <span className="hidden sm:inline">طباعة</span>
      </button>
    </div>
  );
}
