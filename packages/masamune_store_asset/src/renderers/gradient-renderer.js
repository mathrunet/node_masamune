const { createCanvas } = require('canvas');

class GradientRenderer {
  /**
   * Node.js v25対策: putImageDataを使用して色を直接設定
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D コンテキスト
   * @param {number} width - 幅
   * @param {number} height - 高さ
   * @param {Array} colors - RGBカラー配列 [r, g, b]
   */
  fillWithImageData(ctx, width, height, colors) {
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      data[i] = colors[0];     // R
      data[i + 1] = colors[1]; // G
      data[i + 2] = colors[2]; // B
      data[i + 3] = 255;       // A
    }

    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * 16進数カラーをRGBに変換
   * @param {string} hex - 16進数カラー
   * @returns {Array} [r, g, b]
   */
  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16)
    ] : [255, 255, 255];
  }

  /**
   * グラデーションをputImageDataで描画
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D コンテキスト
   * @param {number} width - 幅
   * @param {number} height - 高さ
   * @param {Array<string>} colors - カラー配列
   * @param {number} angle - 角度（0-360度）
   */
  renderGradientWithImageData(ctx, width, height, colors, angle = 0) {
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    // 角度をラジアンに変換
    const angleRad = (angle * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    // グラデーションの色をRGBに変換
    const rgbColors = colors.map(c => this.hexToRgb(c));

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // グラデーションの位置を計算
        const dx = x - width / 2;
        const dy = y - height / 2;
        const distance = dx * cos + dy * sin;
        const maxDistance = Math.sqrt(width * width + height * height) / 2;
        let position = (distance + maxDistance) / (2 * maxDistance);
        position = Math.max(0, Math.min(1, position));

        // 色を補間
        const colorIndex = position * (rgbColors.length - 1);
        const lowerIndex = Math.floor(colorIndex);
        const upperIndex = Math.min(lowerIndex + 1, rgbColors.length - 1);
        const t = colorIndex - lowerIndex;

        const r = Math.round(rgbColors[lowerIndex][0] * (1 - t) + rgbColors[upperIndex][0] * t);
        const g = Math.round(rgbColors[lowerIndex][1] * (1 - t) + rgbColors[upperIndex][1] * t);
        const b = Math.round(rgbColors[lowerIndex][2] * (1 - t) + rgbColors[upperIndex][2] * t);

        const index = (y * width + x) * 4;
        data[index] = r;
        data[index + 1] = g;
        data[index + 2] = b;
        data[index + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }
  /**
   * グラデーション背景を描画
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D コンテキスト
   * @param {number} width - 幅
   * @param {number} height - 高さ
   * @param {Object} gradientConfig - グラデーション設定
   */
  render(ctx, width, height, gradientConfig) {
    if (!gradientConfig || !gradientConfig.colors || gradientConfig.colors.length === 0) {
      throw new Error('Gradient configuration must include colors array');
    }

    const { type = 'linear', colors, angle = 0 } = gradientConfig;

    // Node.js v25の場合はputImageDataを使用
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));

    if (majorVersion >= 25) {
      // Node.js v25以上: putImageDataを使用した回避策
      if (type === 'linear') {
        this.renderGradientWithImageData(ctx, width, height, colors, angle);
      } else if (type === 'radial') {
        // 放射状グラデーションも同様に実装が必要（今回は線形のみ対応）
        this.renderGradientWithImageData(ctx, width, height, colors, 0);
      } else {
        throw new Error(`Unsupported gradient type: ${type}`);
      }
    } else {
      // Node.js v24以下: 通常の描画方法
      // globalCompositeOperationを明示的に設定
      ctx.globalCompositeOperation = 'source-over';

      // まず白背景を描画（canvasの描画問題の回避策）
      ctx.fillStyle = 'rgb(255, 255, 255)';
      ctx.fillRect(0, 0, width, height);

      // 念のためもう一度白で塗りつぶす
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      let gradient;

      if (type === 'linear') {
        gradient = this.createLinearGradient(ctx, width, height, colors, angle);
      } else if (type === 'radial') {
        gradient = this.createRadialGradient(ctx, width, height, colors);
      } else {
        throw new Error(`Unsupported gradient type: ${type}`);
      }

      // グラデーションを適用
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      // 強制的にcanvasをフラッシュ
      try {
        ctx.getImageData(0, 0, 1, 1);
      } catch (e) {
        // エラーは無視
      }
    }
  }

  /**
   * 線形グラデーションを作成
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D コンテキスト
   * @param {number} width - 幅
   * @param {number} height - 高さ
   * @param {Array<string>} colors - カラー配列
   * @param {number} angle - 角度（0-360度）
   * @returns {CanvasGradient} グラデーションオブジェクト
   */
  createLinearGradient(ctx, width, height, colors, angle = 0) {
    // 角度をラジアンに変換
    const angleRad = (angle * Math.PI) / 180;

    // グラデーションの開始点と終了点を計算
    const { x0, y0, x1, y1 } = this.calculateGradientCoordinates(width, height, angleRad);

    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);

    // カラーストップを追加
    colors.forEach((color, index) => {
      const position = index / (colors.length - 1);
      gradient.addColorStop(position, color);
    });

    return gradient;
  }

  /**
   * 放射状グラデーションを作成
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D コンテキスト
   * @param {number} width - 幅
   * @param {number} height - 高さ
   * @param {Array<string>} colors - カラー配列
   * @returns {CanvasGradient} グラデーションオブジェクト
   */
  createRadialGradient(ctx, width, height, colors) {
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.max(width, height) / 2;

    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);

    // カラーストップを追加
    colors.forEach((color, index) => {
      const position = index / (colors.length - 1);
      gradient.addColorStop(position, color);
    });

    return gradient;
  }

  /**
   * グラデーションの座標を計算
   * @param {number} width - 幅
   * @param {number} height - 高さ
   * @param {number} angleRad - 角度（ラジアン）
   * @returns {Object} 座標オブジェクト {x0, y0, x1, y1}
   */
  calculateGradientCoordinates(width, height, angleRad) {
    // 中心点
    const centerX = width / 2;
    const centerY = height / 2;

    // 対角線の長さの半分
    const diagonal = Math.sqrt(width * width + height * height) / 2;

    // 開始点
    const x0 = centerX - Math.cos(angleRad) * diagonal;
    const y0 = centerY - Math.sin(angleRad) * diagonal;

    // 終了点
    const x1 = centerX + Math.cos(angleRad) * diagonal;
    const y1 = centerY + Math.sin(angleRad) * diagonal;

    return { x0, y0, x1, y1 };
  }

  /**
   * 単色背景を描画
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D コンテキスト
   * @param {number} width - 幅
   * @param {number} height - 高さ
   * @param {string} color - 色
   */
  renderSolidColor(ctx, width, height, color) {
    // Node.js v25の場合はputImageDataを使用
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));

    if (majorVersion >= 25) {
      // Node.js v25以上: putImageDataを使用した回避策
      const rgb = this.hexToRgb(color);
      this.fillWithImageData(ctx, width, height, rgb);
    } else {
      // Node.js v24以下: 通常の描画方法
      // globalCompositeOperationを明示的に設定
      ctx.globalCompositeOperation = 'source-over';

      // まず白背景を描画（canvasの描画問題の回避策）
      ctx.fillStyle = 'rgb(255, 255, 255)';
      ctx.fillRect(0, 0, width, height);

      // 念のためもう一度白で塗りつぶす
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      // 指定された色を適用
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      // 強制的にcanvasをフラッシュ
      try {
        ctx.getImageData(0, 0, 1, 1);
      } catch (e) {
        // エラーは無視
      }
    }
  }

  /**
   * 背景を描画（グラデーションまたは単色）
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D コンテキスト
   * @param {number} width - 幅
   * @param {number} height - 高さ
   * @param {Object} backgroundConfig - 背景設定
   */
  renderBackground(ctx, width, height, backgroundConfig) {
    if (backgroundConfig.gradient) {
      this.render(ctx, width, height, backgroundConfig.gradient);
    } else if (backgroundConfig.color) {
      this.renderSolidColor(ctx, width, height, backgroundConfig.color);
    } else {
      // デフォルトは透明
      ctx.clearRect(0, 0, width, height);
    }
  }
}

module.exports = GradientRenderer;
