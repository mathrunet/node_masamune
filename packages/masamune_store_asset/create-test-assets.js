const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

// テスト用アセットを作成
async function createTestAssets() {
  // アセットディレクトリ作成
  const assetsDir = path.join(__dirname, 'test-assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  // アイコン作成（正方形）
  const iconCanvas = createCanvas(512, 512);
  const iconCtx = iconCanvas.getContext('2d');

  // グラデーション背景
  const iconGradient = iconCtx.createLinearGradient(0, 0, 512, 512);
  iconGradient.addColorStop(0, '#667eea');
  iconGradient.addColorStop(1, '#764ba2');
  iconCtx.fillStyle = iconGradient;
  iconCtx.fillRect(0, 0, 512, 512);

  // 白い円
  iconCtx.fillStyle = '#FFFFFF';
  iconCtx.beginPath();
  iconCtx.arc(256, 256, 150, 0, Math.PI * 2);
  iconCtx.fill();

  // アイコン保存
  const iconBuffer = iconCanvas.toBuffer('image/png');
  fs.writeFileSync(path.join(assetsDir, 'icon.png'), iconBuffer);
  console.log('✓ Created test icon');

  // ロゴ作成（横長）
  const logoCanvas = createCanvas(800, 200);
  const logoCtx = logoCanvas.getContext('2d');

  // 背景（透明にするため何も描画しない）

  // テキストロゴ
  logoCtx.fillStyle = '#FFFFFF';
  logoCtx.font = 'bold 100px sans-serif';
  logoCtx.textAlign = 'center';
  logoCtx.textBaseline = 'middle';
  logoCtx.fillText('TEST LOGO', 400, 100);

  // ロゴ保存
  const logoBuffer = logoCanvas.toBuffer('image/png');
  fs.writeFileSync(path.join(assetsDir, 'logo.png'), logoBuffer);
  console.log('✓ Created test logo');

  // フォアグラウンド作成
  const fgCanvas = createCanvas(600, 400);
  const fgCtx = fgCanvas.getContext('2d');

  // 半透明の背景
  fgCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  fgCtx.fillRect(50, 50, 500, 300);

  // テキスト
  fgCtx.fillStyle = '#333333';
  fgCtx.font = 'bold 60px sans-serif';
  fgCtx.textAlign = 'center';
  fgCtx.textBaseline = 'middle';
  fgCtx.fillText('FOREGROUND', 300, 200);

  // フォアグラウンド保存
  const fgBuffer = fgCanvas.toBuffer('image/png');
  fs.writeFileSync(path.join(assetsDir, 'foreground.png'), fgBuffer);
  console.log('✓ Created test foreground');
}

createTestAssets().then(() => {
  console.log('✨ All test assets created');
}).catch(error => {
  console.error('Error creating test assets:', error);
});