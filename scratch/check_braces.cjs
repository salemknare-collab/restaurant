const fs = require('fs');
const content = fs.readFileSync('c:/Users/HP/Desktop/restaurant/src/pages/Inventory.tsx', 'utf8');

let stack = [];
let lines = content.split('\n');

for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    for (let char of line) {
        if (char === '{') stack.push(lineNum + 1);
        if (char === '}') {
            if (stack.length > 0) stack.pop();
        }
    }
    if (lineNum > 1420) {
        console.log(`Line ${lineNum + 1}: ${line.trim()} | Stack: ${stack.join(', ')}`);
    }
}
