const { createCanvas } = require('canvas');
const fs = require('fs');

// Test 1: Standard canvas (no type specified)
console.log('=== Test 1: Standard canvas ===');
const canvas1 = createCanvas(700, 150);
const ctx1 = canvas1.getContext('2d');

ctx1.fillStyle = '#333333';  // Dark background
ctx1.fillRect(0, 0, 700, 150);

ctx1.font = 'bold 100px "Arial"';
ctx1.fillStyle = '#FFFFFF';
ctx1.textAlign = 'center';
ctx1.textBaseline = 'middle';
ctx1.fillText('ClaudeCodeUI', 350, 75);

console.log('Font:', ctx1.font);
console.log('FillStyle:', ctx1.fillStyle);

fs.writeFileSync('test-standard.png', canvas1.toBuffer('image/png'));
console.log('Saved: test-standard.png');

// Test 2: 'image' type canvas
console.log('\n=== Test 2: Image type canvas ===');
const canvas2 = createCanvas(700, 150, 'image');
const ctx2 = canvas2.getContext('2d');

ctx2.fillStyle = '#333333';
ctx2.fillRect(0, 0, 700, 150);

ctx2.font = 'bold 100px "Arial"';
ctx2.fillStyle = '#FFFFFF';
ctx2.textAlign = 'center';
ctx2.textBaseline = 'middle';
ctx2.fillText('ClaudeCodeUI', 350, 75);

console.log('Font:', ctx2.font);
console.log('FillStyle:', ctx2.fillStyle);

fs.writeFileSync('test-image-type.png', canvas2.toBuffer('image/png'));
console.log('Saved: test-image-type.png');

// Test 3: Transparent canvas with 'image' type
console.log('\n=== Test 3: Transparent image type canvas ===');
const canvas3 = createCanvas(700, 150, 'image');
const ctx3 = canvas3.getContext('2d');

// No background fill - transparent

ctx3.font = 'bold 100px "Arial"';
ctx3.fillStyle = '#FFFFFF';
ctx3.textAlign = 'center';
ctx3.textBaseline = 'middle';
ctx3.fillText('ClaudeCodeUI', 350, 75);

console.log('Font:', ctx3.font);
console.log('FillStyle:', ctx3.fillStyle);

fs.writeFileSync('test-transparent.png', canvas3.toBuffer('image/png'));
console.log('Saved: test-transparent.png');

// Test 4: Using ImageComposer.createCanvas equivalent
console.log('\n=== Test 4: Using ImageComposer.createCanvas style ===');
const canvas4 = createCanvas(700, 150, 'image');
const ctx4 = canvas4.getContext('2d');

// This simulates transparent: true behavior
// No white background fill

ctx4.font = 'bold 100px "Arial"';
ctx4.fillStyle = '#FFFFFF';
ctx4.textAlign = 'center';
ctx4.textBaseline = 'middle';

// Draw text
ctx4.fillText('ClaudeCodeUI', 350, 75);

// Measure text
const metrics = ctx4.measureText('ClaudeCodeUI');
console.log('Text metrics:');
console.log('  width:', metrics.width);
console.log('  actualBoundingBoxAscent:', metrics.actualBoundingBoxAscent);
console.log('  actualBoundingBoxDescent:', metrics.actualBoundingBoxDescent);

fs.writeFileSync('test-composer-style.png', canvas4.toBuffer('image/png'));
console.log('Saved: test-composer-style.png');

console.log('\n✓ All tests completed. Check the generated PNG files.');
