// Inlines src/parser.js into src/page.html -> dist/books.html (the published artifact).
const fs = require('fs');
const path = require('path');

const page = fs.readFileSync(path.join(__dirname, 'src/page.html'), 'utf8');
const parser = fs.readFileSync(path.join(__dirname, 'src/parser.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'src/gst.js'), 'utf8');
if (!page.includes('/*@@PARSER@@*/')) throw new Error('parser placeholder missing from page.html');
if (/<\/script/i.test(parser)) throw new Error('parser.js must not contain a closing script tag');

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
const out = path.join(__dirname, 'dist/books.html');
fs.writeFileSync(out, page.replace('/*@@PARSER@@*/', () => parser));
console.log(`wrote ${path.relative(process.cwd(), out)} (${fs.statSync(out).size} bytes)`);
