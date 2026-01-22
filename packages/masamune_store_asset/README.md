# Store Assets Generator

YAMLファイルから、App StoreやGoogle Play用のアセット（アイコン、スクリーンショット、フィーチャーグラフィック）を生成するCLIツールです。日本語フォントに完全対応しています。

## 特徴

- 📱 **複数サイズ対応**: アイコン（512px、1024px、2048px）、スクリーンショット（iPhone/iPad）を自動生成
- 🌍 **多言語対応**: 設定ファイルで複数言語のテキストとフォントを指定可能
- 🎨 **グラデーション背景**: 線形・放射状グラデーションをサポート
- 🔤 **日本語フォント対応**: カスタムTTFフォントを使用した日本語テキスト描画
- 🤖 **Androidアダプティブアイコン**: foreground（透過PNG）とbackgroundを自動生成
- ⚙️ **YAML設定**: シンプルで読みやすいYAML形式の設定ファイル

## インストール

### ローカルでの使用

```bash
# リポジトリをクローン
git clone https://github.com/yourusername/store_information_generator.git
cd store_information_generator

# 依存パッケージをインストール
npm install
```

### npmパッケージとして（将来的に公開予定）

```bash
# グローバルインストール
npm install -g masamune_store_asset

# ローカルインストール
npm install masamune_store_asset

# npxで直接実行
npx masamune_store_asset --config config.yaml
```

## 使い方

### 1. 設定ファイルを作成

`config.yaml`を作成します。サンプルは[templates/config.example.yaml](templates/config.example.yaml)を参照してください。

```yaml
# 基本設定
project_name: "MyApp"
output_dir: "./output"

# フォント設定
fonts:
  - family: "Noto Sans JP"
    path: "./fonts/NotoSansJP-Regular.ttf"
    weight: normal

# 言語設定
locales:
  - ja
  - en

# アイコン設定
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

### 2. アセットを生成

```bash
# ローカルでの実行
npm run generate -- --config config.yaml

# または直接nodeコマンドで
node bin/generate-assets.js --config config.yaml

# グローバルインストール後
katanaasset --config config.yaml
```

### コマンドラインオプション

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

### 使用例

```bash
# 基本的な使い方
npm run generate -- --config config.yaml

# 特定言語のみ生成
npm run generate -- --config config.yaml --locale ja

# 特定タイプのみ生成
npm run generate -- --config config.yaml --type icon

# 出力先指定
npm run generate -- --config config.yaml --output ./my-assets
```

## 生成されるアセット

### アイコン
- `icon_512.png` (512×512px)
- `icon_1024.png` (1024×1024px)
- `icon_2048.png` (2048×2048px)
- `android_adaptive_foreground.png` (透過PNG、512×512px)
- `android_adaptive_background.png` (512×512px)

### フィーチャーグラフィック（Google Play）
- `feature_graphic.png` (1024×500px)
- アイコン/ロゴのオーバーレイ配置対応（9つの位置から選択可能）

### スクリーンショット
- **iPhone 6.9インチ** (iPhone 16 Pro Max)
  - 縦: 1290×2796px
  - 横: 2796×1290px
- **iPad Pro 12.9インチ**
  - 縦: 2048×2732px
  - 横: 2732×2048px

各言語・向きごとに5枚ずつ生成されます。

### ロゴ
- `logo.png`

## 設定ファイルの詳細

### フォント設定

```yaml
fonts:
  - family: "Noto Sans JP"
    path: "./fonts/NotoSansJP-Regular.ttf"
    weight: normal
  - family: "Noto Sans JP"
    path: "./fonts/NotoSansJP-Bold.ttf"
    weight: bold
```

### アイコン設定

```yaml
icon:
  foreground:
    path: "./assets/icon_foreground.png"
    scale: 1  # オプション: スケール調整
  background:
    # パターン1: 画像
    path: "./assets/icon_background.png"

    # パターン2: 単色
    # color: "#FF6B6B"

    # パターン3: グラデーション
    # gradient:
    #   type: linear  # linear or radial
    #   colors:
    #     - "#667eea"
    #     - "#764ba2"
    #   angle: 135  # 0-360度
```

### フィーチャーグラフィック設定（新機能）

```yaml
feature_graphic:
  # 既存のフォアグラウンド（中央配置）
  foreground:
    path: "./assets/feature_foreground.png"
    scale: 1

  # 背景設定
  background:
    gradient:
      type: linear
      colors:
        - "#667eea"
        - "#764ba2"
      angle: 135

  # 新機能: アイコンのオーバーレイ配置
  icon:
    path: "./assets/icon.png"
    align: "bottom-right"  # 配置位置（9つのオプション）
    scale: 0.2            # サイズ調整
    marginX: 20           # X軸余白
    marginY: 20           # Y軸余白

  # 新機能: ロゴのオーバーレイ配置
  logo:
    path: "./assets/logo.png"
    align: "bottom-right"  # 配置位置
    scale: 0.15
    marginX: 20
    marginY: 80           # iconの上に配置する場合は調整
```

#### 利用可能な配置位置（align）

- `top-left` - 左上
- `top-center` - 上中央
- `top-right` - 右上
- `left-center` - 左中央
- `center` - 中央
- `right-center` - 右中央
- `bottom-left` - 左下
- `bottom-center` - 下中央
- `bottom-right` - 右下（デフォルト）

#### テキストからのロゴ/アイコン生成

feature_graphicのlogoとiconは、画像ファイルの代わりにテキストから動的に生成できます：

```yaml
feature_graphic:
  # テキストからロゴを生成
  logo:
    text: "MyApp"           # 表示するテキスト
    font_family: "Noto Sans JP"  # フォント（fonts設定で登録済み）
    font_size: 60           # フォントサイズ
    font_weight: "bold"     # フォントウェイト
    color: "#FFFFFF"        # テキスト色
    background_color: "rgba(0,0,0,0.8)"  # 背景色（オプション）
    width: 200              # 生成画像の幅
    height: 100             # 生成画像の高さ
    align: "bottom-right"   # 配置位置
    scale: 0.15             # 拡大縮小率

  # テキストからアイコンを生成（例：単一文字）
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

### スクリーンショット設定

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
        ja: "素晴らしい機能"
        en: "Amazing Feature"
      font_family:
        ja: "Noto Sans JP"
        en: "Noto Sans JP"
      font_size: 72
      screenshot:
        ja: "./assets/screenshots/ja/screen1.png"
        en: "./assets/screenshots/en/screen1.png"
```

## システム要件

- Node.js v18以上
- macOS、Linux、またはWindows（WSL推奨）

### 依存ライブラリ

- `canvas`: 画像生成エンジン（Cairo）
- `js-yaml`: YAML設定読み込み
- `commander`: CLI構築
- `chalk`: カラー出力
- `ora`: プログレスインジケーター

### macOSでの追加要件

```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman
```

## トラブルシューティング

### canvasパッケージのインストールエラー

macOSの場合、以下のコマンドで必要な依存関係をインストールしてください：

```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman
npm install
```

### フォントが見つからないエラー

設定ファイル内のフォントパスが正しいか確認してください。相対パスは設定ファイルの位置を基準に解決されます。

## 開発

```bash
# 依存関係インストール
npm install

# コードを修正後、テスト実行
npm run generate -- --config templates/config.example.yaml

# npm linkでローカルテスト
npm link
katanaasset --config config.yaml
```

## ライセンス

MIT

## 貢献

プルリクエストを歓迎します！バグ報告や機能リクエストは、Issuesでお願いします。
