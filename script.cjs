const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, 'src/pages');

fs.readdir(directoryPath, (err, files) => {
  if (err) {
    return console.log('Unable to scan directory: ' + err);
  }
  
  files.forEach((file) => {
    if (file.endsWith('.tsx')) {
      const filePath = path.join(directoryPath, file);
      let content = fs.readFileSync(filePath, 'utf8');
      
      content = content.replace(/'chart_of_accounts'/g, "'chartAccounts'");
      content = content.replace(/'finance_accounts'/g, "'accounts'");
      content = content.replace(/'transactions'/g, "'dailyTransactions'");
      content = content.replace(/'employee_transactions'/g, "'payroll'");
      content = content.replace(/'customers'/g, "'partners'");
      
      fs.writeFileSync(filePath, content, 'utf8');
    }
  });
});
