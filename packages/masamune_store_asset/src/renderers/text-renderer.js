class TextRenderer {
  /**
   * テキストを描画
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D コンテキスト
   * @param {string} text - 描画するテキスト
   * @param {Object} options - 描画オプション
   */
  render(ctx, text, options) {
    const {
      x,
      y,
      font,
      fontSize = 48,
      fontFamily = 'Arial',
      fontWeight = 'normal',
      fontStyle = 'normal',
      color = '#000000',
      align = 'center',
      baseline = 'top',
      maxWidth,
      lineHeight = fontSize * 1.2,
      shadowColor,
      shadowBlur,
      shadowOffsetX = 0,
      shadowOffsetY = 0,
      border = null  // ボーダー設定: {enabled, width, color}
    } = options;

    // フォントスタイル設定
    const fontString = this.buildFontString({
      style: fontStyle,
      weight: fontWeight,
      size: fontSize,
      family: fontFamily
    });

    ctx.font = fontString;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;

    // シャドウ設定
    if (shadowColor) {
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = shadowBlur || 0;
      ctx.shadowOffsetX = shadowOffsetX;
      ctx.shadowOffsetY = shadowOffsetY;
    }

    // 複数行対応
    if (maxWidth) {
      const lines = this.wrapText(ctx, text, maxWidth);
      this.renderMultilineText(ctx, lines, x, y, lineHeight, border);
    } else {
      // ボーダー描画
      if (border && border.enabled) {
        ctx.strokeStyle = border.color || '#000000';
        ctx.lineWidth = border.width || 2;
        ctx.strokeText(text, x, y);
      }
      // テキスト描画（ボーダーの上に描画）
      ctx.fillText(text, x, y);
    }

    // シャドウをリセット
    if (shadowColor) {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }
  }

  /**
   * 複数行テキストを描画
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D コンテキスト
   * @param {Array<string>} lines - テキスト行の配列
   * @param {number} x - X座標
   * @param {number} y - Y座標
   * @param {number} lineHeight - 行の高さ
   * @param {Object} border - ボーダー設定
   */
  renderMultilineText(ctx, lines, x, y, lineHeight, border = null) {
    lines.forEach((line, index) => {
      const lineY = y + index * lineHeight;

      // ボーダー描画
      if (border && border.enabled) {
        ctx.strokeStyle = border.color || '#000000';
        ctx.lineWidth = border.width || 2;
        ctx.strokeText(line, x, lineY);
      }

      // テキスト描画（ボーダーの上に描画）
      ctx.fillText(line, x, lineY);
    });
  }

  /**
   * テキストを折り返し
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D コンテキスト
   * @param {string} text - テキスト
   * @param {number} maxWidth - 最大幅
   * @returns {Array<string>} 折り返されたテキスト行の配列
   */
  wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach((word, index) => {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }

      // 最後の単語の場合
      if (index === words.length - 1) {
        lines.push(currentLine);
      }
    });

    return lines.length > 0 ? lines : [text];
  }

  /**
   * テキストの寸法を測定
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D コンテキスト
   * @param {string} text - テキスト
   * @param {Object} options - フォントオプション
   * @returns {Object} 寸法オブジェクト {width, height}
   */
  measureText(ctx, text, options) {
    const {
      fontSize = 48,
      fontFamily = 'Arial',
      fontWeight = 'normal',
      fontStyle = 'normal'
    } = options;

    const fontString = this.buildFontString({
      style: fontStyle,
      weight: fontWeight,
      size: fontSize,
      family: fontFamily
    });

    ctx.font = fontString;
    const metrics = ctx.measureText(text);

    return {
      width: metrics.width,
      height: fontSize,
      actualHeight: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
    };
  }

  /**
   * フォント指定文字列を生成
   * @param {Object} options - フォントオプション
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

  /**
   * テキストを中央に配置して描画
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D コンテキスト
   * @param {string} text - テキスト
   * @param {number} width - キャンバス幅
   * @param {number} height - キャンバス高さ
   * @param {Object} options - 描画オプション
   */
  renderCentered(ctx, text, width, height, options = {}) {
    this.render(ctx, text, {
      ...options,
      x: width / 2,
      y: height / 2,
      align: 'center',
      baseline: 'middle'
    });
  }

  /**
   * テキストを上部に配置して描画
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D コンテキスト
   * @param {string} text - テキスト
   * @param {number} width - キャンバス幅
   * @param {number} margin - 上からのマージン
   * @param {Object} options - 描画オプション
   */
  renderTop(ctx, text, width, margin, options = {}) {
    this.render(ctx, text, {
      ...options,
      x: width / 2,
      y: margin,
      align: 'center',
      baseline: 'top'
    });
  }

  /**
   * テキストを下部に配置して描画
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D コンテキスト
   * @param {string} text - テキスト
   * @param {number} width - キャンバス幅
   * @param {number} height - キャンバス高さ
   * @param {number} margin - 下からのマージン
   * @param {Object} options - 描画オプション
   */
  renderBottom(ctx, text, width, height, margin, options = {}) {
    this.render(ctx, text, {
      ...options,
      x: width / 2,
      y: height - margin,
      align: 'center',
      baseline: 'bottom'
    });
  }

  /**
   * テキストを左側に配置して描画（横向きレイアウト用）
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D コンテキスト
   * @param {string} text - テキスト
   * @param {number} width - キャンバス幅
   * @param {number} height - キャンバス高さ
   * @param {number} xPosition - X座標の位置（0-1の比率、デフォルト0.25 = 左側25%位置）
   * @param {Object} options - 描画オプション
   */
  renderLeft(ctx, text, width, height, xPosition = 0.25, options = {}) {
    this.render(ctx, text, {
      ...options,
      x: width * xPosition,
      y: height / 2,
      align: 'center',
      baseline: 'middle'
    });
  }

  /**
   * テキストを右側に配置して描画（横向きレイアウト用）
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D コンテキスト
   * @param {string} text - テキスト
   * @param {number} width - キャンバス幅
   * @param {number} height - キャンバス高さ
   * @param {number} xPosition - X座標の位置（0-1の比率、デフォルト0.75 = 右側75%位置）
   * @param {Object} options - 描画オプション
   */
  renderRight(ctx, text, width, height, xPosition = 0.75, options = {}) {
    this.render(ctx, text, {
      ...options,
      x: width * xPosition,
      y: height / 2,
      align: 'center',
      baseline: 'middle'
    });
  }
}

module.exports = TextRenderer;
