const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, 'src/pages');

fs.readdirSync(directoryPath).forEach(file => {
  if (!file.endsWith('.tsx')) return;
  const filePath = path.join(directoryPath, file);
  let content = fs.readFileSync(filePath, 'utf8');

  if (content.includes('canViewAllBranches')) {
    // 1. Filter branches mapping:
    // Wherever there is `<select ... branches.map`
    // We add disabled={!canViewAllBranches} where applicable.
    
    // Instead of regexing all, let's inject a new variable `availableBranches`:
    if (!content.includes('const availableBranches =')) {
      content = content.replace(/const \[branches, setBranches\] = useState((<{.*}>)?|.*)\[\]\);?/, 
        match => match + '\n  const availableBranches = canViewAllBranches ? branches : branches.filter(b => b.id === userBranchId);');
      
      // Update branches.map to availableBranches.map where appropriate.
      // E.g. {branches.map( ... )} to {availableBranches.map( ... )}
      content = content.replace(/\{?branches(\?)?\.map/g, "{availableBranches.map");
      content = content.replace(/branches\.map/g, "availableBranches.map");
    }

    fs.writeFileSync(filePath, content, 'utf8');
  }
});
