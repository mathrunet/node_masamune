# 開発ロードマップ

このドキュメントは、`requirements.md`に記載された「自立して動くアセット作成システム」を実現するための段階的な開発フローをまとめたものです。

## 開発の進め方（APIキー並行準備）
APIキーの取得と開発を並行して進められるよう、初期フェーズではモックやエミュレータを活用します。
**YouTube** と **X (Twitter)** を優先実装し、その他のプラットフォームは後続フェーズで追加します。

## フェーズ1: 基盤構築とトリガー実装
システムの入口となるトリガー部分と、データ管理の基盤を構築します。
*APIキー不要で開発可能です。*

- [x] **プロジェクトセットアップ**: Cloud Functions (2nd Gen) と Firestore, Cloud Storage の環境設定
- [x] **Httpトリガー関数 (`start_asset_creation`)**:
    - チャンネルテーマやアセットを受け取り、Firestoreに初期データを保存する
    - 調査開始フラグを立てる、または広域調査関数を呼び出す
- [x] **スケジューラー関数 (`schedule_asset_creation`)**:
    - 定期的に実行され、Firestoreの最終作成日時をチェック
    - 条件を満たせばアセット作成プロセスを開始する

## フェーズ2: 調査・企画機能の実装
DeepResearchを用いたテーマ決定と詳細調査のロジックを実装します。

- [x] **広域調査関数 (`conduct_broad_research`)**:
    - チャンネルテーマに基づき **Gemini (Grounding with Google Search)** を用いてテーマ候補を収集
    - Firestoreのベクター検索を用いて既存テーマとの重複チェック
    - 決定したテーマをFirestoreに保存し、詳細調査へ移行
- [x] **詳細調査関数 (`conduct_detailed_research`)**:
    - 決定したテーマについて **Gemini (Grounding with Google Search)** を用いてDeepResearchを実行
    - 動画・画像生成に必要な詳細情報を収集・整理してFirestoreに保存（10-15分の動画に耐えうる情報量）
    - 生成するアセットタイプ（ショート動画、長尺動画、漫画、画像）をAIが自動判定
    - アセットタイプに応じて次のプロセスをトリガー（関数名を返却）

## フェーズ3: ショート動画生成パイプライン
ショート動画（60秒程度）の生成フローを実装します。

- [x] **ショート動画情報生成関数 (`generate_short_video_metadata`)**:
    - 詳細調査データから動画メタデータ（タイトル、概要、キーワード、プロモーションテキスト、言語）を作成
    - ショート動画の概要（詳細、視覚的雰囲気、音楽的雰囲気）を生成
    - シーンごとの詳細構成（視覚、オーディオ、エフェクト、トランジション、時間）を生成
    - FFmpeg演出指示データをJSON形式で出力
    - **TDD（テスト駆動開発）で実装完了**
- [x] **ショート動画生成関数 (`generate_short_video`)**:
    - **使用ライブラリ**: `fluent-ffmpeg` (操作用), `ffmpeg-static` (バイナリ), `@google-cloud/text-to-speech`, `google-auth-library`
    - **実装済み機能**:
        - シーンメタデータからの動画生成フレームワーク
        - FFmpegエフェクトマッパー（zoom_in, zoom_out, pan, slide等）
        - SRT形式の字幕ファイル自動生成
        - **Google Cloud TTSでナレーション音声を生成** (Neural2音声使用)
        - **Lyria (Google Music AI) でBGM生成** (30秒のインストゥルメンタル音楽、WAVからMP3に変換)
        - **BGMフォールバック機能** (Lyria APIエラー時はサイレント音声を生成)
        - **FFmpegでナレーション+BGMをミックス**して動画に合成
        - **Gemini 2.5 Flash Imageで画像生成**
        - Cloud Storageへの動画・字幕・音声ファイルアップロード
        - 一時ファイルの自動クリーンアップ
        - **テスト用に生成ファイルをtest/tmpに保存**
    - **BGM生成の詳細**:
        - Lyria-002モデルを使用してテキストプロンプトから音楽を生成
        - `musicAtmosphere`（例: "epic orchestral"）から自動的にプロンプトを構築
        - 生成された48kHz WAVオーディオをMP3 128kbpsに変換
        - エラー時は自動的にサイレント音声にフォールバック
    - **認証実装**: `process.env.GOOGLE_SERVICE_ACCOUNT`からサービスアカウント情報を読み取り、GoogleAuthで認証
    - **テストパターン**: `google_token.test.ts`と同様の方式で、テストコードでサービスアカウントJSONをファイルから読み込み環境変数に設定
    - **TODO（次のイテレーション）**:
        - Firestore/Storageから既存のBGM/SEを取得する機能
        - Vertex AI User権限の確認（サービスアカウントに`aiplatform.endpoints.predict`権限が必要）
        - SE（効果音）の追加
    - **TDD（テスト駆動開発）で実装完了**
    - **テストファイル**: `test/generate_short_video.test.ts` (基本動画生成), `test/generate_short_video_with_audio.test.ts` (音声付き動画生成)
    - **成果物**:
        - 完成した動画ファイル (MP4, H.264, 1920x1080, 25fps, AAC音声)
        - 字幕ファイル (SRT形式)
        - ナレーション音声ファイル (MP3)
        - BGM音声ファイル (MP3)

- [ ] **ショート動画合成関数 (`compose_short_video`)**:
    - 必要に応じて複数の生成パートを結合（基本は上記関数で完結する可能性あり）。
    - 完成した動画をCloud Storageに保存

## フェーズ4: 長尺動画生成パイプライン
シーン分割を伴う長尺動画（10〜15分）の生成フローを実装します。

- [ ] **動画情報生成関数 (`generate_video_metadata`)**:
    - 詳細調査データから動画全体の構成とシーン分割を行う
    - 各シーンのメタデータをFirestoreに保存
- [ ] **シーン動画情報生成関数 (`generate_scene_metadata`)**:
    - 各シーンごとの詳細な演出・プロンプトを生成（並列実行）
- [ ] **シーン動画生成関数 (`generate_scene_video`)**:
    - **変更点**: Veoは使用せず、画像+音声+FFmpegで動画を生成します。
    - **処理フロー**: ショート動画生成関数と同様（画像+音声+FFmpeg）。
    - シーンごとに並列実行。

- [ ] **シーン動画合成関数 (`compose_scene_video`)**:
    - 生成されたシーン動画（画像+音声から作られたもの）を結合。してシーン動画を作成
- [ ] **動画合成関数 (`compose_full_video`)**:
    - 全シーンの動画を結合して最終的な長尺動画を作成

## フェーズ5: 静止画・漫画生成パイプライン
画像および漫画アセットの生成フローを実装します。

- [ ] **漫画情報生成関数 (`generate_manga_metadata`)**:
    - 漫画の構成（コマ割り、セリフ、プロンプト）を作成
- [ ] **漫画生成関数 (`generate_manga_assets`)**:
    - Gemini等を用いて漫画画像を生成
- [ ] **画像情報生成関数 (`generate_image_metadata`)**:
    - 画像のメタデータとプロンプトを作成
- [ ] **画像生成関数 (`generate_image_assets`)**:
    - Gemini等を用いて画像を生成

## FFmpeg演出指示メカニズム (New)

動画のクオリティとバリエーションを担保するため、AI（Gemini）はFFmpegへの直接的なコマンドではなく、**中間指示データ (JSON)** を生成します。これをシステム側で解釈し、最適なFFmpegフィルタコマンドに変換します。

### 指示データ構造案 (JSON)

```json
{
  "scenes": [
    {
      "visual": {
        "image_query": "medieval castle sunset", // 画像検索/生成用クエリ
        "effect": {
          "type": "zoom_in", // zoom_in, zoom_out, pan_left, pan_right, static, slide_up...
          "intensity": "medium" // low, medium, high
        },
        "transition": {
          "type": "crossfade", // crossfade, fade_black, wipe...
          "duration": 1.0
        }
      },
      "audio": {
        "narration_text": "その時、歴史が動いた...",
        "bgm_file_id": "epic_battle_01", // Firestore上のID
        "se_file_ids": ["sword_clash_01"]
      },
      "duration": 5.0 // 秒数（ナレーション長さに合わせて自動調整も可）
    }
  ]
}
```

### 実装方針
1. **Effect Mapper**: `zoom_in` などの抽象的な指示を、FFmpegの `zoompan` フィルタ等の具体的なパラメータに変換するロジックを実装します。
    - **安定性**: 複雑なフィルタ構文をコード側で隠蔽し、エラーを防ぎます。
    - **バリエーション**: 同じ `zoom_in` でも、パラメータ（速度、開始点）をランダムに変動させることで、毎回異なる演出になります。
2. **Asset Manager**: 画像や音声の再利用性を高めるため、生成・取得したアセットは全てハッシュ化またはID管理し、Firestoreにメタデータ（プロンプト、雰囲気タグ等）と共に保存します。

---

## フェーズ6: 配信・公開機能 (YouTube & X)
生成されたアセットを優先プラットフォームへアップロードする機能を実装します。

- [ ] **動画配信関数 / 画像配信関数**:
    - 配信先設定に基づき、各プラットフォームの配信関数を呼び出す
- [ ] **YouTube配信関数**: 動画・ショート動画のアップロード、メタデータ設定
- [ ] **X (Twitter) 配信関数**: 画像・動画の投稿

## フェーズ7: 追加配信プラットフォーム (Future)
以下のプラットフォームは後日追加実装します。

- [ ] **Instagram配信関数**: 画像・リール動画のアップロード
- [ ] **TikTok配信関数**: ショート動画のアップロード
- [ ] **AdobeStock配信関数**: 画像のアップロード
- [ ] **Suzuri配信関数**: 画像を用いたグッズ登録等

## 開発の進め方
1. 各フェーズごとにブランチを作成して開発を行う
2. **テスト駆動開発 (TDD) を徹底する**: 各関数の実装前に必ずテストコードを作成し、テストが通ることを確認しながら実装を進める
3. 各関数は単体でテスト可能なように設計する
4. Firestoreのエミュレータを活用し、ローカル環境での動作検証を徹底する
