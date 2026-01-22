const { createCanvas } = require('canvas');
const ImageComposer = require('../renderers/image-composer');
const GradientRenderer = require('../renderers/gradient-renderer');
const TextRenderer = require('../renderers/text-renderer');
const path = require('path');

class ScreenshotGenerator {
  constructor() {
    this.composer = new ImageComposer();
    this.gradientRenderer = new GradientRenderer();
    this.textRenderer = new TextRenderer();
  }

  /**
   * スクリーンショットを生成
   * @param {Object} config - スクリーンショット設定
   * @param {Array<string>} locales - 言語コード配列
   * @param {string} outputDir - 出力ディレクトリ
   */
  async generate(config, locales, outputDir) {
    const screenshots = [];

    if (!config.sizes) {
      console.warn('⚠ Screenshot sizes not configured, skipping screenshot generation');
      return screenshots;
    }

    for (const locale of locales) {
      // iPhone縦向き
      if (config.portrait && config.sizes.iphone) {
        const portraitPaths = await this.generateOrientedScreenshots(
          config,
          locale,
          'portrait',
          'iphone',
          outputDir
        );
        screenshots.push(...portraitPaths);
      }

      // iPhone横向き
      if (config.landscape && config.sizes.iphone) {
        const landscapePaths = await this.generateOrientedScreenshots(
          config,
          locale,
          'landscape',
          'iphone',
          outputDir
        );
        screenshots.push(...landscapePaths);
      }

      // iPad縦向き
      if (config.portrait && config.sizes.ipad) {
        const ipadPortraitPaths = await this.generateOrientedScreenshots(
          config,
          locale,
          'portrait',
          'ipad',
          outputDir
        );
        screenshots.push(...ipadPortraitPaths);
      }

      // iPad横向き
      if (config.landscape && config.sizes.ipad) {
        const ipadLandscapePaths = await this.generateOrientedScreenshots(
          config,
          locale,
          'landscape',
          'ipad',
          outputDir
        );
        screenshots.push(...ipadLandscapePaths);
      }
    }

    return screenshots;
  }

  /**
   * 指定向きのスクリーンショットを生成
   * @param {Object} config - スクリーンショット設定
   * @param {string} locale - 言語コード
   * @param {string} orientation - 向き（portrait/landscape）
   * @param {string} device - デバイス（iphone/ipad）
   * @param {string} outputDir - 出力ディレクトリ
   */
  async generateOrientedScreenshots(config, locale, orientation, device, outputDir) {
    const screenshots = [];
    const screenshotList = config[orientation];

    if (!screenshotList || !Array.isArray(screenshotList)) {
      return screenshots;
    }

    const sizeConfig = config.sizes[device][orientation];
    const deviceName = config.sizes[device].name;

    for (let i = 0; i < screenshotList.length; i++) {
      const screenshotConfig = screenshotList[i];
      const index = i + 1;

      try {
        const outputPath = path.join(
          outputDir,
          locale,
          deviceName,
          orientation,
          `${index}.png`
        );

        await this.generateSingleScreenshot(
          screenshotConfig,
          locale,
          device,  // デバイスタイプを渡す
          orientation,  // 向きを渡す
          sizeConfig,
          config.background,
          config[`${device}_frame`],
          config.title_border,  // グローバルボーダー設定を渡す
          config.logo,  // グローバルロゴ設定を渡す
          config.icon,  // グローバルアイコン設定を渡す
          outputPath
        );

        screenshots.push(outputPath);
        console.log(`✓ Generated screenshot: ${outputPath}`);
      } catch (error) {
        console.error(`✗ Failed to generate screenshot ${index} for ${locale}/${device}/${orientation}: ${error.message}`);
      }
    }

    return screenshots;
  }

  /**
   * 単一のスクリーンショットを生成
   * @param {Object} screenshotConfig - スクリーンショット設定
   * @param {string} locale - 言語コード
   * @param {string} device - デバイスタイプ（iphone/ipad）
   * @param {string} orientation - 向き（portrait/landscape）
   * @param {Object} sizeConfig - サイズ設定
   * @param {Object} backgroundConfig - 背景設定
   * @param {Object} frameConfig - フレーム設定
   * @param {Object} globalBorderConfig - グローバルボーダー設定
   * @param {Object} globalLogoConfig - グローバルロゴ設定
   * @param {Object} globalIconConfig - グローバルアイコン設定
   * @param {string} outputPath - 出力パス
   */
  async generateSingleScreenshot(
    screenshotConfig,
    locale,
    device,
    orientation,
    sizeConfig,
    backgroundConfig,
    frameConfig,
    globalBorderConfig,
    globalLogoConfig,
    globalIconConfig,
    outputPath
  ) {
    const { width, height } = sizeConfig;
    const { canvas, ctx } = this.composer.createCanvas(width, height);

    // 1. 背景を描画
    if (backgroundConfig) {
      await this.drawBackground(ctx, width, height, backgroundConfig);
    }

    // landscapeモードの配置パターンを決定
    const layoutPattern = (orientation === 'landscape' && screenshotConfig.layout_pattern)
      ? screenshotConfig.layout_pattern
      : 'default';

    // 2. スクリーンショット画像を描画
    if (screenshotConfig.screenshot) {
      console.log(`[DEBUG] Resolving screenshot for device: ${device}, locale: ${locale}`);
      console.log(`[DEBUG] Screenshot config:`, JSON.stringify(screenshotConfig.screenshot));

      const screenshotPath = this.resolveScreenshotPath(screenshotConfig.screenshot, locale, device);
      console.log(`[DEBUG] Resolved screenshot path: ${screenshotPath}`);

      if (!screenshotPath) {
        console.error(`✗ Screenshot path not resolved for locale '${locale}' and device '${device}'`);
        console.error(`  Config value: ${JSON.stringify(screenshotConfig.screenshot)}`);
        console.error(`  Device type: ${device}, Locale: ${locale}`);
        // 処理を継続（スクリーンショットなしで画像生成）
      } else {
        try {
          const screenshot = await this.composer.loadImage(screenshotPath);
          console.log(`✓ Screenshot loaded: ${screenshotPath} (${screenshot.width}x${screenshot.height})`);

          // landscapeモードで特別な配置パターンを使用
            // 既存のロジック（portraitモードまたはデフォルト）
          if (frameConfig && frameConfig.path) {
            if (orientation === 'landscape' && layoutPattern !== 'default') {
              if (device === 'ipad') {
                // フレーム内の画面領域に配置
                // スクリーンショットをフレーム内に収まるようにスケール調整
                const scale = width * 0.63 / screenshot.width;
                ctx.drawImage(screenshot, width * 0.185, height * 0.4 + 50, width * 0.63, screenshot.height * scale);
              } else if (layoutPattern === 'text-left') {
                // フレーム内の画面領域に配置
                // スクリーンショットをフレーム内に収まるようにスケール調整
                const scale = width * 0.365 / screenshot.width;
                ctx.drawImage(screenshot, width * 0.5375, height * 0.1 + 50, width * 0.365, screenshot.height * scale);
              } else if (layoutPattern === 'text-right') {
                // フレーム内の画面領域に配置
                // スクリーンショットをフレーム内に収まるようにスケール調整
                const scale = width * 0.365 / screenshot.width;
                ctx.drawImage(screenshot, width * 0.105, height * 0.1 + 50, width * 0.365, screenshot.height * scale);
              }
            } else {
              // フレーム内の画面領域に配置
              // スクリーンショットをフレーム内に収まるようにスケール調整
              const scale = width * 0.86 / screenshot.width;
              ctx.drawImage(screenshot, width * ((1.0 - scale) / 2), height * 0.3 + 50, screenshot.width * scale, screenshot.height * scale);
            }
          } else {
            // フレームなしの場合は中央に配置
            // this.composer.drawImageCentered(ctx, screenshot, width, height, {
            //   scale: 0.8
            // });
          }
        } catch (error) {
          console.error(`✗ Failed to load screenshot: ${screenshotPath}`, error.message);
        }
      }
    }

    // 3. テキストを描画
    if (screenshotConfig.title && screenshotConfig.title[locale]) {
      const title = screenshotConfig.title[locale];
      const fontFamily = screenshotConfig.font_family?.[locale] || screenshotConfig.font_family || 'Arial';
      const fontSize = screenshotConfig.font_size || 72;
      const textColor = screenshotConfig.text_color || '#FFFFFF';
      const textMargin = screenshotConfig.text_margin || 100;
      const textMarginTablet = screenshotConfig.text_margin_tablet || 100;

      // 個別のボーダー設定 > グローバルボーダー設定の優先順位
      const borderConfig = screenshotConfig.text_border || globalBorderConfig || null;

      const textOptions = {
        fontSize: fontSize,
        fontFamily: fontFamily,
        color: textColor,
        border: borderConfig
      };

      // landscapeモードで特別な配置パターンを使用
      if (orientation === 'landscape' && layoutPattern !== 'default') {
        if(device === 'ipad') {
          // テキストを左側に配置
          this.textRenderer.render(ctx, title, {
            ...textOptions,
            x: width / 2,
            y: textMarginTablet,
            align: 'center',
            baseline: 'middle'
          });
        } else if (layoutPattern === 'text-left') {
          // テキストを左側に配置
          this.textRenderer.render(ctx, title, {
            ...textOptions,
            x: width * 0.25,
            y: textMargin,
            align: 'center',
            baseline: 'middle'
          });
        } else if (layoutPattern === 'text-right') {
          // テキストを右側に配置
          this.textRenderer.render(ctx, title, {
            ...textOptions,
            x: width * 0.75,
            y: textMargin,
            align: 'center',
            baseline: 'middle'
          });
        }
      } else {
        // 既存のロジック（portraitモードまたはデフォルト）
        this.textRenderer.renderTop(ctx, title, width, textMargin, textOptions);
      }
    }

    // 4. アイコンを描画（テキストの後、ロゴの前）
    // 個別設定 > グローバル設定の優先順位
    let iconConfig = null;

    if (screenshotConfig.icon !== undefined) {
      // 個別設定が存在する場合
      if (screenshotConfig.icon === null || screenshotConfig.icon === false) {
        // 明示的に無効化
        iconConfig = null;
      } else {
        // 個別設定を使用
        iconConfig = screenshotConfig.icon;
      }
    } else {
      // 個別設定がない場合はグローバル設定を使用
      iconConfig = globalIconConfig;
    }

    if (iconConfig) {
      try {
        let iconImage;

        if (iconConfig.path) {
          // パターン1: 画像パスから読み込み
          iconImage = await this.composer.loadImage(iconConfig.path);
          console.log(`✓ Icon loaded: ${iconConfig.path}`);
        } else if (iconConfig.text) {
          // パターン2: テキストから生成
          const iconCanvas = await this.generateTextLogoCanvas(iconConfig);
          iconImage = iconCanvas;
          console.log(`✓ Text icon generated: "${iconConfig.text}"`);
        }

        if (iconImage) {
          this.composer.drawImageAligned(ctx, iconImage, width, height, {
            align: iconConfig.align || 'bottom-left',  // デフォルトは左下（ロゴと重ならないように）
            scale: iconConfig.scale || 0.2,
            marginX: iconConfig.marginX || 20,
            marginY: iconConfig.marginY || 20
          });
          console.log(`✓ Icon applied to screenshot`);
        }
      } catch (error) {
        console.error(`✗ Failed to apply icon: ${error.message}`);
        // アイコンなしで続行
      }
    }

    // 5. ロゴを描画（アイコンの後、フレームの前）
    // 個別設定 > グローバル設定の優先順位
    let logoConfig = null;

    if (screenshotConfig.logo !== undefined) {
      // 個別設定が存在する場合
      if (screenshotConfig.logo === null || screenshotConfig.logo === false) {
        // 明示的に無効化
        logoConfig = null;
      } else {
        // 個別設定を使用
        logoConfig = screenshotConfig.logo;
      }
    } else {
      // 個別設定がない場合はグローバル設定を使用
      logoConfig = globalLogoConfig;
    }

    if (logoConfig) {
      try {
        let logoImage;

        if (logoConfig.path) {
          // パターン1: 画像パスから読み込み
          logoImage = await this.composer.loadImage(logoConfig.path);
          console.log(`✓ Logo loaded: ${logoConfig.path}`);
        } else if (logoConfig.text) {
          // パターン2: テキストから生成
          const logoCanvas = await this.generateTextLogoCanvas(logoConfig);
          logoImage = logoCanvas;
          console.log(`✓ Text logo generated: "${logoConfig.text}"`);
        }

        if (logoImage) {
          this.composer.drawImageAligned(ctx, logoImage, width, height, {
            align: logoConfig.align || 'bottom-right',
            scale: logoConfig.scale || 0.15,
            marginX: logoConfig.marginX || 20,
            marginY: logoConfig.marginY || 20
          });
          console.log(`✓ Logo applied to screenshot`);
        }
      } catch (error) {
        console.error(`✗ Failed to apply logo: ${error.message}`);
        // ロゴなしで続行
      }
    }

    // 6. フレームを描画（最前面）
    if (frameConfig && frameConfig.path) {
      try {
        if (orientation === 'landscape' && layoutPattern !== 'default') {
          if (device === 'ipad') {
            console.log(`[DEBUG] Loading frame: ${frameConfig.path}`);
            const frame = await this.composer.loadImage(frameConfig.path);

            // フレームをキャンバス全体に描画（リサイズして配置）
            const scale = width * 0.7 / frame.width;
            ctx.drawImage(frame, width * 0.15, height * 0.4, width * 0.7, frame.height * scale);
            console.log(`✓ Frame applied: ${frameConfig.path} (${frame.width}x${frame.height} -> ${width}x${height})`);
          } else if (layoutPattern === 'text-left') {
            console.log(`[DEBUG] Loading frame: ${frameConfig.path}`);
            const frame = await this.composer.loadImage(frameConfig.path);

            // フレームをキャンバス全体に描画（リサイズして配置）
            const scale = width * 0.4 / frame.width;
            ctx.drawImage(frame, width * 0.52, height * 0.1, width * 0.4, frame.height * scale);
            console.log(`✓ Frame applied: ${frameConfig.path} (${frame.width}x${frame.height} -> ${width}x${height})`);
          } else if (layoutPattern === 'text-right') {
            console.log(`[DEBUG] Loading frame: ${frameConfig.path}`);
            const frame = await this.composer.loadImage(frameConfig.path);

            // フレームをキャンバス全体に描画（リサイズして配置）
            const scale = width * 0.4 / frame.width;
            ctx.drawImage(frame, width * 0.09, height * 0.1, width * 0.4, frame.height * scale);
            console.log(`✓ Frame applied: ${frameConfig.path} (${frame.width}x${frame.height} -> ${width}x${height})`);
          }
        } else {
          console.log(`[DEBUG] Loading frame: ${frameConfig.path}`);
          const frame = await this.composer.loadImage(frameConfig.path);

          // フレームをキャンバス全体に描画（リサイズして配置）
          ctx.drawImage(frame, width * 0.025, height * 0.3, width * 0.95, height * 0.95);
          console.log(`✓ Frame applied: ${frameConfig.path} (${frame.width}x${frame.height} -> ${width}x${height})`);
        }
      } catch (error) {
        console.error(`✗ Failed to load frame image: ${frameConfig.path}`, error.message);
        // フレームなしで続行
      }
    }

    await this.composer.saveAsPNG(canvas, outputPath);
  }

  /**
   * スクリーンショット画像パスを解決（複数の設定形式をサポート）
   * @param {Object} screenshotConfig - スクリーンショット設定全体
   * @param {string} locale - 言語コード（ja/en）
   * @param {string} device - デバイスタイプ（iphone/ipad）
   * @returns {string|null} 画像パス
   */
  resolveScreenshotPath(screenshotConfig, locale, device) {
    console.log(`[DEBUG] resolveScreenshotPath called with locale: ${locale}, device: ${device}`);
    console.log(`[DEBUG] screenshotConfig type: ${typeof screenshotConfig}`);
    console.log(`[DEBUG] screenshotConfig value:`, screenshotConfig);

    // デバイスタイプのマッピング（iphone -> phone, ipad -> tablet）
    const deviceTypeMap = {
      iphone: 'phone',
      ipad: 'tablet'
    };
    const deviceType = deviceTypeMap[device] || device;
    console.log(`[DEBUG] Mapped device type: ${device} -> ${deviceType}`);

    // パターン1: screenshot.locale.device (元の実装)
    if (screenshotConfig[locale]) {
      console.log(`[DEBUG] Found locale '${locale}' in config`);
      const localeConfig = screenshotConfig[locale];

      if (typeof localeConfig === 'string') {
        // screenshot.ja: "path/to/image.png"
        console.log(`[DEBUG] Simple string path for locale: ${localeConfig}`);
        return localeConfig;
      } else if (typeof localeConfig === 'object' && localeConfig[deviceType]) {
        // screenshot.ja.phone: "path/to/image.png"
        console.log(`[DEBUG] Found device-specific path (pattern 1): ${localeConfig[deviceType]}`);
        return localeConfig[deviceType];
      }
    }

    // パターン2: screenshot.device.locale (新しい形式)
    if (screenshotConfig[deviceType]) {
      console.log(`[DEBUG] Found device type '${deviceType}' in config`);
      const deviceConfig = screenshotConfig[deviceType];

      if (typeof deviceConfig === 'object' && deviceConfig[locale]) {
        // screenshot.phone.ja: "path/to/image.png"
        console.log(`[DEBUG] Found device-specific path (pattern 2): ${deviceConfig[locale]}`);
        return deviceConfig[locale];
      }
    }

    // パターン3: 直接文字列（すべてのデバイス・言語で共通）
    if (typeof screenshotConfig === 'string') {
      console.log(`[DEBUG] Direct string path: ${screenshotConfig}`);
      return screenshotConfig;
    }

    console.log(`[DEBUG] No valid path found for locale '${locale}' and device '${deviceType}'`);
    return null;
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
      color = '#FFFFFF',
      background_color,
      width = 200,
      height = 100,
      text_border = null
    } = logoConfig;

    // キャンバスを作成（背景色の有無で透明/不透明を切り替え）
    const { canvas, ctx } = this.composer.createCanvas(width, height, {
      transparent: !background_color
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
      border: text_border
    });

    return canvas;
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

module.exports = ScreenshotGenerator;
