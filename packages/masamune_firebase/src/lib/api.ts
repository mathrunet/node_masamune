import fetch from "node-fetch";
import { Response as ApiResponse, HeadersInit as ApiHeaders } from "node-fetch";
import FormData from "form-data";
export { Response as ApiResponse, HeadersInit as ApiHeaders } from "node-fetch";

/**
 * API for Rest can be called.
 *
 * Rest用のAPIを呼び出すことができます。
 */
export abstract class Api {
  /**
   * Call the API with the `GET` parameter.
   * 
   * `GET`パラメーターでAPIを呼び出します。
   * 
   * @param {string} url
   * The URL of the API to call.
   * 
   * 呼び出すAPIのURL。
   *  
   * @param {GetRequestOptions | undefined} options
   * Options for `GET` requests.
   * 
   * `GET`リクエスト用のオプション。
   * 
   * @returns {Promise<ApiResponse>}
   * Response from API.
   * 
   * APIからのレスポンス。
   */
  public static async get(
    url: string,
    options?: GetRequestOptions | undefined,
  ): Promise<ApiResponse> {
    const res = await fetch(url, {
      method: "GET",
      headers: options?.headers,
      timeout: options?.timeout,
    });
    return res;
  }

  /**
   * Call the API with the `POST` parameter.
   * 
   * `POST`パラメーターでAPIを呼び出します。
   * 
   * @param {string} url
   * The URL of the API to call.
   * 
   * 呼び出すAPIのURL。
   * 
   * @param {PostRequestOptions | undefined} options
   * Options for `POST` requests.
   * 
   * `POST`リクエスト用のオプション。
   * 
   * @returns {Promise<ApiResponse>}
   * Response from API.
   * 
   * APIからのレスポンス。
   */
  public static async post(
    url: string,
    options?: PostRequestOptions | undefined,
  ): Promise<ApiResponse> {
    const data = options?.data;
    let body: string | FormData | undefined = undefined;
    if (data && typeof data === "string") {
      body = data;
    } else if (data && typeof data === "object") {
      body = new FormData();
      for (const key in data) {
        body.append(key, data[key]);
      }
    }
    const res = await fetch(url, {
      method: "POST",
      headers: options?.headers,
      body: body,
      timeout: options?.timeout,
    });
    return res;
  }

  /**
   * Call the API with the `PUT` parameter.
   * 
   * `PUT`パラメーターでAPIを呼び出します。
   * 
   * @param {string} url
   * The URL of the API to call.
   * 
   * 呼び出すAPIのURL。
   * 
   * @param {PutRequestOptions | undefined} options
   * Options for `PUT` requests.
   * 
   * `PUT`リクエスト用のオプション。
   * 
   * @returns {Promise<ApiResponse>}
   * Response from API.
   * 
   * APIからのレスポンス。
   */
  public static async put(
    url: string,
    options?: PutRequestOptions | undefined,
  ): Promise<ApiResponse> {
    const data = options?.data;
    let body: string | FormData | undefined = undefined;
    if (data && typeof data === "string") {
      body = data;
    } else if (data && typeof data === "object") {
      body = new FormData();
      for (const key in data) {
        body.append(key, data[key]);
      }
    }
    const res = await fetch(url, {
      method: "PUT",
      headers: options?.headers,
      body: body,
      timeout: options?.timeout,
    });
    return res;
  }

  /**
   * Call the API with the `DELETE` parameter.
   * 
   * `DELETE`パラメーターでAPIを呼び出します。
   * 
   * @param {string} url
   * The URL of the API to call.
   * 
   * 呼び出すAPIのURL。
   * 
   * @param {DeleteRequestOptions | undefined} options
   * Options for `DELETE` requests.
   * 
   * `DELETE`リクエスト用のオプション。
   * 
   * @returns {Promise<ApiResponse>}
   * Response from API.
   * 
   * APIからのレスポンス。
   */
  public static async delete(
    url: string,
    options?: DeleteRequestOptions | undefined,
  ): Promise<ApiResponse> {
    const res = await fetch(url, {
      method: "DELETE",
      headers: options?.headers,
      timeout: options?.timeout,
    });
    return res;
  }
  

}

/**
 * Options for `GET` requests.
 * 
 * `GET`リクエスト用のオプション。
 *  
 * @param {ApiHeaders | undefined} headers
 * Header information to be sent to the API.
 * 
 * APIに送信するヘッダー情報。
 * 
 * @param {number | undefined} timeout
 * Timeout time for API call.
 * 
 * API呼び出しのタイムアウト時間。
 */
export interface GetRequestOptions {
  headers?: ApiHeaders | undefined;
  timeout?: number | undefined;
}

/**
 * Options for `POST` requests.
 * 
 * `POST`リクエスト用のオプション。
 *  
 * @param {ApiHeaders | undefined} headers
 * Header information to be sent to the API.
 * 
 * APIに送信するヘッダー情報。
 * 
 * @param {number | undefined} timeout
 * Timeout time for API call.
 * 
 * API呼び出しのタイムアウト時間。
 * 
 * @param {data: { [key: string]: any } | string | undefined}
 * Data to be sent to the API.
 * 
 * APIに送信するデータ。
 */
export interface PostRequestOptions {
  headers?: ApiHeaders | undefined;
  timeout?: number | undefined;
  data: { [key: string]: any } | string | undefined;
}

/**
 * Options for `PUT` requests.
 * 
 * `PUT`リクエスト用のオプション。
 *  
 * @param {ApiHeaders | undefined} headers
 * Header information to be sent to the API.
 * 
 * APIに送信するヘッダー情報。
 * 
 * @param {number | undefined} timeout
 * Timeout time for API call.
 * 
 * API呼び出しのタイムアウト時間。
 * 
 * @param {data: { [key: string]: any } | string | undefined}
 * Data to be sent to the API.
 * 
 * APIに送信するデータ。
 */
export interface PutRequestOptions {
  headers?: ApiHeaders | undefined;
  timeout?: number | undefined;
  data: { [key: string]: any } | string | undefined;
}

/**
 * Options for `DELETE` requests.
 * 
 * `DELETE`リクエスト用のオプション。
 *  
 * @param {ApiHeaders | undefined} headers
 * Header information to be sent to the API.
 * 
 * APIに送信するヘッダー情報。
 * 
 * @param {number | undefined} timeout
 * Timeout time for API call.
 * 
 * API呼び出しのタイムアウト時間。
 */
export interface DeleteRequestOptions {
  headers?: ApiHeaders | undefined;
  timeout?: number | undefined;
}