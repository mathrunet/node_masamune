# API登録・設定詳細ガイド

本システムの開発に必要な各種APIの登録手順とキーの取得方法をステップごとに解説します。

---

## 1. Google Cloud Platform (GCP) / Firebase

### 1-1. プロジェクト作成と課金有効化
1. [Google Cloud Console](https://console.cloud.google.com/) にアクセスします。
2. 左上のプロジェクト選択プルダウンから「新しいプロジェクト」をクリックします。
3. プロジェクト名（例: `masamune-asset-creator`）を入力し、「作成」をクリックします。
4. 作成したプロジェクトを選択します。
5. 左側メニューの「お支払い」から、請求先アカウントをリンクして課金を有効化します（Vertex AIやCloud Functionsの使用に必須です）。

### 1-2. 必須APIの有効化
1. 上部の検索バーで「API and Services」を検索し、ダッシュボードを開きます。
2. 「APIとサービスの有効化」をクリックします。
3. 以下のAPIを順に検索し、「有効にする」をクリックします。
    - **Cloud Functions API**
    - **Cloud Firestore API**
    - **Cloud Storage API**
    - **Vertex AI API**# FFmpeg (動画合成・エフェクト処理用)
# Cloud Functions (第2世代) にはFFmpegがプリインストールされていますが、
# バージョン固定やローカル開発の利便性のため `ffmpeg-static` と `fluent-ffmpeg` を使用します。
# npm install fluent-ffmpeg ffmpeg-static
        - **Grounding with Google Search** を有効にする必要があります（DeepResearch用）。
    - **Cloud Text-to-Speech API** (ナレーション生成用)
    - **YouTube Data API v3**

### 1-3. サービスアカウントキーの取得 (開発用)
1. 「IAMと管理」 > 「サービスアカウント」を開きます。
2. `App Engine default service account` または新規作成したアカウントの「操作」（︙）をクリックし、「鍵を管理」を選択します。
3. 「鍵を追加」 > 「新しい鍵を作成」を選択します。
4. キーのタイプで「JSON」を選択し、「作成」をクリックします。
5. 自動的にダウンロードされるJSONファイルを `service-account.json` として保存し、プロジェクトの安全な場所に配置します（Gitにはコミットしないでください）。

---

## 2. Google Custom Search API (Web検索)

*GeminiのGrounding with Google Search機能を利用するため、別途Custom Search APIの設定は不要になりました。*

---

## 3. YouTube Data API

### 3-1. OAuth同意画面の設定
1. GCP Consoleの「APIとサービス」 > 「OAuth同意画面」を開きます。
2. User Typeで「外部」を選択し、「作成」をクリックします。
3. アプリ名、ユーザーサポートメール等を入力し、保存して次へ進みます。
4. 「スコープ」で `../auth/youtube.upload` や `../auth/youtube` などを追加します。
5. 「テストユーザー」に、開発に使用するGoogleアカウントのメールアドレスを追加します。

### 3-2. OAuthクライアントIDの作成
1. 「認証情報」 > 「認証情報を作成」 > 「OAuth クライアント ID」を選択します。
2. アプリケーションの種類: 「Web アプリケーション」を選択します。
3. **承認済みのリダイレクト URI**: `https://developers.google.com/oauthplayground` を追加します（リフレッシュトークン取得用）。
4. 作成後、**クライアント ID** と **クライアント シークレット** をコピーします。

### 3-3. リフレッシュトークンの取得
1. [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/) にアクセスします。
2. 右上の歯車アイコンをクリックし、"Use your own OAuth credentials" にチェックを入れ、取得したクライアントIDとシークレットを入力します。
3. 左側のStep 1で `YouTube Data API v3` を探し、`https://www.googleapis.com/auth/youtube.upload` 等の権限を選択して "Authorize APIs" をクリックします。
4. Googleアカウントでログインし、許可を与えます。
5. Step 2で "Exchange authorization code for tokens" をクリックします。
6. 表示された **Refresh Token** をコピーします。

---

## 4. Instagram (Meta for Developers)

### 4-1. アプリの作成
1. [Meta for Developers](https://developers.facebook.com/) にアクセスし、ログインします。
2. 「マイアプリ」 > 「アプリを作成」をクリックします。
3. アプリのタイプとして「ビジネス」などを選択し、次へ進みます。
4. アプリ名を入力し、アプリを作成します。

### 4-2. Instagram Graph APIの設定
1. アプリのダッシュボードで「製品を追加」から「Instagram Graph API」の「設定」をクリックします。
2. 左メニューの「設定」 > 「ベーシック」を開き、**アプリID** と **app secret** を取得します。

### 4-3. InstagramプロアカウントとFacebookページのリンク
1. Instagramアプリで、アカウントを「プロアカウント（ビジネスまたはクリエイター）」に切り替えます。
2. Facebookページを作成し、Instagramアカウントとリンクさせます。

### 4-4. アクセストークンの取得
1. 「ツール」 > 「グラフAPIエクスプローラ」を開きます。
2. Facebookページとリンク済みのユーザーでトークンを生成します。
3. 必要な権限 (`instagram_basic`, `instagram_content_publish` 等) を追加してトークンを生成します。
4. 生成された短期トークンを、デバッガーツール等を使って長期トークン（Long-lived Access Token）に変換します。

---

## 5. TikTok for Developers

### 5-1. アプリの登録
1. [TikTok for Developers](https://developers.tiktok.com/) にアクセスし、登録します。
2. 「Manage apps」 > 「Create an app」をクリックします。
3. 必要な情報を入力し、アプリを作成します。
4. **Client Key** と **Client Secret** を取得します。

### 5-2. 権限申請
1. アプリの設定画面で「Products」から「Content Posting API」などを追加し、審査を申請します（審査には時間がかかる場合があります）。

---

## 6. X (Twitter) Developer Platform

### 6-1. プロジェクトとアプリの作成
1. [X Developer Portal](https://developer.twitter.com/en/portal/dashboard) にアクセスします。
2. Basicプラン（またはPro）以上の契約が必要になる場合があります（Freeプランは書き込み制限が厳しいです）。
3. プロジェクトとアプリを作成します。

### 6-2. キーとトークンの取得
1. アプリの「Keys and tokens」タブを開きます。
2. **API Key** と **API Key Secret** を生成・保存します。
3. **Access Token** と **Access Token Secret** を生成・保存します。
    - ※ 生成時に権限が "Read and Write" になっていることを確認してください。なっていなければ「Settings」 > 「User authentication settings」でOAuth 1.0aをオンにし、権限を変更してから再生成します。

---

## 7. Adobe Stock API

### 7-1. 統合機能の作成
1. [Adobe Developer Console](https://developer.adobe.com/console/home) にアクセスします。
2. 「新しいプロジェクトを作成」をクリックします。
3. 「APIを追加」をクリックし、「Adobe Stock」を選択します。
4. 認証方式（OAuth Server-to-Server等）を選択し、設定を完了します。
5. **Client ID (API Key)** と **Client Secret** を取得します。

---

## 8. Suzuri API

### 8-1. APIキーの生成
1. Suzuriにログインし、[設定画面](https://suzuri.jp/settings/apps)（アプリ連携設定など）にアクセスします。
2. 新規アプリケーションを作成、またはAPI利用設定からキーを生成します。
3. **API Key** を取得します。

---

## 9. 環境変数への反映

取得したキーは、プロジェクトルートの `.env` ファイル（`.env.example` をコピーして作成）に以下のように記述して管理します。

```bash
# .env

# GCP / Firebase
GCP_PROJECT_ID=masamune-asset-creator
GCP_REGION=asia-northeast1

# Google Custom Search (不要)
# GOOGLE_CUSTOM_SEARCH_API_KEY=...
# GOOGLE_CUSTOM_SEARCH_CX=...

# YouTube
YOUTUBE_CLIENT_ID=12345...apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=GOCSPX-...
YOUTUBE_REFRESH_TOKEN=1//0e...

# Instagram
INSTAGRAM_ACCESS_TOKEN=EAAB...
INSTAGRAM_ACCOUNT_ID=1784...

# TikTok
TIKTOK_CLIENT_KEY=aw3...
TIKTOK_CLIENT_SECRET=...

# X (Twitter)
TWITTER_API_KEY=...
TWITTER_API_SECRET=...
TWITTER_ACCESS_TOKEN=...
TWITTER_ACCESS_SECRET=...

# Adobe Stock
ADOBE_STOCK_API_KEY=...
ADOBE_STOCK_CLIENT_SECRET=...

# Suzuri
SUZURI_API_KEY=...
```
