
/**
 * API header interface.
 * 
 * APIヘッダーインターフェース。
 */
export interface ApiHeader {
    "Content-Type": string;
    Authorization: string;
    [key: string]: string | string[];
}

/**
 * OpenAI request interface.
 * 
 * OpenAIのリクエストインターフェース。
 */
export interface OpenAIRequest {
    model: string;
    messages: {
        [key: string]: any;
    }[];
    temperature: number;
}

/**
 * OpenAI response interface.
 * 
 * OpenAIのレスポンスインターフェース。
 */
export interface OpenAIResponse {
    [key: string]: any;
}