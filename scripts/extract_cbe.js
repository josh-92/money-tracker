const fs = require('fs');

const svg = fs.readFileSync('images/Commercial Bank of Ethiopia Logo.svg', 'utf8');
const startTag = 'href="data:image/png;base64,';
const startIdx = svg.indexOf(startTag);
if (startIdx !== -1) {
  const dataStart = startIdx + startTag.length;
  const endIdx = svg.indexOf('"', dataStart);
  const base64Data = svg.substring(dataStart, endIdx).replace(/\s+/g, '');
  const buf = Buffer.from(base64Data, 'base64');
  fs.writeFileSync('images/cbe_logo.png', buf);
  console.log('Successfully saved images/cbe_logo.png, size:', buf.length);
} else {
  console.error('startTag not found in SVG');
}
