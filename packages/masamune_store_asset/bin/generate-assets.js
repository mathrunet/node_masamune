#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const fs = require('fs');

// Generators and loaders
const ConfigLoader = require('../src/config/loader');
const FontLoader = require('../src/utils/font-loader');
const IconGenerator = require('../src/generators/icon-generator');
const FeatureGraphicGenerator = require('../src/generators/feature-graphic-generator');
const LogoGenerator = require('../src/generators/logo-generator');
const ScreenshotGenerator = require('../src/generators/screenshot-generator');

const program = new Command();

program
  .name('katanaasset')
  .description('Generate store assets (icons, screenshots, feature graphics) from YAML config')
  .version('1.0.0')
  .argument('[config]', 'Path to YAML config file', 'store.yaml')
  .option('-o, --output <dir>', 'Output directory', 'documents/store')
  .option('-l, --locale <locale>', 'Generate specific locale only')
  .option('-t, --type <type>', 'Generate specific type only (icon/screenshot/feature-graphic/logo)')
  .action(async (configPath, options) => {
    console.log(chalk.blue.bold('\n🎨 Store Assets Generator\n'));

    // Check if config file exists
    const fullConfigPath = path.resolve(process.cwd(), configPath);

    if (!fs.existsSync(fullConfigPath)) {
      console.error(chalk.red(`✗ Config file not found: ${fullConfigPath}`));
      console.log(chalk.yellow('\nCreate a config file first. See templates/config.example.yaml for an example.'));
      process.exit(1);
    }

    console.log(chalk.green(`✓ Config file: ${configPath}`));
    console.log(chalk.green(`✓ Output directory: ${options.output}`));

    if (options.locale) {
      console.log(chalk.green(`✓ Locale filter: ${options.locale}`));
    }

    if (options.type) {
      console.log(chalk.green(`✓ Type filter: ${options.type}`));
    }

    const spinner = ora('Loading config...').start();

    try {
      // Load configuration
      const configLoader = new ConfigLoader();
      const config = configLoader.load(fullConfigPath);
      config.output_dir = options.output || config.output_dir || './output';

      spinner.succeed('Config loaded');

      // Create output directory
      if (!fs.existsSync(config.output_dir)) {
        fs.mkdirSync(config.output_dir, { recursive: true });
      }

      // Register fonts
      if (config.fonts && config.fonts.length > 0) {
        spinner.start('Registering fonts...');
        const fontLoader = new FontLoader();
        fontLoader.registerFonts(config.fonts);
        spinner.succeed(`Fonts registered (${config.fonts.length})`);
      }

      // Filter locales
      const locales = options.locale ? [options.locale] : config.locales;

      // Generate assets based on type filter
      const shouldGenerate = (type) => !options.type || options.type === type;

      // Generate icons
      if (shouldGenerate('icon') && config.icon) {
        spinner.start('Generating icons...');
        const iconGenerator = new IconGenerator();
        await iconGenerator.generate(config.icon, config.output_dir);
        spinner.succeed('Icons generated');
      }

      // Generate feature graphic
      if (shouldGenerate('feature-graphic') && config.feature_graphic) {
        spinner.start('Generating feature graphic...');
        const featureGraphicGenerator = new FeatureGraphicGenerator();
        await featureGraphicGenerator.generate(config.feature_graphic, config.output_dir);
        spinner.succeed('Feature graphic generated');
      }

      // Generate logo
      if (shouldGenerate('logo') && config.logo) {
        spinner.start('Generating logo...');
        const logoGenerator = new LogoGenerator();
        await logoGenerator.generate(config.logo, config.output_dir);
        spinner.succeed('Logo generated');
      }

      // Generate screenshots
      if (shouldGenerate('screenshot') && config.screenshots) {
        spinner.start('Generating screenshots...');
        const screenshotGenerator = new ScreenshotGenerator();
        await screenshotGenerator.generate(config.screenshots, locales, config.output_dir);
        spinner.succeed('Screenshots generated');
      }

      console.log(chalk.blue('\n✨ All done! Check the output directory for generated assets.'));
      console.log(chalk.gray(`   Output: ${path.resolve(config.output_dir)}`));
    } catch (error) {
      spinner.fail(chalk.red('Failed to generate assets'));
      console.error(chalk.red(`\nError: ${error.message}`));
      if (error.stack) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
    }
  });

program.parse();
