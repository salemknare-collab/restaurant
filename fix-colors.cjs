const fs = require('fs');

const file = 'src/pages/POS.tsx';
let content = fs.readFileSync(file, 'utf8');

const replacements = {
  'bg-gray-50': 'bg-background',
  'bg-white': 'bg-surface',
  'border-gray-200': 'border-border',
  'text-gray-800': 'text-foreground',
  'text-gray-500': 'text-muted',
  'text-gray-700': 'text-foreground',
  'text-gray-400': 'text-muted-foreground',
  'text-gray-900': 'text-foreground',
  'bg-gray-100': 'bg-surface-hover',
  'border-gray-100': 'border-border',
  'border-gray-300': 'border-border',
  'text-black': 'text-foreground',
  'text-gray-600': 'text-muted',
  'text-gray-300': 'text-muted-foreground'
};

for (const [key, value] of Object.entries(replacements)) {
  content = content.replace(new RegExp(key, 'g'), value);
}

fs.writeFileSync(file, content);
console.log('Done');
