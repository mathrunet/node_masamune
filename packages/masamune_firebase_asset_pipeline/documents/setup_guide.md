# API Registration and Configuration Guide

This guide explains how to register the APIs required for development and obtain their keys, step by step.

---

## 1. Google Cloud Platform (GCP) / Firebase

### 1-1. Create a Project and Enable Billing
1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. In the project selector at the top left, click "New Project".
3. Enter a project name (for example, `masamune-asset-creator`) and click "Create".
4. Select the project you created.
5. Open "Billing" in the left menu and link a billing account to enable billing (required for Vertex AI and Cloud Functions).

### 1-2. Enable Required APIs
1. Search for "API and Services" in the top search bar and open the dashboard.
2. Click "Enable APIs and Services".
3. Search for each of the following APIs and click "Enable".
    - **Cloud Functions API**
    - **Cloud Firestore API**
    - **Cloud Storage API**
    - **Vertex AI API**
        - Enable **Grounding with Google Search** for DeepResearch.
    - **Cloud Text-to-Speech API** (for narration generation)
    - **YouTube Data API v3**

FFmpeg handles video composition and effects. Cloud Functions (2nd Gen) includes FFmpeg, but this project uses `ffmpeg-static` and `fluent-ffmpeg` for version pinning and convenient local development.

```bash
npm install fluent-ffmpeg ffmpeg-static
```

### 1-3. Obtain a Service Account Key (Development)
1. Open "IAM & Admin" > "Service Accounts".
2. For the `App Engine default service account` or a newly created account, open the actions menu and select "Manage keys".
3. Select "Add key" > "Create new key".
4. Select "JSON" as the key type and click "Create".
5. Save the downloaded JSON as `service-account.json` in a secure project location (do not commit it to Git).

---

## 2. Google Custom Search API (Web Search)

*Separate Custom Search API configuration is no longer required because the system uses Gemini's Grounding with Google Search.*

---

## 3. YouTube Data API

### 3-1. Configure the OAuth Consent Screen
1. In the GCP Console, open "APIs & Services" > "OAuth consent screen".
2. Select "External" as the user type and click "Create".
3. Enter the app name, user support email, and other details, then save and continue.
4. Under "Scopes", add scopes such as `../auth/youtube.upload` and `../auth/youtube`.
5. Under "Test users", add the email address of the Google account used for development.

### 3-2. Create an OAuth Client ID
1. Select "Credentials" > "Create Credentials" > "OAuth client ID".
2. Select "Web application" as the application type.
3. Add `https://developers.google.com/oauthplayground` under **Authorized redirect URIs** to obtain a refresh token.
4. Copy the **Client ID** and **Client Secret** after creation.

### 3-3. Obtain a Refresh Token
1. Open the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/).
2. Click the gear icon at the top right, enable "Use your own OAuth credentials", and enter the client ID and secret.
3. In Step 1 on the left, find `YouTube Data API v3`, select permissions such as `https://www.googleapis.com/auth/youtube.upload`, and click "Authorize APIs".
4. Sign in with your Google account and grant permission.
5. In Step 2, click "Exchange authorization code for tokens".
6. Copy the displayed **Refresh Token**.

---

## 4. Instagram (Meta for Developers)

### 4-1. Create an App
1. Open [Meta for Developers](https://developers.facebook.com/) and sign in.
2. Click "My Apps" > "Create App".
3. Select an app type such as "Business" and continue.
4. Enter the app name and create the app.

### 4-2. Configure the Instagram Graph API
1. In the app dashboard, open "Add Product" and click "Set Up" for "Instagram Graph API".
2. Open "Settings" > "Basic" in the left menu and obtain the **App ID** and **app secret**.

### 4-3. Link an Instagram Professional Account to a Facebook Page
1. In the Instagram app, switch the account to a professional account (business or creator).
2. Create a Facebook Page and link it to the Instagram account.

### 4-4. Obtain an Access Token
1. Open "Tools" > "Graph API Explorer".
2. Generate a token for a user linked to the Facebook Page.
3. Add the required permissions (such as `instagram_basic` and `instagram_content_publish`) and generate the token.
4. Convert the short-lived token to a long-lived access token using the debugger or a similar tool.

---

## 5. TikTok for Developers

### 5-1. Register an App
1. Open [TikTok for Developers](https://developers.tiktok.com/) and register.
2. Click "Manage apps" > "Create an app".
3. Enter the required information and create the app.
4. Obtain the **Client Key** and **Client Secret**.

### 5-2. Request Permissions
1. In the app settings, add products such as "Content Posting API" and submit for review (review may take time).

---

## 6. X (Twitter) Developer Platform

### 6-1. Create a Project and App
1. Open the [X Developer Portal](https://developer.twitter.com/en/portal/dashboard).
2. A Basic plan (or Pro) or higher may be required; the Free plan has strict write limits.
3. Create a project and app.

### 6-2. Obtain Keys and Tokens
1. Open the app's "Keys and tokens" tab.
2. Generate and save the **API Key** and **API Key Secret**.
3. Generate and save the **Access Token** and **Access Token Secret**.
    - Ensure permissions are set to "Read and Write" when generating tokens. Otherwise, enable OAuth 1.0a under "Settings" > "User authentication settings", change permissions, and regenerate the tokens.

---

## 7. Adobe Stock API

### 7-1. Create an Integration
1. Open the [Adobe Developer Console](https://developer.adobe.com/console/home).
2. Click "Create new project".
3. Click "Add API" and select "Adobe Stock".
4. Select an authentication method such as OAuth Server-to-Server and complete configuration.
5. Obtain the **Client ID (API Key)** and **Client Secret**.

---

## 8. Suzuri API

### 8-1. Generate an API Key
1. Sign in to Suzuri and open [Settings](https://suzuri.jp/settings/apps), such as the app integration settings.
2. Create an application or generate a key through the API settings.
3. Obtain the **API Key**.

---

## 9. Configure Environment Variables

Manage the acquired keys in a `.env` file at the project root (created by copying `.env.example`), as shown below.

```bash
# .env

# GCP / Firebase
GCP_PROJECT_ID=masamune-asset-creator
GCP_REGION=asia-northeast1

# Google Custom Search (not required)
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
