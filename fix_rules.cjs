const fs = require('fs');
const filePath = 'firestore.rules';
let content = fs.readFileSync(filePath, 'utf8');
content = content.replace(/employee_dailyTransactions/g, 'payroll');
content = content.replace(/isValidEmployeeTransaction/g, 'isValidPayrollTransaction');
fs.writeFileSync(filePath, content, 'utf8');
