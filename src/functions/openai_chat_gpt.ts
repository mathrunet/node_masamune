import * as functions from "firebase-functions";
import fetch from "node-fetch";

/**
 * The text is generated using Open AI's GPT.
 * 
 * Open AIのChat GPTを利用して文章を生成します。
 * 
 * @param openai.api_key
 * Set the API key, which can be obtained from the following URL.
 * 
 * 下記URLから取得できるAPIキーを設定します。
 * 
 * https://platform.openai.com/account/api-keys
 * 
 * @param message
 * Specify the actual message to be passed.
 * 
 * 実際に渡すメッセージを指定します。
 * 
 * @param model
 * Specifies the model to be used. Default is `gpt-3.5-turbo`.
 * 
 * 使用するモデルを指定します。デフォルトは`gpt-3.5-turbo`。
 * 
 * @param temperature
 * Specify the sampling temperature (*) between 0 and 1.
 * The lower the value, the more relevant words are likely to be selected; the higher the value, the more diverse words are likely to be selected.
 * 
 * サンプリング温度(※)を 0〜1 の間で指定します。
 * 値が低いほど、より関連性の高い単語が選ばれやすくなり、値が高いほど、より多様な単語が選ばれやすくなります。
 */
module.exports = (regions: string[]) => functions.region(...regions).https.onCall(
    async (query) => {
        try {
            const apiKey = functions.config().openai.api_key;
            const message = query.message as { [key: string]: any }[];
            const model = query.model as string | undefined ?? "gpt-3.5-turbo";
            const temperature = query.temperature as number | undefined ?? 1;
            if (message.length <= 0) {
                throw new functions.https.HttpsError("invalid-argument", "No content specified in `message`.");
            }

            const res = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    "model": model,
                    "messages": message,
                    "temperature": temperature,
                }),
            });

            return (await res.json()) as { [key: string]: any };
        } catch (err) {
            console.log(err);
            throw err;
        }
    }
);
