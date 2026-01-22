const { createCanvas, registerFont } = require('canvas');
const fs = require('fs');

// Try registering a font
const fontPath = '/Users/mathru/Documents/github/store_information_generator/fonts/MPLUSRounded1c-Bold.ttf';

console.log('Checking if font file exists:', fontPath);
console.log('Exists:', fs.existsSync(fontPath));

if (fs.existsSync(fontPath)) {
  console.log('Registering font...');
  registerFont(fontPath, { family: 'MPlus' });
  console.log('Font registered successfully');
}

// Test with registered font
console.log('\n=== Test with registered MPlus font ===');
const canvas1 = createCanvas(700, 150);
const ctx1 = canvas1.getContext('2d');

ctx1.fillStyle = '#333333';
ctx1.fillRect(0, 0, 700, 150);

ctx1.font = 'bold 100px "MPlus"';
ctx1.fillStyle = '#FFFFFF';
ctx1.textAlign = 'center';
ctx1.textBaseline = 'middle';
ctx1.fillText('ClaudeCodeUI', 350, 75);

console.log('Font:', ctx1.font);
const metrics = ctx1.measureText('ClaudeCodeUI');
console.log('Text width:', metrics.width);

fs.writeFileSync('test-registered-font.png', canvas1.toBuffer('image/png'));
console.log('Saved: test-registered-font.png');

// Also test sans-serif as fallback
console.log('\n=== Test with sans-serif ===');
const canvas2 = createCanvas(700, 150);
const ctx2 = canvas2.getContext('2d');

ctx2.fillStyle = '#333333';
ctx2.fillRect(0, 0, 700, 150);

ctx2.font = 'bold 100px sans-serif';
ctx2.fillStyle = '#FFFFFF';
ctx2.textAlign = 'center';
ctx2.textBaseline = 'middle';
ctx2.fillText('ClaudeCodeUI', 350, 75);

console.log('Font:', ctx2.font);
const metrics2 = ctx2.measureText('ClaudeCodeUI');
console.log('Text width:', metrics2.width);

fs.writeFileSync('test-sans-serif.png', canvas2.toBuffer('image/png'));
console.log('Saved: test-sans-serif.png');
