const { createCanvas } = require('canvas');
const fs = require('fs');

console.log('Node.js version:', process.version);
console.log('Canvas version:', require('canvas').version);
console.log('Platform:', process.platform);
console.log('Architecture:', process.arch);
console.log('');

// Test 1: Simple red fill
console.log('Test 1: Simple red fill');
{
  const canvas = createCanvas(100, 100);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'red';
  ctx.fillRect(0, 0, 100, 100);

  // Check pixel data
  const imageData = ctx.getImageData(50, 50, 1, 1);
  console.log('  Pixel at (50,50):', Array.from(imageData.data));
  console.log('  Expected: [255, 0, 0, 255]');

  // Save
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync('./test-output/debug_red.png', buffer);
  console.log('  Saved: debug_red.png');
}

// Test 2: Using 'image' type
console.log('\nTest 2: Using image type');
{
  const canvas = createCanvas(100, 100, 'image');
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'green';
  ctx.fillRect(0, 0, 100, 100);

  // Check pixel data
  const imageData = ctx.getImageData(50, 50, 1, 1);
  console.log('  Pixel at (50,50):', Array.from(imageData.data));
  console.log('  Expected: [0, 255, 0, 255]');

  // Save
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync('./test-output/debug_green_image.png', buffer);
  console.log('  Saved: debug_green_image.png');
}

// Test 3: Using Cairo directly (if possible)
console.log('\nTest 3: Testing different backends');
{
  try {
    const canvas = createCanvas(100, 100);
    console.log('  Canvas backend:', canvas.backend || 'unknown');
    console.log('  Canvas type:', canvas.type || 'unknown');
  } catch (e) {
    console.log('  Error:', e.message);
  }
}

// Test 4: Drawing with paths
console.log('\nTest 4: Drawing with paths');
{
  const canvas = createCanvas(100, 100);
  const ctx = canvas.getContext('2d');

  // Fill background
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, 100, 100);

  // Draw a blue circle
  ctx.beginPath();
  ctx.arc(50, 50, 30, 0, Math.PI * 2);
  ctx.fillStyle = 'blue';
  ctx.fill();

  // Check pixel data
  const imageData = ctx.getImageData(50, 50, 1, 1);
  console.log('  Pixel at center:', Array.from(imageData.data));
  console.log('  Expected: [0, 0, 255, 255]');

  // Save
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync('./test-output/debug_circle.png', buffer);
  console.log('  Saved: debug_circle.png');
}

// Test 5: Try different drawing operations
console.log('\nTest 5: Different drawing operations');
{
  const canvas = createCanvas(100, 100);
  const ctx = canvas.getContext('2d');

  // Try putImageData
  const imgData = ctx.createImageData(100, 100);
  for (let i = 0; i < imgData.data.length; i += 4) {
    imgData.data[i] = 255;     // R
    imgData.data[i + 1] = 255; // G
    imgData.data[i + 2] = 0;   // B
    imgData.data[i + 3] = 255; // A
  }
  ctx.putImageData(imgData, 0, 0);

  // Check pixel data
  const imageData = ctx.getImageData(50, 50, 1, 1);
  console.log('  Pixel at (50,50):', Array.from(imageData.data));
  console.log('  Expected: [255, 255, 0, 255]');

  // Save
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync('./test-output/debug_putimagedata.png', buffer);
  console.log('  Saved: debug_putimagedata.png');
}

console.log('\nAll tests completed.');
console.log('\nRecommendation:');
console.log('If all pixels are [0, 0, 0, 255] (black), this confirms a Node.js v25 compatibility issue.');
console.log('The best solution is to downgrade to Node.js v20 LTS.');