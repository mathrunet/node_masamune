const { createCanvas } = require('canvas');
const ImageComposer = require('../renderers/image-composer');
const TextRenderer = require('../renderers/text-renderer');
const path = require('path');
const fs = require('fs');

class LogoGenerator {
  constructor() {
    this.composer = new ImageComposer();
    this.textRenderer = new TextRenderer();
  }

  /**
   * ロゴを生成
   * @param {Object} config - ロゴ設定
   * @param {string} outputDir - 出力ディレクトリ
   */
  async generate(config, outputDir) {
    if (!config) {
      console.log('⚠ Logo config not specified, skipping logo generation');
      return null;
    }

    const outputPath = path.join(outputDir, 'logo.png');

    if (config.path) {
      // 画像からロゴをコピー
      await this.copyLogoImage(config.path, outputPath);
    } else if (config.text) {
      // テキストからロゴを生成
      await this.generateTextLogo(config, outputPath);
    } else {
      console.log('⚠ Logo config must have either path or text, skipping logo generation');
      return null;
    }

    console.log(`✓ Generated logo: ${outputPath}`);
    return outputPath;
  }

  /**
   * ロゴ画像をコピー
   * @param {string} sourcePath - ソースパス
   * @param {string} outputPath - 出力パス
   */
  async copyLogoImage(sourcePath, outputPath) {
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Logo image not found: ${sourcePath}`);
    }

    // 画像を読み込んで再保存（サイズ調整も可能）
    const logo = await this.composer.loadImage(sourcePath);
    const { canvas, ctx } = this.composer.createCanvas(logo.width, logo.height);

    ctx.drawImage(logo, 0, 0);

    await this.composer.saveAsPNG(canvas, outputPath);
  }

  /**
   * テキストからロゴを生成
   * @param {Object} config - ロゴ設定
   * @param {string} outputPath - 出力パス
   */
  async generateTextLogo(config, outputPath) {
    const {
      text,
      font_family = 'Arial',
      font_size = 72,
      font_weight = 'bold',
      color = '#000000',
      background_color,
      width = 512,
      height = 512,
      padding = 50,
      text_border = null  // ボーダー設定
    } = config;

    const { canvas, ctx } = this.composer.createCanvas(width, height);

    // 背景を描画
    if (background_color) {
      ctx.fillStyle = background_color;
      ctx.fillRect(0, 0, width, height);
    } else {
      // 透明背景
      ctx.clearRect(0, 0, width, height);
    }

    // テキストを描画（ボーダー設定を含む）
    this.textRenderer.renderCentered(ctx, text, width, height, {
      fontSize: font_size,
      fontFamily: font_family,
      fontWeight: font_weight,
      color: color,
      border: text_border  // ボーダー設定を渡す
    });

    await this.composer.saveAsPNG(canvas, outputPath);
  }
}

module.exports = LogoGenerator;
