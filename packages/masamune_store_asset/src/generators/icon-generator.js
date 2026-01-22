const { createCanvas } = require('canvas');
const ImageComposer = require('../renderers/image-composer');
const GradientRenderer = require('../renderers/gradient-renderer');
const path = require('path');

class IconGenerator {
  constructor() {
    this.composer = new ImageComposer();
    this.gradientRenderer = new GradientRenderer();
  }

  /**
   * アイコンを生成
   * @param {Object} config - アイコン設定
   * @param {string} outputDir - 出力ディレクトリ
   */
  async generate(config, outputDir) {
    const icons = [];

    // 標準アイコンサイズ
    const sizes = [512, 1024, 2048];

    for (const size of sizes) {
      const outputPath = path.join(outputDir, `icon_${size}.png`);
      await this.generateIcon(config, size, outputPath);
      icons.push(outputPath);
      console.log(`✓ Generated icon: ${outputPath}`);
    }

    // Androidアダプティブアイコン
    if (config.foreground && config.background) {
      // Foreground（透過PNG）
      const foregroundPath = path.join(outputDir, 'android_adaptive_foreground.png');
      await this.generateAdaptiveForeground(config.foreground, foregroundPath);
      icons.push(foregroundPath);
      console.log(`✓ Generated adaptive foreground: ${foregroundPath}`);

      // Background
      const backgroundPath = path.join(outputDir, 'android_adaptive_background.png');
      await this.generateAdaptiveBackground(config.background, backgroundPath);
      icons.push(backgroundPath);
      console.log(`✓ Generated adaptive background: ${backgroundPath}`);
    }

    return icons;
  }

  /**
   * 単一サイズのアイコンを生成
   * @param {Object} config - アイコン設定
   * @param {number} size - サイズ
   * @param {string} outputPath - 出力パス
   */
  async generateIcon(config, size, outputPath) {
    const { canvas, ctx } = this.composer.createCanvas(size, size);

    // 背景を描画
    if (config.background) {
      await this.drawBackground(ctx, size, size, config.background);
    }

    // フォアグラウンドを描画
    if (config.foreground?.path) {
      const foreground = await this.composer.loadImage(config.foreground.path);
      const scale = size / foreground.width;
      this.composer.drawImageCentered(ctx, foreground, size, size, {
        scale: scale * (config.foreground.scale || 1)
      });
    }

    await this.composer.saveAsPNG(canvas, outputPath);
  }

  /**
   * アダプティブアイコンのフォアグラウンドを生成
   * @param {Object} foregroundConfig - フォアグラウンド設定
   * @param {string} outputPath - 出力パス
   */
  async generateAdaptiveForeground(foregroundConfig, outputPath) {
    const size = 512; // Androidアダプティブアイコンの推奨サイズ
    const foregroundScale = 0.625;
    // 透過背景でキャンバスを作成
    const { canvas, ctx } = this.composer.createCanvas(size, size, { transparent: true });

    // 透過背景を確実にする
    ctx.clearRect(0, 0, size, size);

    // フォアグラウンド画像を描画
    if (foregroundConfig.path) {
      const foreground = await this.composer.loadImage(foregroundConfig.path);
      const scale = size / foreground.width;
      this.composer.drawImageCentered(ctx, foreground, size, size, {
        scale: scale * foregroundScale * (foregroundConfig.scale || 1)
      });
    }

    await this.composer.saveAsPNG(canvas, outputPath);
  }

  /**
   * アダプティブアイコンのバックグラウンドを生成
   * @param {Object} backgroundConfig - バックグラウンド設定
   * @param {string} outputPath - 出力パス
   */
  async generateAdaptiveBackground(backgroundConfig, outputPath) {
    const size = 512; // Androidアダプティブアイコンの推奨サイズ
    const { canvas, ctx } = this.composer.createCanvas(size, size);

    await this.drawBackground(ctx, size, size, backgroundConfig);

    await this.composer.saveAsPNG(canvas, outputPath);
  }

  /**
   * 背景を描画
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D コンテキスト
   * @param {number} width - 幅
   * @param {number} height - 高さ
   * @param {Object} backgroundConfig - 背景設定
   */
  async drawBackground(ctx, width, height, backgroundConfig) {
    if (backgroundConfig.path) {
      // 画像背景
      const background = await this.composer.loadImage(backgroundConfig.path);
      this.composer.drawImageResized(ctx, background, width, height, { fit: 'cover' });
    } else if (backgroundConfig.gradient) {
      // グラデーション背景
      this.gradientRenderer.render(ctx, width, height, backgroundConfig.gradient);
    } else if (backgroundConfig.color) {
      // 単色背景
      this.gradientRenderer.renderSolidColor(ctx, width, height, backgroundConfig.color);
    } else {
      // デフォルト: 透明
      ctx.clearRect(0, 0, width, height);
    }
  }
}

module.exports = IconGenerator;
