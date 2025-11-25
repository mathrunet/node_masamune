# Marketing Pipeline Backend - 開発フロー

## 概要

`masamune_marketing_pipeline`パッケージにバックエンド機能を実装し、定期的にマーケティングデータを収集してAIレポートを生成する。

## 決定事項

- **共通基盤**: `@mathrunet/masamune`パッケージを利用
  - Firebase Functions の基底クラス（SchedulerFunctionsOptions, HttpFunctionsOptions等）
  - Firestore/Storage ユーティリティ
  - deploy関数によるFunctions登録パターン
- **画像生成**: Gemini 2.5 Flash Image (`gemini-2.5-flash-image`)を使用
- **API優先順位**: Google Play → Firebase Analytics → GitHub → App Store
- **認証フロー**: アプリでOAuth認証、バックエンドでトークンリフレッシュも担当
- **PDFデザイン**: シンプルなテキスト+グラフ形式

---

## フェーズ別開発ステップ

### Phase 1: 基盤構築

- [x] パッケージ構造とsrcディレクトリの作成
- [x] 基本インターフェースとデータモデルの定義
- [x] Firestoreスキーマの設計
- [x] パイプラインスケジューラー関数の実装
- [x] トークンリフレッシュユーティリティの実装

### Phase 2: API統合（優先順位順）

- [ ] Google Play Developer API クライアント実装
  - [ ] ダウンロード数、インストール数、アンインストール数
  - [ ] ストア評価、レビュー
  - [ ] 売上データ
- [ ] Firebase Analytics Data API クライアント実装
  - [ ] DAU/WAU/MAU
  - [ ] 年齢層、性別、国、言語、端末
  - [ ] セッション時間
- [ ] GitHub API クライアント実装
  - [ ] リポジトリ情報、スター、フォーク
  - [ ] Issue/PR数
  - [ ] 最新リリース
- [ ] App Store Connect API クライアント実装
  - [ ] ダウンロード数、売上
  - [ ] 評価、レビュー
- [ ] データ収集オーケストレーター関数の実装

### Phase 3: AI分析

- [ ] Vertex AI (Gemini) 統合
- [ ] 総評生成機能（Gemini 2.0 Flash）
- [ ] 改善点提案機能
- [ ] カバー画像生成（Gemini 2.5 Flash Image）

### Phase 4: レポート生成

- [ ] レポートデータ集約
- [ ] グラフ生成（QuickChart API）
- [ ] PDF生成（pdfkit）
- [ ] Cloud Storageアップロード

### Phase 5: テストと最適化

- [ ] 各APIクライアントのユニットテスト
- [ ] 統合テスト
- [ ] エラーハンドリング改善
- [ ] レート制限実装

---

## ファイル構造

```
src/
├── index.ts                          # パッケージエクスポート
├── functions.ts                      # Functions登録
│
├── functions/
│   ├── schedule_marketing_check.ts   # スケジューラー（1分ごと）
│   ├── collect_marketing_data.ts     # データ収集
│   ├── generate_marketing_report.ts  # レポート生成
│   └── generate_marketing_pdf.ts     # PDF生成
│
├── clients/                          # 外部APIクライアント
│   ├── google_play_client.ts
│   ├── firebase_analytics_client.ts
│   ├── github_client.ts
│   └── app_store_client.ts
│
├── services/                         # ビジネスロジック
│   ├── ai_analysis_service.ts
│   ├── report_generator_service.ts
│   ├── pdf_generator_service.ts
│   └── storage_service.ts
│
├── models/                           # 型定義
│   ├── app_config.ts
│   ├── marketing_data.ts
│   ├── report_data.ts
│   └── api_responses.ts
│
└── utils/
    ├── date_utils.ts
    ├── rate_limiter.ts
    ├── token_refresh.ts
    └── error_handler.ts
```

---

## 追加依存関係

```json
{
  "@google-cloud/vertexai": "^1.10.0",
  "googleapis": "^144.0.0",
  "@google-analytics/data": "^4.9.0",
  "jsonwebtoken": "^9.0.2",
  "@octokit/rest": "^21.0.2",
  "pdfkit": "^0.15.1",
  "date-fns": "^4.1.0"
}
```

※グラフ生成は QuickChart API を使用（HTTPベースのため、ネイティブモジュール不要）

---

## 環境変数

| 変数名 | 説明 |
|--------|------|
| `GCP_PROJECT_ID` | GCPプロジェクトID |
| `GEMINI_MODEL` | 使用するGeminiモデル |
| `GOOGLE_PLAY_SERVICE_ACCOUNT` | Google Play APIサービスアカウントJSON |
| `FIREBASE_ANALYTICS_SERVICE_ACCOUNT` | Firebase Analytics認証用 |
| `GITHUB_TOKEN` | GitHub Personal Access Token |
| `APP_STORE_KEY_ID` | App Store Connect API Key ID |
| `APP_STORE_ISSUER_ID` | App Store Connect Issuer ID |
| `APP_STORE_PRIVATE_KEY` | App Store Connect Private Key |
| `STORAGE_BUCKET` | Cloud Storageバケット名 |

---

## 関数設定

| 関数名 | メモリ | タイムアウト |
|--------|--------|-------------|
| schedule_marketing_check | 256MiB | 60s |
| collect_marketing_data | 1GiB | 540s |
| generate_marketing_report | 2GiB | 540s |
| generate_marketing_pdf | 1GiB | 300s |

---

## Firestoreパス

- `plugins/marketing/apps/{appId}` - アプリ設定
- `plugins/marketing/requests/{requestId}` - レポート生成リクエスト
- `plugins/marketing/reports/{reportId}` - 生成されたレポート

---

## 参照すべき既存実装

- `masamune_asset_pipeline/src/functions/schedule_asset_creation.ts` - スケジューラーパターン
- `masamune_asset_pipeline/src/functions/generate_short_video.ts` - Gemini画像生成
- `masamune_storage/src/functions/storage_firebase.ts` - Cloud Storage操作

---

## テスト設定

### テスト用環境変数ファイル

`test/.env` ファイルに以下の環境変数を設定：

```bash
# Google Cloud / Firebase
GCP_PROJECT_ID=mathru-net
GOOGLE_SERVICE_ACCOUNT_PATH=./mathru-net-39425d37638c.json

# Google Play Developer API
GOOGLE_PLAY_PACKAGE_NAME=com.example.app
GOOGLE_PLAY_SERVICE_ACCOUNT_PATH=./mathru-net-39425d37638c.json

# Firebase Analytics
FIREBASE_ANALYTICS_PROPERTY_ID=properties/123456789

# GitHub API
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_REPO=owner/repo

# App Store Connect API
APP_STORE_KEY_ID=XXXXXXXXXX
APP_STORE_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
APP_STORE_PRIVATE_KEY_PATH=./AuthKey_XXXXXXXXXX.p8
APP_STORE_APP_ID=1234567890
APP_STORE_VENDOR_NUMBER=12345678

# Cloud Storage
STORAGE_BUCKET=mathru-net.appspot.com
```

### テスト用ファイル構成

```
test/
├── .env                              # 環境変数（gitignore対象）
├── .env.example                      # 環境変数のテンプレート
├── mathru-net-39425d37638c.json      # Google サービスアカウント
├── AuthKey_XXXXXXXXXX.p8             # App Store Connect Private Key
└── clients/
    ├── google_play_client.test.ts
    ├── firebase_analytics_client.test.ts
    ├── github_client.test.ts
    └── app_store_client.test.ts
```

---

## 認証情報の取得方法

### 1. Google Play Developer API

#### 必要な権限
- Google Play Console の「ユーザーと権限」で対象アカウントに「財務データ、注文、キャンセルのアンケート回答を閲覧する」権限が必要
- Google Cloud Console でサービスアカウントを作成し、Google Play Console に連携

#### 取得手順
1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. プロジェクトを選択または作成
3. 「IAMと管理」→「サービスアカウント」→「サービスアカウントを作成」
4. サービスアカウント名を入力し作成
5. 「キー」タブ →「鍵を追加」→「新しい鍵を作成」→ JSON形式でダウンロード
6. [Google Play Console](https://play.google.com/console/) にアクセス
7. 「設定」→「APIアクセス」→「サービスアカウント」でCloud Consoleのサービスアカウントを連携
8. 必要な権限を付与（「財務データを閲覧」「レポートを閲覧」等）

#### 必要なAPI
- Google Play Android Developer API を有効化

---

### 2. Firebase Analytics Data API

#### 必要な権限
- Firebase プロジェクトの「閲覧者」以上の権限
- Google Analytics プロパティへのアクセス権

#### 取得手順
1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを選択
2. 「APIとサービス」→「ライブラリ」→「Google Analytics Data API」を有効化
3. 既存のサービスアカウント（Firebase Admin SDK）を使用可能
4. [Google Analytics](https://analytics.google.com/) にアクセス
5. 「管理」→「プロパティ」→「プロパティ設定」でプロパティID（数字）を確認
6. 「プロパティアクセス管理」でサービスアカウントのメールアドレスを追加

#### プロパティIDの形式
```
properties/123456789
```

---

### 3. GitHub API

#### 必要な権限（スコープ）
- `repo` - プライベートリポジトリへのアクセス（パブリックのみなら不要）
- `read:org` - 組織情報の読み取り（組織リポジトリの場合）

#### 取得手順（Personal Access Token - Classic）
1. [GitHub](https://github.com/) にログイン
2. 右上のアイコン →「Settings」
3. 左メニュー下部「Developer settings」
4. 「Personal access tokens」→「Tokens (classic)」→「Generate new token (classic)」
5. Note（トークン名）を入力
6. Expiration（有効期限）を設定
7. スコープを選択：
   - `repo` - フルアクセス（プライベートリポジトリ含む）
   - または `public_repo` - パブリックリポジトリのみ
8. 「Generate token」をクリック
9. 表示されたトークンをコピー（この画面を閉じると再表示不可）

#### 取得手順（Fine-grained Personal Access Token）※推奨
1. 「Personal access tokens」→「Fine-grained tokens」→「Generate new token」
2. Token name を入力
3. Expiration を設定
4. Resource owner を選択（個人または組織）
5. Repository access で対象リポジトリを選択
6. Permissions で必要な権限を設定：
   - `Contents`: Read-only
   - `Issues`: Read-only
   - `Pull requests`: Read-only
   - `Metadata`: Read-only（必須）
7. 「Generate token」をクリック

---

### 4. App Store Connect API

#### 必要な権限
- App Store Connect の「Admin」「App Manager」または「Developer」ロール
- APIキーの作成権限

#### 取得手順
1. [App Store Connect](https://appstoreconnect.apple.com/) にログイン
2. 「ユーザとアクセス」→「キー」タブ
3. 「App Store Connect API」セクション
4. 「+」ボタンでキーを生成
5. キー名を入力
6. アクセス権を選択（「Admin」「App Manager」「Developer」等）
7. 「生成」をクリック
8. 以下の情報を記録：
   - **Key ID**: キー一覧に表示（例: `ABC123DEFG`）
   - **Issuer ID**: ページ上部に表示（例: `12345678-1234-1234-1234-123456789012`）
9. 「APIキーをダウンロード」で `.p8` ファイルをダウンロード
   - **注意**: ダウンロードは1回のみ。紛失した場合は再生成が必要

#### App IDの確認方法
1. App Store Connect →「マイApp」→ 対象アプリを選択
2. 「App情報」→「一般情報」→「Apple ID」

#### Vendor Numberの確認方法
1. App Store Connect →「売上とトレンド」
2. 右上のレポートダウンロードから確認
3. または「ユーザとアクセス」→ 会社情報に記載

#### JWT生成について
App Store Connect APIはJWTトークンで認証。以下の情報でJWTを生成：
- Algorithm: ES256
- Key ID: 上記で取得したKey ID
- Issuer ID: 上記で取得したIssuer ID
- Audience: `appstoreconnect-v1`
- Expiration: 最大20分

```typescript
// JWT生成例
import jwt from "jsonwebtoken";
import fs from "fs";

const privateKey = fs.readFileSync("./AuthKey_XXXXXXXXXX.p8");
const token = jwt.sign({}, privateKey, {
    algorithm: "ES256",
    expiresIn: "20m",
    issuer: "ISSUER_ID",
    header: {
        alg: "ES256",
        kid: "KEY_ID",
        typ: "JWT"
    },
    audience: "appstoreconnect-v1"
});
```

---

## .gitignore 設定

```gitignore
# テスト用認証情報
test/.env
test/*.json
test/*.p8
!test/.env.example
```
