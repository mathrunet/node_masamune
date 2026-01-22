#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const ConfigLoader = require('./src/config/loader');
const IconGenerator = require('./src/generators/icon-generator');
const ScreenshotGenerator = require('./src/generators/screenshot-generator');
const FeatureGraphicGenerator = require('./src/generators/feature-graphic-generator');
const LogoGenerator = require('./src/generators/logo-generator');

// 引数から設定ファイルパスを取得
const configPath = process.argv[2] || 'config.yaml';

if (!fs.existsSync(configPath)) {
  console.error(`Error: Configuration file not found: ${configPath}`);
  console.error(`\nUsage: node index.js [config-file-path]`);
  console.error(`\nExample:`);
  console.error(`  node index.js config.yaml`);
  console.error(`  node index.js /path/to/config.yaml`);
  process.exit(1);
}

async function main() {
  try {
    console.log(`\n📱 Store Asset Generator`);
    console.log(`=======================`);
    console.log(`Loading configuration from: ${configPath}\n`);

    // 設定ファイルを読み込む
    const configLoader = new ConfigLoader();
    const config = configLoader.load(configPath);

    console.log(`✓ Configuration loaded`);
    console.log(`  Project: ${config.project_name}`);
    console.log(`  Locales: ${config.locales.join(', ')}`);
    console.log(`  Output: ${config.output_dir}\n`);

    // 出力ディレクトリを作成
    if (!fs.existsSync(config.output_dir)) {
      fs.mkdirSync(config.output_dir, { recursive: true });
    }

    // 各ジェネレーターを初期化
    const iconGenerator = new IconGenerator();
    const screenshotGenerator = new ScreenshotGenerator();
    const featureGraphicGenerator = new FeatureGraphicGenerator();
    const logoGenerator = new LogoGenerator();

    // アイコンを生成
    if (config.icon) {
      console.log(`\n🎨 Generating icons...`);
      const iconPaths = await iconGenerator.generate(config.icon, config.output_dir);
      console.log(`✓ Generated ${iconPaths.length} icons`);
    }

    // スクリーンショットを生成
    if (config.screenshots) {
      console.log(`\n📸 Generating screenshots...`);
      const screenshotPaths = await screenshotGenerator.generate(
        config.screenshots,
        config.locales,
        config.output_dir
      );
      console.log(`✓ Generated ${screenshotPaths.length} screenshots`);
    }

    // フィーチャーグラフィックを生成
    if (config.feature_graphic) {
      console.log(`\n🖼 Generating feature graphics...`);
      const featurePaths = await featureGraphicGenerator.generate(
        config.feature_graphic,
        config.locales,
        config.output_dir
      );
      console.log(`✓ Generated ${featurePaths.length} feature graphics`);
    }

    // ロゴを生成
    if (config.logo) {
      console.log(`\n🏷 Generating logos...`);
      const logoPaths = await logoGenerator.generate(
        config.logo,
        config.locales,
        config.output_dir
      );
      console.log(`✓ Generated ${logoPaths.length} logos`);
    }

    console.log(`\n✨ Asset generation completed successfully!`);
    console.log(`   Output directory: ${config.output_dir}\n`);

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    if (error.stack) {
      console.error(`\nStack trace:`);
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// メイン処理を実行
main();