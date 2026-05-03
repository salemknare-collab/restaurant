import fs from 'fs';
import path from 'path';

const directoryPath = path.join(process.cwd(), 'src');

const replacements = [
  { regex: /bg-\[\#0b1120\]/g, replacement: 'bg-background' },
  { regex: /bg-\[\#111827\]/g, replacement: 'bg-surface' },
  { regex: /border-\[\#1e293b\]/g, replacement: 'border-border' },
  { regex: /divide-\[\#1e293b\]/g, replacement: 'divide-border' },
  { regex: /hover:bg-\[\#1e293b\]\/50/g, replacement: 'hover:bg-surface-hover/50' },
  { regex: /hover:bg-\[\#1e293b\]/g, replacement: 'hover:bg-surface-hover' },
  { regex: /bg-\[\#1e293b\]/g, replacement: 'bg-surface-hover' },
  { regex: /text-slate-50/g, replacement: 'text-foreground' },
  { regex: /text-slate-400/g, replacement: 'text-muted' },
  { regex: /text-slate-300/g, replacement: 'text-muted-foreground' },
  { regex: /text-slate-500/g, replacement: 'text-muted' },
  { regex: /text-foreground0/g, replacement: 'text-muted-foreground' },
  { regex: /ring-\[\#1e293b\]/g, replacement: 'ring-border' },
];

function walk(dir: string) {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk(directoryPath);

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;
  
  replacements.forEach(r => {
    content = content.replace(r.regex, r.replacement);
  });
  
  const lines = content.split('\n');
  const newLines = lines.map(line => {
    if (line.includes('text-white')) {
      if (!line.match(/bg-(primary|emerald|red|blue|amber|purple|green|black)-/)) {
        return line.replace(/text-white/g, 'text-foreground');
      }
    }
    return line;
  });
  content = newLines.join('\n');

  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated ${file}`);
  }
});
