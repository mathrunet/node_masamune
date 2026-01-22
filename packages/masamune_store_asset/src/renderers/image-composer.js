const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');

class ImageComposer {
  /**
   * 画像を読み込む
   * @param {string} imagePath - 画像パス
   * @returns {Promise<Image>} 読み込まれた画像
   */
  async loadImage(imagePath) {
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`);
    }

    try {
      return await loadImage(imagePath);
    } catch (error) {
      throw new Error(`Failed to load image ${imagePath}: ${error.message}`);
    }
  }

  /**
   * 画像を指定位置に描画
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D コンテキスト
   * @param {Image} image - 画像オブジェクト
   * @param {Object} options - 描画オプション
   */
  drawImage(ctx, image, options = {}) {
    const {
      x = 0,
      y = 0,
      width = image.width,
      height = image.height,
      scale = 1,
      centerX = false,
      centerY = false
    } = options;

    const scaledWidth = width * scale;
    const scaledHeight = height * scale;

    let drawX = x;
    let drawY = y;

    if (centerX) {
      drawX = x - scaledWidth / 2;
    }

    if (centerY) {
      drawY = y - scaledHeight / 2;
    }

    ctx.drawImage(image, drawX, drawY, scaledWidth, scaledHeight);
  }

  /**
   * 画像を中央に配置して描画
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D コンテキスト
   * @param {Image} image - 画像オブジェクト
   * @param {number} canvasWidth - キャンバス幅
   * @param {number} canvasHeight - キャンバス高さ
   * @param {Object} options - 追加オプション
   */
  drawImageCentered(ctx, image, canvasWidth, canvasHeight, options = {}) {
    const { scale = 1 } = options;

    const scaledWidth = image.width * scale;
    const scaledHeight = image.height * scale;

    const x = (canvasWidth - scaledWidth) / 2;
    const y = (canvasHeight - scaledHeight) / 2;

    ctx.drawImage(image, x, y, scaledWidth, scaledHeight);
  }

  /**
   * 画像を指定された配置位置に描画
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D コンテキスト
   * @param {Image} image - 画像オブジェクト
   * @param {number} canvasWidth - キャンバス幅
   * @param {number} canvasHeight - キャンバス高さ
   * @param {Object} options - 描画オプション
   * @param {string} options.align - 配置位置 (top-left, top-center, top-right, left-center, center, right-center, bottom-left, bottom-center, bottom-right)
   * @param {number} options.scale - 画像のスケール
   * @param {number} options.marginX - X軸方向の余白
   * @param {number} options.marginY - Y軸方向の余白
   * @param {number} options.x - カスタムX座標（alignが指定されていない場合に使用）
   * @param {number} options.y - カスタムY座標（alignが指定されていない場合に使用）
   */
  drawImageAligned(ctx, image, canvasWidth, canvasHeight, options = {}) {
    const {
      align = 'bottom-right',  // デフォルトは右下
      scale = 1,
      marginX = 20,
      marginY = 20,
      x: customX,
      y: customY
    } = options;

    const scaledWidth = image.width * scale;
    const scaledHeight = image.height * scale;

    let x, y;

    switch(align) {
      case 'top-left':
        x = marginX;
        y = marginY;
        break;
      case 'top-center':
        x = (canvasWidth - scaledWidth) / 2;
        y = marginY;
        break;
      case 'top-right':
        x = canvasWidth - scaledWidth - marginX;
        y = marginY;
        break;
      case 'left-center':
        x = marginX;
        y = (canvasHeight - scaledHeight) / 2;
        break;
      case 'center':
        x = (canvasWidth - scaledWidth) / 2;
        y = (canvasHeight - scaledHeight) / 2;
        break;
      case 'right-center':
        x = canvasWidth - scaledWidth - marginX;
        y = (canvasHeight - scaledHeight) / 2;
        break;
      case 'bottom-left':
        x = marginX;
        y = canvasHeight - scaledHeight - marginY;
        break;
      case 'bottom-center':
        x = (canvasWidth - scaledWidth) / 2;
        y = canvasHeight - scaledHeight - marginY;
        break;
      case 'bottom-right':
        x = canvasWidth - scaledWidth - marginX;
        y = canvasHeight - scaledHeight - marginY;
        break;
      case 'custom':
        // カスタム座標を使用
        x = customX || 0;
        y = customY || 0;
        break;
      default:
        // デフォルトは右下
        x = canvasWidth - scaledWidth - marginX;
        y = canvasHeight - scaledHeight - marginY;
    }

    ctx.drawImage(image, x, y, scaledWidth, scaledHeight);
  }

  /**
   * 画像をリサイズして描画
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D コンテキスト
   * @param {Image} image - 画像オブジェクト
   * @param {number} targetWidth - 目標幅
   * @param {number} targetHeight - 目標高さ
   * @param {Object} options - オプション
   */
  drawImageResized(ctx, image, targetWidth, targetHeight, options = {}) {
    const {
      fit = 'contain', // 'contain', 'cover', 'fill'
      x = 0,
      y = 0
    } = options;

    let drawWidth = targetWidth;
    let drawHeight = targetHeight;
    let drawX = x;
    let drawY = y;

    if (fit === 'contain') {
      const scale = Math.min(targetWidth / image.width, targetHeight / image.height);
      drawWidth = image.width * scale;
      drawHeight = image.height * scale;
      drawX = x + (targetWidth - drawWidth) / 2;
      drawY = y + (targetHeight - drawHeight) / 2;
    } else if (fit === 'cover') {
      const scale = Math.max(targetWidth / image.width, targetHeight / image.height);
      drawWidth = image.width * scale;
      drawHeight = image.height * scale;
      drawX = x + (targetWidth - drawWidth) / 2;
      drawY = y + (targetHeight - drawHeight) / 2;
    }
    // 'fill'の場合はデフォルト値をそのまま使用

    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  }

  /**
   * フレームとスクリーンショットを合成
   * @param {Image} frame - デバイスフレーム画像
   * @param {Image} screenshot - スクリーンショット画像
   * @param {Object} frameConfig - フレーム設定
   * @returns {Canvas} 合成されたキャンバス
   */
  async compositeFrameAndScreenshot(frame, screenshot, frameConfig = {}) {
    const {
      screenshotX = 0,
      screenshotY = 0,
      screenshotWidth,
      screenshotHeight,
      scale = 1
    } = frameConfig;

    // this.createCanvasを使用して、白背景が適用されるようにする
    const { canvas, ctx } = this.createCanvas(frame.width, frame.height);

    // スクリーンショットを先に描画
    if (screenshotWidth && screenshotHeight) {
      ctx.drawImage(screenshot, screenshotX, screenshotY, screenshotWidth, screenshotHeight);
    } else {
      this.drawImageResized(ctx, screenshot, frame.width, frame.height, { fit: 'contain' });
    }

    // フレームを上に重ねる
    ctx.drawImage(frame, 0, 0, frame.width, frame.height);

    return canvas;
  }

  /**
   * 画像をPNGとして保存
   * @param {Canvas} canvas - キャンバス
   * @param {string} outputPath - 出力パス
   * @param {Object} options - 保存オプション
   */
  async saveAsPNG(canvas, outputPath, options = {}) {
    const { quality = 0.95 } = options;

    // ディレクトリが存在しない場合は作成
    const dir = require('path').dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Node.js v25対策: PNG出力オプションを調整
    const buffer = canvas.toBuffer('image/png', {
      compressionLevel: 6,  // 9から6に変更
      filters: canvas.PNG_ALL_FILTERS || canvas.PNG_FILTER_NONE
    });

    fs.writeFileSync(outputPath, buffer);
  }

  /**
   * キャンバスを作成
   * @param {number} width - 幅
   * @param {number} height - 高さ
   * @param {Object} options - オプション
   * @param {boolean} options.transparent - 透過背景にするかどうか
   * @returns {Object} {canvas, ctx}
   */
  createCanvas(width, height, options = {}) {
    const { transparent = false } = options;

    // 'image'タイプを明示的に指定（Node.js v25対策）
    const canvas = createCanvas(width, height, 'image');

    // alphaは常に有効にする（alpha: falseだとテキスト描画が機能しない）
    const ctx = canvas.getContext('2d');

    // 透過背景の場合は白背景の塗りつぶしをスキップ
    if (!transparent) {
      // Node.js v25の場合はputImageDataで白背景を設定
      const nodeVersion = process.version;
      const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));

      if (majorVersion >= 25) {
        // Node.js v25以上: putImageDataを使用して白背景を設定
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          data[i] = 255;     // R
          data[i + 1] = 255; // G
          data[i + 2] = 255; // B
          data[i + 3] = 255; // A
        }

        ctx.putImageData(imageData, 0, 0);
      } else {
        // Node.js v24以下: 通常の方法
        // globalCompositeOperationを明示的に設定
        ctx.globalCompositeOperation = 'source-over';

        // Canvas初期化の問題を回避するため、明示的に白で塗りつぶす
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);

        // 念のため、もう一度白で塗りつぶす（node-canvasのバグ対策）
        ctx.fillStyle = 'rgb(255, 255, 255)';
        ctx.fillRect(0, 0, width, height);

        // 強制的にcanvasをフラッシュ
        try {
          ctx.getImageData(0, 0, 1, 1);
        } catch (e) {
          // エラーは無視
        }
      }
    }

    return { canvas, ctx };
  }

  /**
   * 画像のアスペクト比を維持してリサイズ
   * @param {number} originalWidth - 元の幅
   * @param {number} originalHeight - 元の高さ
   * @param {number} targetWidth - 目標幅
   * @param {number} targetHeight - 目標高さ
   * @param {string} fit - フィット方法 ('contain' または 'cover')
   * @returns {Object} {width, height}
   */
  calculateAspectRatioFit(originalWidth, originalHeight, targetWidth, targetHeight, fit = 'contain') {
    const widthRatio = targetWidth / originalWidth;
    const heightRatio = targetHeight / originalHeight;

    let scale;
    if (fit === 'contain') {
      scale = Math.min(widthRatio, heightRatio);
    } else if (fit === 'cover') {
      scale = Math.max(widthRatio, heightRatio);
    } else {
      scale = 1;
    }

    return {
      width: originalWidth * scale,
      height: originalHeight * scale
    };
  }
}

module.exports = ImageComposer;
