<p align="center">
  <a href="https://mathru.net">
    <img width="240px" src="https://raw.githubusercontent.com/mathrunet/node_masamune/main/.github/images/icon.png" alt="Masamune logo" style="border-radius: 32px"><br/>
  </a>
  <h1 align="center">Store Assets Generator</h1>
</p>

<p align="center">
  <a href="https://github.com/mathrunet">
    <img src="https://img.shields.io/static/v1?label=GitHub&message=Follow&logo=GitHub&color=333333&link=https://github.com/mathrunet" alt="Follow on GitHub" />
  </a>
  <a href="https://x.com/mathru">
    <img src="https://img.shields.io/static/v1?label=@mathru&message=Follow&logo=X&color=0F1419&link=https://x.com/mathru" alt="Follow on X" />
  </a>
  <a href="https://www.youtube.com/c/mathrunetchannel">
    <img src="https://img.shields.io/static/v1?label=YouTube&message=Follow&logo=YouTube&color=FF0000&link=https://www.youtube.com/c/mathrunetchannel" alt="Follow on YouTube" />
  </a>
  <a href="https://github.com/invertase/melos">
    <img src="https://img.shields.io/static/v1?label=maintained%20with&message=melos&color=FF1493&link=https://github.com/invertase/melos" alt="Maintained with Melos" />
  </a>
</p>

<p align="center">
  <a href="https://github.com/sponsors/mathrunet"><img src="https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=ff69b4&link=https://github.com/sponsors/mathrunet" alt="GitHub Sponsor" /></a>
</p>

---

[[GitHub]](https://github.com/mathrunet) | [[YouTube]](https://www.youtube.com/c/mathrunetchannel) | [[Packages]](https://pub.dev/publishers/mathru.net/packages) | [[X]](https://x.com/mathru) | [[LinkedIn]](https://www.linkedin.com/in/mathrunet/) | [[mathru.net]](https://mathru.net)

---

A CLI tool that generates App Store and Google Play assets (icons, screenshots, and feature graphics) from YAML files, with full support for Japanese fonts.

## Features

- 📱 **Multiple sizes**: Automatically generate icons (512px, 1024px, 2048px) and screenshots (iPhone/iPad)
- 🌍 **Multiple languages**: Specify text and fonts for multiple languages in the configuration file
- 🎨 **Gradient backgrounds**: Support for linear and radial gradients
- 🔤 **Japanese font support**: Render Japanese text using custom TTF fonts
- 🤖 **Android adaptive icons**: Automatically generate a foreground (transparent PNG) and background
- ⚙️ **YAML configuration**: Simple, readable YAML configuration files

# Installation

### Local Usage

```bash
# Clone the repository
git clone https://github.com/yourusername/store_information_generator.git
cd store_information_generator

# Install dependencies
npm install
```

### As an npm Package (Planned for Future Publication)

```bash
# Install globally
npm install -g masamune_store_asset

# Install locally
npm install masamune_store_asset

# Run directly with npx
npx masamune_store_asset --config config.yaml
```

# Implementation

### 1. Create a Configuration File

Create `config.yaml`. See [templates/config.example.yaml](templates/config.example.yaml) for an example.

```yaml
# Basic settings
project_name: "MyApp"
output_dir: "./output"

# Font settings
fonts:
  - family: "Noto Sans JP"
    path: "./fonts/NotoSansJP-Regular.ttf"
    weight: normal

# Language settings
locales:
  - ja
  - en

# Icon settings
icon:
  foreground:
    path: "./assets/icon_foreground.png"
  background:
    gradient:
      type: linear
      colors:
        - "#667eea"
        - "#764ba2"
      angle: 135
```

### 2. Generate Assets

```bash
# Run locally
npm run generate -- --config config.yaml

# Or run directly with node
node bin/generate-assets.js --config config.yaml

# After global installation
katanaasset --config config.yaml
```

### Command-Line Options

```bash
katanaasset [config] [options]

Arguments:
  config                Path to YAML config file (default: "config.yaml")

Options:
  -o, --output <dir>    Output directory (default: "./output")
  -l, --locale <locale> Generate specific locale only
  -t, --type <type>     Generate specific type only (icon/screenshot/feature-graphic/logo)
  -h, --help            Display help
  -V, --version         Display version
```

### Examples

```bash
# Basic usage
npm run generate -- --config config.yaml

# Generate for a specific language only
npm run generate -- --config config.yaml --locale ja

# Generate a specific asset type only
npm run generate -- --config config.yaml --type icon

# Specify the output directory
npm run generate -- --config config.yaml --output ./my-assets
```

## Generated Assets

### Icons
- `icon_512.png` (512×512px)
- `icon_1024.png` (1024×1024px)
- `icon_2048.png` (2048×2048px)
- `android_adaptive_foreground.png` (transparent PNG, 512×512px)
- `android_adaptive_background.png` (512×512px)

### Feature Graphic (Google Play)
- `feature_graphic.png` (1024×500px)
- Supports icon/logo overlays with nine alignment options

### Screenshots
- **6.9-inch iPhone** (iPhone 16 Pro Max)
  - Portrait: 1290×2796px
  - Landscape: 2796×1290px
- **12.9-inch iPad Pro**
  - Portrait: 2048×2732px
  - Landscape: 2732×2048px

Generates five screenshots for each language and orientation.

### Logo
- `logo.png`

## Configuration Details

### Font Settings

```yaml
fonts:
  - family: "Noto Sans JP"
    path: "./fonts/NotoSansJP-Regular.ttf"
    weight: normal
  - family: "Noto Sans JP"
    path: "./fonts/NotoSansJP-Bold.ttf"
    weight: bold
```

### Icon Settings

```yaml
icon:
  foreground:
    path: "./assets/icon_foreground.png"
    scale: 1  # Optional: adjust scale
  background:
    # Option 1: Image
    path: "./assets/icon_background.png"

    # Option 2: Solid color
    # color: "#FF6B6B"

    # Option 3: Gradient
    # gradient:
    #   type: linear  # linear or radial
    #   colors:
    #     - "#667eea"
    #     - "#764ba2"
    #   angle: 135  # 0–360 degrees
```

### Feature Graphic Settings (New Feature)

```yaml
feature_graphic:
  # Existing foreground (centered)
  foreground:
    path: "./assets/feature_foreground.png"
    scale: 1

  # Background settings
  background:
    gradient:
      type: linear
      colors:
        - "#667eea"
        - "#764ba2"
      angle: 135

  # New: Icon overlay
  icon:
    path: "./assets/icon.png"
    align: "bottom-right"  # Alignment (nine options)
    scale: 0.2            # Size adjustment
    marginX: 20           # Horizontal margin
    marginY: 20           # Vertical margin

  # New: Logo overlay
  logo:
    path: "./assets/logo.png"
    align: "bottom-right"  # Alignment
    scale: 0.15
    marginX: 20
    marginY: 80           # Adjust to position above the icon
```

#### Available Alignment Options (align)

- `top-left` - Top left
- `top-center` - Top center
- `top-right` - Top right
- `left-center` - Left center
- `center` - Center
- `right-center` - Right center
- `bottom-left` - Bottom left
- `bottom-center` - Bottom center
- `bottom-right` - Bottom right (default)

#### Generating Logos and Icons from Text

The logo and icon in feature_graphic can be generated dynamically from text instead of image files:

```yaml
feature_graphic:
  # Generate a logo from text
  logo:
    text: "MyApp"           # Text to display
    font_family: "Noto Sans JP"  # Font registered in fonts
    font_size: 60           # Font size
    font_weight: "bold"     # Font weight
    color: "#FFFFFF"        # Text color
    background_color: "rgba(0,0,0,0.8)"  # Background color (optional)
    width: 200              # Generated image width
    height: 100             # Generated image height
    align: "bottom-right"   # Alignment
    scale: 0.15             # Scale factor

  # Generate an icon from text (for example, a single character)
  icon:
    text: "A"
    font_family: "Arial"
    font_size: 80
    font_weight: "bold"
    color: "#FFFFFF"
    background_color: "#007AFF"
    width: 100
    height: 100
    align: "top-right"
    scale: 0.2
```

### Screenshot Settings

```yaml
screenshots:
  background:
    gradient:
      type: linear
      colors:
        - "#FF6B6B"
        - "#4ECDC4"
      angle: 135

  portrait:
    - title:
        ja: "Amazing Feature"
        en: "Amazing Feature"
      font_family:
        ja: "Noto Sans JP"
        en: "Noto Sans JP"
      font_size: 72
      screenshot:
        ja: "./assets/screenshots/ja/screen1.png"
        en: "./assets/screenshots/en/screen1.png"
```

## System Requirements

- Node.js v18 or later
- macOS, Linux, or Windows (WSL recommended)

### Dependencies

- `canvas`: Image rendering engine (Cairo)
- `js-yaml`: YAML configuration loading
- `commander`: CLI framework
- `chalk`: Colored output
- `ora`: Progress indicators

### Additional Requirements on macOS

```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman
```

## Troubleshooting

### canvas Installation Errors

On macOS, install the required dependencies with the following commands:

```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman
npm install
```

### Font Not Found

Check that font paths in the configuration file are correct. Relative paths are resolved from the configuration file's location.

## Development

```bash
# Install dependencies
npm install

# Run a test after modifying the code
npm run generate -- --config templates/config.example.yaml

# Test locally with npm link
npm link
katanaasset --config config.yaml
```

## License

MIT

## Contributing

Pull requests are welcome! Please use Issues for bug reports and feature requests.

# GitHub Sponsors

Sponsors are always welcome. Thank you for your support!

[https://github.com/sponsors/mathrunet](https://github.com/sponsors/mathrunet)
