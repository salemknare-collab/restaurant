const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, 'src/pages');

fs.readdirSync(directoryPath).forEach(file => {
  if (!file.endsWith('.tsx')) return;
  let filePath = path.join(directoryPath, file);
  let content = fs.readFileSync(filePath, 'utf8');

  let modified = false;

  if (content.includes('const [branches, setBranches] = useState') && content.includes('canViewAllBranches')) {
    content = content.replace(/const \[branches, setBranches\] = useState([^;]+);/, 
        "const [allBranches, setBranches] = useState$1;");
    modified = true;
  }

  if (content.includes('const availableBranches = canViewAllBranches ? branches : branches.filter')) {
    content = content.replace(/const availableBranches = canViewAllBranches \? branches : branches\.filter[^\n]+/, 
        "const branches = canViewAllBranches ? allBranches : allBranches.filter(b => b.id === userBranchId);");
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
  }
});
