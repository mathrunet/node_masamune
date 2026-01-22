// テスト用のサンプル画像を生成
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

// ディレクトリを作成
const dir = './assets/screenshots/ja';
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// サンプルスクリーンショットを生成
const width = 1170;
const height = 2532;
const canvas = createCanvas(width, height);
const ctx = canvas.getContext('2d');

// 背景を塗りつぶし
ctx.fillStyle = '#2C3E50';
ctx.fillRect(0, 0, width, height);

// テキストを描画
ctx.fillStyle = '#ECF0F1';
ctx.font = 'bold 80px Arial';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText('Sample App', width / 2, height / 2 - 100);

ctx.font = '40px Arial';
ctx.fillText('Screenshot', width / 2, height / 2 + 50);

// ファイルとして保存
const buffer = canvas.toBuffer('image/png');
fs.writeFileSync(path.join(dir, 'screen1.png'), buffer);

console.log('✓ テスト画像を生成しました: ' + path.join(dir, 'screen1.png'));