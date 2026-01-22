const { registerFont } = require('canvas');
const fs = require('fs');

class FontLoader {
  constructor() {
    this.registeredFonts = new Map();
  }

  /**
   * フォントを登録
   * @param {Array} fonts - フォント設定の配列
   */
  registerFonts(fonts) {
    if (!fonts || !Array.isArray(fonts)) {
      return;
    }

    fonts.forEach(font => {
      try {
        // ファイルの存在確認
        if (!fs.existsSync(font.path)) {
          console.warn(`Warning: Font file not found: ${font.path}`);
          return;
        }

        // canvasにフォントを登録
        const options = {
          family: font.family
        };

        if (font.weight) {
          options.weight = font.weight;
        }

        if (font.style) {
          options.style = font.style;
        }

        registerFont(font.path, options);

        // 登録済みフォントを記録
        const key = `${font.family}-${font.weight || 'normal'}-${font.style || 'normal'}`;
        this.registeredFonts.set(key, {
          family: font.family,
          path: font.path,
          weight: font.weight || 'normal',
          style: font.style || 'normal'
        });

        console.log(`✓ Font registered: ${font.family} (${font.path})`);
      } catch (error) {
        console.error(`Error registering font ${font.family}: ${error.message}`);
        throw error;
      }
    });
  }

  /**
   * フォントが登録されているか確認
   * @param {string} family - フォントファミリー名
   * @param {string} weight - フォントウェイト（オプション）
   * @param {string} style - フォントスタイル（オプション）
   * @returns {boolean} 登録されている場合true
   */
  isFontRegistered(family, weight = 'normal', style = 'normal') {
    const key = `${family}-${weight}-${style}`;
    return this.registeredFonts.has(key);
  }

  /**
   * 登録済みフォントの一覧を取得
   * @returns {Array} 登録済みフォントの配列
   */
  getRegisteredFonts() {
    return Array.from(this.registeredFonts.values());
  }

  /**
   * フォント指定文字列を生成
   * @param {Object} options - フォントオプション
   * @param {string} options.family - フォントファミリー
   * @param {number} options.size - フォントサイズ
   * @param {string} options.weight - フォントウェイト（オプション）
   * @param {string} options.style - フォントスタイル（オプション）
   * @returns {string} CSS font指定文字列
   */
  buildFontString(options) {
    const parts = [];

    if (options.style && options.style !== 'normal') {
      parts.push(options.style);
    }

    if (options.weight && options.weight !== 'normal') {
      parts.push(options.weight);
    }

    parts.push(`${options.size}px`);
    parts.push(`"${options.family}"`);

    return parts.join(' ');
  }
}

module.exports = FontLoader;
