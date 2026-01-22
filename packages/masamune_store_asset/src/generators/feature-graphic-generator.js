const ImageComposer = require('../renderers/image-composer');
const GradientRenderer = require('../renderers/gradient-renderer');
const TextRenderer = require('../renderers/text-renderer');
const path = require('path');

class FeatureGraphicGenerator {
  constructor() {
    this.composer = new ImageComposer();
    this.gradientRenderer = new GradientRenderer();
    this.textRenderer = new TextRenderer();
    // Google Playのフィーチャーグラフィック要件
    this.width = 1024;
    this.height = 500;
  }

  /**
   * フィーチャーグラフィックを生成
   * @param {Object} config - フィーチャーグラフィック設定
   * @param {string} outputDir - 出力ディレクトリ
   */
  async generate(config, outputDir) {
    const outputPath = path.join(outputDir, 'feature_graphic.png');
    const { canvas, ctx } = this.composer.createCanvas(this.width, this.height);

    // 背景を描画
    if (config.background) {
      await this.drawBackground(ctx, config.background);
    }

    // フォアグラウンドを描画
    if (config.foreground?.path) {
      const foreground = await this.composer.loadImage(config.foreground.path);
      this.composer.drawImageCentered(ctx, foreground, this.width, this.height, {
        scale: config.foreground.scale || 1
      });
    }

    // アイコンを描画（画像パスまたはテキストから生成）
    if (config.icon) {
      let iconImage;

      if (config.icon.path) {
        // パターン1: 画像パスから読み込み
        iconImage = await this.composer.loadImage(config.icon.path);
      } else if (config.icon.text) {
        // パターン2: テキストから生成
        const iconCanvas = await this.generateTextLogoCanvas(config.icon);
        iconImage = iconCanvas;
      }

      if (iconImage) {
        this.composer.drawImageAligned(ctx, iconImage, this.width, this.height, {
          align: config.icon.align || 'bottom-right',  // デフォルトは右下
          scale: config.icon.scale || 0.2,
          marginX: config.icon.marginX || 20,
          marginY: config.icon.marginY || 20
        });
      }
    }

    // ロゴを描画（画像パスまたはテキストから生成）
    if (config.logo) {
      let logoImage;

      if (config.logo.path) {
        // パターン1: 画像パスから読み込み
        logoImage = await this.composer.loadImage(config.logo.path);
      } else if (config.logo.text) {
        // パターン2: テキストから生成
        const logoCanvas = await this.generateTextLogoCanvas(config.logo);
        logoImage = logoCanvas;
      }

      if (logoImage) {
        this.composer.drawImageAligned(ctx, logoImage, this.width, this.height, {
          align: config.logo.align || 'bottom-right',  // デフォルトは右下
          scale: config.logo.scale || 0.15,
          marginX: config.logo.marginX || 20,
          marginY: config.logo.marginY || 20
        });
      }
    }

    await this.composer.saveAsPNG(canvas, outputPath);
    console.log(`✓ Generated feature graphic: ${outputPath}`);

    return outputPath;
  }

  /**
   * テキストからロゴ/アイコンのキャンバスを生成
   * @param {Object} logoConfig - ロゴ設定
   * @returns {Canvas} 生成されたキャンバス
   */
  async generateTextLogoCanvas(logoConfig) {
    const {
      text,
      font_family = 'Arial',
      font_size = 60,
      font_weight = 'bold',
      color = '#000000',
      background_color,
      width = 200,
      height = 100,
      text_border = null  // ボーダー設定
    } = logoConfig;

    // キャンバスを作成（背景色の有無で透明/不透明を切り替え）
    const { canvas, ctx } = this.composer.createCanvas(width, height, {
      transparent: !background_color  // 背景色がない場合は透明
    });

    // 背景色が指定されている場合のみ塗りつぶし
    if (background_color) {
      ctx.fillStyle = background_color;
      ctx.fillRect(0, 0, width, height);
    }

    // テキストを中央に描画（TextRendererを使用してボーダー対応）
    this.textRenderer.renderCentered(ctx, text, width, height, {
      fontSize: font_size,
      fontFamily: font_family,
      fontWeight: font_weight,
      color: color,
      border: text_border  // ボーダー設定を渡す
    });

    return canvas;
  }

  /**
   * 背景を描画
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D コンテキスト
   * @param {Object} backgroundConfig - 背景設定
   */
  async drawBackground(ctx, backgroundConfig) {
    if (backgroundConfig.path) {
      // 画像背景
      const background = await this.composer.loadImage(backgroundConfig.path);
      this.composer.drawImageResized(ctx, background, this.width, this.height, { fit: 'cover' });
    } else if (backgroundConfig.gradient) {
      // グラデーション背景
      this.gradientRenderer.render(ctx, this.width, this.height, backgroundConfig.gradient);
    } else if (backgroundConfig.color) {
      // 単色背景
      this.gradientRenderer.renderSolidColor(ctx, this.width, this.height, backgroundConfig.color);
    } else {
      // デフォルト: 透明
      ctx.clearRect(0, 0, this.width, this.height);
    }
  }
}

module.exports = FeatureGraphicGenerator;
