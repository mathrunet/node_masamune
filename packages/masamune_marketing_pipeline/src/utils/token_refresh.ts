import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { OAuthTokenData } from "../models/app_config";
import { logError, MarketingPipelineError, ErrorCategory } from "./error_handler";

/**
 * Token refresh result.
 */
export interface TokenRefreshResult {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
    refreshed: boolean;
}

/**
 * Token provider types.
 */
export type TokenProvider = "google" | "github" | "apple";

/**
 * Token refresh handler interface.
 */
export interface TokenRefreshHandler {
    (currentToken: OAuthTokenData): Promise<TokenRefreshResult>;
}

/**
 * Token refresh handlers registry.
 */
const tokenRefreshHandlers: Map<TokenProvider, TokenRefreshHandler> = new Map();

/**
 * Register a token refresh handler for a provider.
 */
export function registerTokenRefreshHandler(
    provider: TokenProvider,
    handler: TokenRefreshHandler
): void {
    tokenRefreshHandlers.set(provider, handler);
}

/**
 * Get OAuth token from Firestore with automatic refresh if needed.
 * Firestoreからトークンを取得し、必要に応じて自動更新。
 *
 * @param userId - User ID
 * @param provider - OAuth provider
 * @param firestoreInstance - Firestore instance (optional)
 * @returns Token data with valid access token
 */
export async function getValidToken(
    userId: string,
    provider: TokenProvider,
    firestoreInstance?: FirebaseFirestore.Firestore
): Promise<OAuthTokenData> {
    const firestore = firestoreInstance || admin.firestore();
    const tokenPath = `plugins/marketing/tokens/${userId}/${provider}`;
    const tokenDoc = await firestore.doc(tokenPath).get();

    if (!tokenDoc.exists) {
        throw new MarketingPipelineError(
            `Token not found for user ${userId} and provider ${provider}`,
            ErrorCategory.NOT_FOUND
        );
    }

    const tokenData = tokenDoc.data() as OAuthTokenData;

    // Check if token is expired or about to expire (5 minute buffer)
    const now = new Date();
    const expiresAt = tokenData.expiresAt?.toDate();
    const bufferMs = 5 * 60 * 1000; // 5 minutes

    if (expiresAt && expiresAt.getTime() - bufferMs <= now.getTime()) {
        // Token is expired or about to expire, try to refresh
        const handler = tokenRefreshHandlers.get(provider);

        if (!handler) {
            throw new MarketingPipelineError(
                `No refresh handler registered for provider ${provider}`,
                ErrorCategory.INTERNAL
            );
        }

        if (!tokenData.refreshToken) {
            throw new MarketingPipelineError(
                `No refresh token available for provider ${provider}`,
                ErrorCategory.AUTHENTICATION
            );
        }

        try {
            console.log(`Refreshing ${provider} token for user ${userId}...`);
            const result = await handler(tokenData);

            // Update token in Firestore
            const updatedTokenData: Partial<OAuthTokenData> = {
                accessToken: result.accessToken,
                updatedAt: Timestamp.now(),
            };

            if (result.refreshToken) {
                updatedTokenData.refreshToken = result.refreshToken;
            }

            if (result.expiresAt) {
                updatedTokenData.expiresAt = Timestamp.fromDate(result.expiresAt);
            }

            await firestore.doc(tokenPath).update(updatedTokenData);

            console.log(`Token refreshed successfully for ${provider}`);

            return {
                ...tokenData,
                ...updatedTokenData,
            } as OAuthTokenData;
        } catch (error: any) {
            logError("TokenRefresh", error, { userId, provider });
            throw new MarketingPipelineError(
                `Failed to refresh ${provider} token: ${error.message}`,
                ErrorCategory.AUTHENTICATION,
                false,
                error
            );
        }
    }

    return tokenData;
}

/**
 * Save OAuth token to Firestore.
 * OAuthトークンをFirestoreに保存。
 *
 * @param userId - User ID
 * @param provider - OAuth provider
 * @param tokenData - Token data to save
 * @param firestoreInstance - Firestore instance (optional)
 */
export async function saveToken(
    userId: string,
    provider: TokenProvider,
    tokenData: Omit<OAuthTokenData, "updatedAt">,
    firestoreInstance?: FirebaseFirestore.Firestore
): Promise<void> {
    const firestore = firestoreInstance || admin.firestore();
    const tokenPath = `plugins/marketing/tokens/${userId}/${provider}`;

    await firestore.doc(tokenPath).set(
        {
            ...tokenData,
            updatedAt: Timestamp.now(),
        },
        { merge: true }
    );

    console.log(`Token saved for ${provider} user ${userId}`);
}

/**
 * Delete OAuth token from Firestore.
 * OAuthトークンをFirestoreから削除。
 *
 * @param userId - User ID
 * @param provider - OAuth provider
 * @param firestoreInstance - Firestore instance (optional)
 */
export async function deleteToken(
    userId: string,
    provider: TokenProvider,
    firestoreInstance?: FirebaseFirestore.Firestore
): Promise<void> {
    const firestore = firestoreInstance || admin.firestore();
    const tokenPath = `plugins/marketing/tokens/${userId}/${provider}`;

    await firestore.doc(tokenPath).delete();

    console.log(`Token deleted for ${provider} user ${userId}`);
}

/**
 * Google OAuth token refresh handler.
 * GoogleのOAuthトークン更新ハンドラ。
 */
export const googleTokenRefreshHandler: TokenRefreshHandler = async (
    currentToken: OAuthTokenData
): Promise<TokenRefreshResult> => {
    if (!currentToken.refreshToken) {
        throw new Error("No refresh token available");
    }

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error("Google OAuth credentials not configured");
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: currentToken.refreshToken,
            grant_type: "refresh_token",
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token refresh failed: ${errorText}`);
    }

    const data = await response.json();

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || currentToken.refreshToken,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        refreshed: true,
    };
};

/**
 * GitHub token refresh handler (GitHub tokens don't expire but we validate them).
 * GitHubトークン更新ハンドラ（GitHubトークンは期限切れにならないが検証する）。
 */
export const githubTokenRefreshHandler: TokenRefreshHandler = async (
    currentToken: OAuthTokenData
): Promise<TokenRefreshResult> => {
    // GitHub personal access tokens don't expire, but we can validate them
    const response = await fetch("https://api.github.com/user", {
        headers: {
            Authorization: `token ${currentToken.accessToken}`,
            Accept: "application/vnd.github.v3+json",
        },
    });

    if (!response.ok) {
        throw new Error("GitHub token is invalid");
    }

    // Token is still valid
    return {
        accessToken: currentToken.accessToken,
        refreshed: false,
    };
};

// Register default handlers
registerTokenRefreshHandler("google", googleTokenRefreshHandler);
registerTokenRefreshHandler("github", githubTokenRefreshHandler);
