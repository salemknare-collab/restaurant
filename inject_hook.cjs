const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, 'src/pages');
const hookImport = "import { useUserAuth } from '../hooks/useUserAuth';\n";

const processFile = (fileName, setupCode) => {
  const filePath = path.join(directoryPath, fileName);
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');

  // Skip if already processed
  if (content.includes('useUserAuth')) return;

  // Add import after lucide-react or react import
  content = content.replace(/import React[^;]+;/, match => match + '\n' + hookImport);

  // Add hook inside component
  const componentMatch = content.match(/export default function [^)]+\) {/);
  if (componentMatch) {
    content = content.replace(componentMatch[0], componentMatch[0] + '\n  ' + setupCode);
  }

  // Find all instances where branch filtering is used and ensure it defaults correctly 
  // We'll replace the `<select` for branches or `branches.map` with `availableBranches`
  // And we will define availableBranches in the setupCode.

  fs.writeFileSync(filePath, content, 'utf8');
};

const pagesToProcess = [
  'RawMaterials.tsx', 'Finance.tsx', 'Reports.tsx', 
  'Inventory.tsx', 'Orders.tsx', 'Employees.tsx', 
  'POS.tsx', 'Purchases.tsx', 'Kitchen.tsx'
];

const setupCodeTemplate = `const { branchId: userBranchId, hasPermission } = useUserAuth();
  const canViewAllBranches = hasPermission('branches.view_all');
  const availableBranches = branches; 
  // We will manually fix branches logic inside or use the general approach.`;

pagesToProcess.forEach(file => {
  // Let's just inject the import and hook
  processFile(file, `const { branchId: userBranchId, hasPermission } = useUserAuth();
  const canViewAllBranches = hasPermission('branches.view_all');`);
});
