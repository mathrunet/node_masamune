const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

class ConfigLoader {
  /**
   * YAML設定ファイルを読み込む
   * @param {string} configPath - 設定ファイルのパス
   * @returns {Object} パース済みの設定オブジェクト
   */
  load(configPath) {
    try {
      const configDir = path.dirname(path.resolve(configPath));
      const fileContents = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(fileContents);

      // 相対パスを絶対パスに解決
      this.resolvePathsInConfig(config, configDir);

      // バリデーション
      this.validate(config);

      return config;
    } catch (error) {
      if (error.name === 'YAMLException') {
        throw new Error(`YAML parse error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 設定内の相対パスを絶対パスに解決
   * @param {Object} config - 設定オブジェクト
   * @param {string} configDir - 設定ファイルのディレクトリ
   */
  resolvePathsInConfig(config, configDir) {
    // フォントパスの解決
    if (config.fonts && Array.isArray(config.fonts)) {
      config.fonts.forEach(font => {
        if (font.path && !path.isAbsolute(font.path)) {
          font.path = path.resolve(configDir, font.path);
        }
      });
    }

    // アイコンパスの解決
    if (config.icon) {
      if (config.icon.foreground?.path) {
        config.icon.foreground.path = this.resolvePath(config.icon.foreground.path, configDir);
      }
      if (config.icon.background?.path) {
        config.icon.background.path = this.resolvePath(config.icon.background.path, configDir);
      }
    }

    // フィーチャーグラフィックパスの解決
    if (config.feature_graphic) {
      if (config.feature_graphic.foreground?.path) {
        config.feature_graphic.foreground.path = this.resolvePath(config.feature_graphic.foreground.path, configDir);
      }
      if (config.feature_graphic.background?.path) {
        config.feature_graphic.background.path = this.resolvePath(config.feature_graphic.background.path, configDir);
      }
      // 新しいアイコン/ロゴパスの解決
      if (config.feature_graphic.icon?.path) {
        config.feature_graphic.icon.path = this.resolvePath(config.feature_graphic.icon.path, configDir);
      }
      if (config.feature_graphic.logo?.path) {
        config.feature_graphic.logo.path = this.resolvePath(config.feature_graphic.logo.path, configDir);
      }
    }

    // ロゴパスの解決
    if (config.logo?.path) {
      config.logo.path = this.resolvePath(config.logo.path, configDir);
    }

    // スクリーンショットパスの解決
    if (config.screenshots) {
      if (config.screenshots.iphone_frame?.path) {
        config.screenshots.iphone_frame.path = this.resolvePath(config.screenshots.iphone_frame.path, configDir);
      }
      if (config.screenshots.ipad_frame?.path) {
        config.screenshots.ipad_frame.path = this.resolvePath(config.screenshots.ipad_frame.path, configDir);
      }

      // グローバルロゴパス
      if (config.screenshots.logo?.path) {
        config.screenshots.logo.path = this.resolvePath(config.screenshots.logo.path, configDir);
      }

      // グローバルアイコンパス
      if (config.screenshots.icon?.path) {
        config.screenshots.icon.path = this.resolvePath(config.screenshots.icon.path, configDir);
      }

      // 縦向きスクリーンショット
      if (config.screenshots.portrait && Array.isArray(config.screenshots.portrait)) {
        config.screenshots.portrait.forEach(screenshot => {
          if (screenshot.screenshot) {
            this.resolveScreenshotPaths(screenshot.screenshot, configDir);
          }
          // 個別ロゴパス
          if (screenshot.logo?.path) {
            screenshot.logo.path = this.resolvePath(screenshot.logo.path, configDir);
          }
          // 個別アイコンパス
          if (screenshot.icon?.path) {
            screenshot.icon.path = this.resolvePath(screenshot.icon.path, configDir);
          }
        });
      }

      // 横向きスクリーンショット
      if (config.screenshots.landscape && Array.isArray(config.screenshots.landscape)) {
        config.screenshots.landscape.forEach(screenshot => {
          if (screenshot.screenshot) {
            this.resolveScreenshotPaths(screenshot.screenshot, configDir);
          }
          // 個別ロゴパス
          if (screenshot.logo?.path) {
            screenshot.logo.path = this.resolvePath(screenshot.logo.path, configDir);
          }
          // 個別アイコンパス
          if (screenshot.icon?.path) {
            screenshot.icon.path = this.resolvePath(screenshot.icon.path, configDir);
          }
        });
      }
    }

    // 出力ディレクトリの解決
    if (config.output_dir && !path.isAbsolute(config.output_dir)) {
      config.output_dir = path.resolve(configDir, config.output_dir);
    }
  }

  /**
   * パスを解決（相対パスを絶対パスに変換）
   * @param {string} filePath - ファイルパス
   * @param {string} configDir - 設定ファイルのディレクトリ
   * @returns {string} 解決されたパス
   */
  resolvePath(filePath, configDir) {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.resolve(configDir, filePath);
  }

  /**
   * スクリーンショットパスを解決（デバイス別形式と従来形式の両方をサポート）
   * @param {Object} screenshotObj - screenshot設定オブジェクト（ロケール別）
   * @param {string} configDir - 設定ファイルのディレクトリ
   */
  resolveScreenshotPaths(screenshotObj, configDir) {
    Object.keys(screenshotObj).forEach(locale => {
      const value = screenshotObj[locale];

      if (typeof value === 'string') {
        // 従来形式: 文字列パス
        if (!path.isAbsolute(value)) {
          screenshotObj[locale] = path.resolve(configDir, value);
        }
      } else if (typeof value === 'object' && value !== null) {
        // 新形式: デバイス別オブジェクト { phone: "...", tablet: "..." }
        Object.keys(value).forEach(device => {
          if (typeof value[device] === 'string' && !path.isAbsolute(value[device])) {
            value[device] = path.resolve(configDir, value[device]);
          }
        });
      }
    });
  }

  /**
   * 設定オブジェクトのバリデーション
   * @param {Object} config - 設定オブジェクト
   */
  validate(config) {
    const errors = [];

    // 必須フィールドのチェック
    if (!config.project_name) {
      errors.push('project_name is required');
    }

    if (!config.locales || !Array.isArray(config.locales) || config.locales.length === 0) {
      errors.push('locales must be a non-empty array');
    }

    // フォント設定のチェック
    if (config.fonts && Array.isArray(config.fonts)) {
      config.fonts.forEach((font, index) => {
        if (!font.family) {
          errors.push(`fonts[${index}].family is required`);
        }
        if (!font.path) {
          errors.push(`fonts[${index}].path is required`);
        }
      });
    }

    // アイコン設定のチェック
    if (config.icon) {
      if (!config.icon.foreground?.path) {
        errors.push('icon.foreground.path is required');
      }
      if (!config.icon.background) {
        errors.push('icon.background is required');
      } else {
        const hasPath = config.icon.background.path;
        const hasColor = config.icon.background.color;
        const hasGradient = config.icon.background.gradient;

        if (!hasPath && !hasColor && !hasGradient) {
          errors.push('icon.background must have path, color, or gradient');
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`);
    }

    return true;
  }

  /**
   * デフォルト設定を適用
   * @param {Object} config - 設定オブジェクト
   * @returns {Object} デフォルト値が適用された設定オブジェクト
   */
  applyDefaults(config) {
    return {
      output_dir: './output',
      output: {
        format: 'png',
        quality: 95,
        naming_pattern: '{locale}/{type}/{size}/{index}.png'
      },
      ...config
    };
  }
}

module.exports = ConfigLoader;
