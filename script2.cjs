const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'firestore.rules');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(/chart_of_accounts/g, "chartAccounts");
content = content.replace(/finance_accounts/g, "accounts");
content = content.replace(/transactions/g, "dailyTransactions");
content = content.replace(/employee_transactions/g, "payroll");
content = content.replace(/customers/g, "partners");

fs.writeFileSync(filePath, content, 'utf8');
