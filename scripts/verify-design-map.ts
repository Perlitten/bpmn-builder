import * as fs from 'fs';

function checkLine(file: string, lineNum: number, searchTerms: string[], context: string) {
    if (!fs.existsSync(file)) {
        console.error(`Verification Failed [${context}]: File ${file} does not exist.`);
        process.exit(1);
    }
    const lines = fs.readFileSync(file, 'utf-8').split('\n');
    let found = false;

    for (let offset = -2; offset <= 2; offset++) {
        const checkLineNum = lineNum + offset;
        if (checkLineNum > 0 && checkLineNum <= lines.length) {
            const lineContent = lines[checkLineNum - 1];
            for (const term of searchTerms) {
                if (lineContent.includes(term)) {
                    found = true;
                    break;
                }
            }
        }
        if (found) break;
    }

    if (!found) {
        console.error(`Verification Failed [${context}]: Line ${lineNum} (+/-2) in ${file} does not contain any of [${searchTerms.join(', ')}].`);
        process.exit(1);
    }
}

function preventNotFound(file: string) {
    const content = fs.readFileSync(file, 'utf-8');
    if (content.includes('NOT_FOUND')) {
        console.error(`Verification Failed: File ${file} contains placeholder 'NOT_FOUND'.`);
        process.exit(1);
    }
}

['docs/design-system/components.json', 'docs/design-system/inventory.json', 'docs/design-system/components.md', 'docs/design-system/inventory.md', 'docs/design-system/tailwind-layer.md', 'docs/design-system/readiness.md'].forEach(preventNotFound);

console.info('Verifying docs/design-system/components.json...');
const comps = JSON.parse(fs.readFileSync('docs/design-system/components.json', 'utf-8'));
for (const comp of comps) {
    for (const site of comp.sites) {
        const [file, line] = site.split(':');
        checkLine(file, parseInt(line, 10), [comp.name, `<${comp.name}`], `Component ${comp.name}`);
    }
}
console.info('✓ components.json verified.');

console.info('Verifying docs/design-system/inventory.json...');
const inv = JSON.parse(fs.readFileSync('docs/design-system/inventory.json', 'utf-8'));
for (const item of inv) {
    for (const site of item.sites) {
        checkLine(site.file, site.line, [item.value, item.value.split('-').pop(), item.value.split(':')[1] || item.value], `Inventory ${item.value}`);
    }
}
console.info('✓ inventory.json verified.');

console.info('All verification passed.');
