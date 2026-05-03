import * as XLSX from 'xlsx';

export const exportToExcel = (data: any[], fileName: string, sheetName: string = 'Sheet1') => {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
};

export const printTable = (tableId: string, title: string) => {
  const tableEl = document.getElementById(tableId);
  if (!tableEl) {
    console.error(`Table with id ${tableId} not found`);
    return;
  }

  const clone = tableEl.cloneNode(true) as HTMLTableElement;

  // Find and remove the actions column if it exists
  const ths = Array.from(clone.querySelectorAll('th'));
  let actionColIndex = -1;
  ths.forEach((th, index) => {
    const text = th.textContent?.trim();
    if (text === 'إجراءات' || text === 'الإجراءات') {
      actionColIndex = index;
    }
  });

  if (actionColIndex !== -1) {
    ths[actionColIndex].remove();
    const rows = clone.querySelectorAll('tr');
    rows.forEach(row => {
      const tds = row.querySelectorAll('td');
      if (tds.length > actionColIndex) {
        tds[actionColIndex].remove();
      }
    });
  }

  // Remove any explicitly marked no-print elements
  const noPrintEls = clone.querySelectorAll('.no-print');
  noPrintEls.forEach(el => el.remove());

  const tableHtml = clone.outerHTML;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('يرجى السماح بالنوافذ المنبثقة (Pop-ups) لتمكين الطباعة.');
    return;
  }

  printWindow.document.write(`
    <html dir="rtl">
      <head>
        <title>${title}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
          }
          h1 {
            text-align: center;
            margin-bottom: 20px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: right;
          }
          th {
            background-color: #f2f2f2 !important;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
          }
          .no-print {
            display: none !important;
          }
          @media print {
            .no-print {
              display: none !important;
            }
          }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        ${tableHtml}
      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();
  
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
};

export const printInvoice = async (order: any, storeSettings: any, invoiceSettings: any) => {
  const currency = storeSettings?.currency || 'LYD';
  const paperSizeClass = invoiceSettings?.paperSize === '58mm' ? 'width: 58mm;' : 
                         invoiceSettings?.paperSize === 'A4' ? 'width: 210mm;' :
                         invoiceSettings?.paperSize === 'A5' ? 'width: 148mm;' :
                         'width: 80mm;';

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('ar-SA', { minimumFractionDigits: 2 }) + ' ' + currency;
  };

  const invoiceHtml = `
    <html dir="rtl">
      <head>
        <title>فاتورة #${order.orderId || order.id?.slice(0, 8)}</title>
        <style>
          body {
            font-family: 'Courier New', Courier, monospace;
            margin: 0;
            padding: 10px;
            color: #000;
            ${paperSizeClass}
            margin-left: auto;
            margin-right: auto;
          }
          .header, .footer { text-align: center; margin-bottom: 10px; }
          .logo { max-width: 100px; margin: 0 auto 10px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
          th, td { border-bottom: 1px dashed #ccc; padding: 5px 0; text-align: right; font-size: 12px; }
          .total-row td { border-bottom: none; font-weight: bold; font-size: 14px; }
          .text-center { text-align: center; }
          .whitespace-pre-line { white-space: pre-line; }
          @media print {
            body { margin: 0; padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          ${invoiceSettings?.logoUrl ? `<img src="${invoiceSettings.logoUrl}" class="logo" />` : ''}
          <h2 style="margin: 0 0 5px 0; font-size: 16px;">${storeSettings?.nameAr || 'المطعم'}</h2>
          ${invoiceSettings?.headerText ? `<div class="whitespace-pre-line" style="font-size: 12px; margin-bottom: 10px;">${invoiceSettings.headerText}</div>` : ''}
          <div style="font-size: 12px; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 5px 0; margin-bottom: 10px;">
            <div>رقم الفاتورة: ${order.orderId || order.id?.slice(0, 8)}</div>
            <div>التاريخ: ${new Date(order.createdAt || new Date()).toLocaleString('ar-SA')}</div>
            ${order.customerName ? `<div>العميل: ${order.customerName}</div>` : ''}
            ${order.tableNumber ? `<div>الطاولة: ${order.tableNumber}</div>` : ''}
            ${order.method ? `<div>طريقة الدفع: ${order.method === 'cash' ? 'نقدي' : 'بطاقة'}</div>` : ''}
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>الصنف</th>
              <th class="text-center">الكمية</th>
              <th>السعر</th>
            </tr>
          </thead>
          <tbody>
            ${(order.items || []).map((item: any) => `
              <tr>
                <td>${item.name}${item.notes ? `<br/><small style="color: #666;">${item.notes}</small>` : ''}</td>
                <td class="text-center">${item.quantity}</td>
                <td>${formatCurrency(item.price * item.quantity)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            ${(order.deliveryFee || 0) > 0 ? `
              <tr>
                <td colspan="2">رسوم التوصيل</td>
                <td>${formatCurrency(order.deliveryFee)}</td>
              </tr>
            ` : ''}
            <tr class="total-row">
              <td colspan="2">الإجمالي</td>
              <td>${formatCurrency(order.total)}</td>
            </tr>
          </tfoot>
        </table>

        <div class="footer">
          ${invoiceSettings?.footerText ? `<div class="whitespace-pre-line" style="font-size: 12px; margin-bottom: 10px;">${invoiceSettings.footerText}</div>` : ''}
        </div>
      </body>
    </html>
  `;

  if (invoiceSettings?.printerType === 'network' && invoiceSettings?.printerAddress) {
    try {
      console.log(`Sending print job to network printer at ${invoiceSettings.printerAddress}`);
      // Simulated IP printer request (e.g., ESC/POS via web server / ESP32)
      await fetch(`http://${invoiceSettings.printerAddress}/print`, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
           'Content-Type': 'text/html'
        },
        body: invoiceHtml,
      });
      console.log('Network print request dispatched');
    } catch (e) {
      console.error('Failed to print to network printer, falling back to browser print', e);
      printWithBrowser(invoiceHtml, invoiceSettings);
    }
  } else {
    printWithBrowser(invoiceHtml, invoiceSettings);
  }
};

const printWithBrowser = (html: string, settings: any) => {
  const printWindow = window.open('', '_blank', 'width=400,height=600');
  if (!printWindow) {
    alert('يرجى السماح بالنوافذ المنبثقة (Pop-ups) لتمكين الطباعة.');
    return;
  }
  
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  
  setTimeout(() => {
    const copies = settings?.printCopies || 1;
    // Some browsers block successive window.print() calls rapidly, 
    // ideally the user would select number of copies in the print dialog.
    // If strict multiple copies is needed, calling print multiple times might require delay or confirmation.
    for (let i = 0; i < copies; i++) {
        printWindow.print();
    }
    printWindow.close();
  }, 500);
};
