const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, 'src/pages');

fs.readdirSync(directoryPath).forEach(file => {
  if (!file.endsWith('.tsx')) return;
  let filePath = path.join(directoryPath, file);
  let content = fs.readFileSync(filePath, 'utf8');

  if (content.includes('canViewAllBranches') && !content.includes('useEffect(() => { if (!canViewAllBranches')) {
    
    // Insert useEffect to force branch filters
    const forceEffect = `  useEffect(() => {
    if (!canViewAllBranches && userBranchId) {
      if (typeof setSelectedBranchFilter === 'function') setSelectedBranchFilter(userBranchId);
      if (typeof setSelectedBranch === 'function') setSelectedBranch(userBranchId);
      if (typeof setFilterBranchId === 'function') setFilterBranchId(userBranchId);
    }
  }, [canViewAllBranches, userBranchId]);\n`;
    
    content = content.replace(/const canViewAllBranches = hasPermission\([^)]+\);/, match => match + '\n' + forceEffect);
    
    fs.writeFileSync(filePath, content, 'utf8');
  }
});
