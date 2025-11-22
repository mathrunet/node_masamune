import * as functions from "firebase-functions/v2";
import * as stripe from "stripe";
import * as admin from "firebase-admin";
import { HttpFunctionsOptions, firestoreLoader } from "@mathrunet/masamune";
import { lib as sendgrid } from "@mathrunet/masamune_mail_sendgrid";
import { lib as gmail } from "@mathrunet/masamune_mail_gmail";


/**
 * Performs various Stripe processes.
 * Firestore integration is a must; please make Firestore available as well.
 *
 * Stripeの各種処理を実行します。
 * Firestoreとの連携が必須です。Firestoreも利用可能にしてください。
 *
 * @param {string} process.env.PURCHASE_STRIPE_SECRETKEY
 * API key (secret key) to connect to Stripe.
 * Log in to the following URL and create a project.
 * After the project is created, the secret key can be copied.
 *
 * Stripeへ接続するためのAPIキー（シークレットキー）。
 * 下記URLにログインし、プロジェクトを作成します。
 * プロジェクト作成後、シークレットキーをコピーすることができます。
 *
 * Production environment
 * https://dashboard.stripe.com/apikeys
 * Development enveironment
 * https://dashboard.stripe.com/test/apikeys
 *
 * @param {string} process.env.PURCHASE_STRIPE_USERPATH
 * Stripe user (customer) pass.
 * Stripeのユーザー（カスタマー）用パス。
 *
 * @param {string} process.env.PURCHASE_STRIPE_PAYMENTPATH
 * Path for payment method information to be placed under [process.env.PURCHASE_STRIPE_USERPATH].
 * [process.env.PURCHASE_STRIPE_USERPATH]の下に配置する支払い方法の情報用パス。
 *
 * @param {string} process.env.PURCHASE_STRIPE_PURCHASEPATH
 * Path for purchase information to be placed under [process.env.PURCHASE_STRIPE_USERPATH].
 * [process.env.PURCHASE_STRIPE_USERPATH]の下に配置する購入情報用パス。
 *
 * @param {string} process.env.PURCHASE_STRIPE_EMAILPROVIDER
 * Mail provider when sending mail. (gmail | sendgrid)
 * メールを送信する際のメールプロバイダー。（gmail | sendgrid）
 *
 * @param {string} mode
 * [required]
 * Specifies the mode in which Stripe will run.
 * Stripeの実行するモードを指定します。
 *
 * - create_account
 *   - Create a link to register to create a Stripe account to receive payments. Once these registrations are complete, an account will be created. The actual account information is stored in Firestore. Please refer there. 支払いを受け取るためのStripeアカウントを作成するための登録用リンクを作成します。これらの登録が完了するとアカウントが作成されます。実際のアカウント情報はFirestoreに保存されます。そちらを参照してください。
 * - delete_account
 *   - Delete an account to receive payments already created. すでに作成された支払いを受け取るためのアカウントを削除します。
 * - get_account
 *   - Get an account to receive payments already created. すでに作成された支払いを受け取るためのアカウントを取得します。
 * - dashboard_account
 *   - Returns the URL of the dashboard for modifying information on an already created account to receive payments. Receipt of payments, etc. is also done from here. すでに作成された支払いを受け取るためのアカウントの情報を変更するためのダッシュボードのURLを返します。支払いの受け取りなどもここから行います。
 *
 * - create_customer_and_payment
 *   - Create a buyer (customer) for Stripe and a payment method associated with it. After creating this, use [create_purchase] to create the actual payment. The actual customer and payment information is stored in Firestore. Please refer there. Stripe用の購入者（カスタマー）とそれに紐づいた支払い方法を作成します。これを作成後、[create_purchase]で実際の支払いを作成します。 実際のカスタマーや支払い情報はFirestoreに保存されます。そちらを参照してください。
 * - set_customer_default_payment
 *   - Set the default payment method for the buyer (customer) created by Stripe. Stripeで作成した購入者（カスタマー）に対してデフォルトの支払い方法を設定します。
 * - delete_payment
 *   - Delete a payment method already created. すでに作成された支払い方法を削除します。
 * - delete_customer
 *   - Delete a buyer (customer) already created. すでに作成された購入者（カスタマー）を削除します。
 *
 * - authorization
 *   - Before making a payment, the system performs a verification (authorization) to see if the card payment can be made. If payment is possible, [authorizedId] will be returned. If this is returned, complete the authorization with [confirm_authorization]. If it is not returned, payment cannot be made. 支払いを行う前にカード支払が可能かどうかを検証（オーソリ）を行います。支払いが可能な場合、[authorizedId]が返却されます。これが返却された場合[confirm_authorization]でオーソリを完了してください。返却されなかった場合、支払いはできません。
 * - confirm_authorization
 *   - Complete the authorization using the [authorizedId] returned by [authorization]. [authorization]で返却された[authorizedId]を利用してオーソリを完了します。
 *
 * - create_purchase
 *   - Create a payment. After this, use [authorization_purchase] to authenticate 3D Secure, [confirm_purchase] to confirm the payment, and [capture_purchase] to make the actual payment. 決済を作成します。この跡に[authorization_purchase]で3Dセキュアの認証を行い、[confirm_purchase]で決済の確定、[capture_purchase]で実際の支払いを行います。
 * - confirm_purchase
 *   - This is used to finalize the payment after the verification in the application is completed. This execution is mandatory. アプリ内の検証が完了したのち決済を確定させるために利用します。こちらの実行は必須です。
 * - capture_purchase
 *   - After the settlement is confirmed by [confirm_purchase], the actual payment process is executed. Once this is completed, the actual transfer of money occurs. [confirm_purchase]で決済確定後、実際に支払いを行う処理を実行します。これが完了した時点で実際の金銭の移動が発生します。
 * - refresh_purchase
 *   - Update payment method. 支払い方法を更新します。
 * - cancel_purchase
 *   - Cancel the payment. After executing [capture_purchase], please execute [refund_purchase] as it will be a refund process. 支払いをキャンセルします。[capture_purchase]実行後は返金処理となるので[refund_purchase]を実行してください。
 * - refund_purchase
 *   - Process refunds of applicable payments. 該当する支払いの返金処理を行います。
 *
 * - create_subscription
 *   - Subscribe to a new subscription. See Firestore for subscribed subscription data. 新しくサブスクリプションを購読します。 購読されたサブスクリプションのデータはFirestoreを参照してください。
 * - delete_subscription
 *   - Cancel and delete subscribed subscriptions. 購読済みのサブスクリプションをキャンセルして削除します。
 *
 * @param {double} amount
 * [required]
 * Enter the amount with a decimal point.
 * 金額を小数点付きで入力します。
 *
 * @param {int} count
 * [required]
 * Enter the number of pieces.
 * 個数を入力します。
 *
 * @param {string} userId
 * [required]
 * Specify the purchaser's user ID.
 * 購入者のユーザーIDを指定します。
 *
 * @param {string} orderId
 * [required]
 * Specify the order ID. This will be the database key.
 * 注文IDを指定します。これがデータベースのキーとなります。
 *
 * @param {string} productId
 * [required]
 * Specify the product ID.
 * 商品IDを指定します。
 *
 * @param {string} currency
 * [optional]
 * Enter the currency code (USD, JPY, etc.). If you do not enter a currency code, it will be set to JPY.
 * 通貨コードを入力します(USD、JPYなど)。入力しない場合はJPYとなります。
 *
 * @param {string} online
 * [optional]
 * You can select whether the card's 3D Secure authentication should be online (whether the user supports the browser itself) or offline (whether the user supports it by sending an email, etc.)." If set to "true", the card is online.
 * カードの3Dセキュア認証をオンライン（ユーザー自体がブラウザ対応するか）、オフライン（メール送信などで対応するか）を選択できます。"true"に設定されている場合はオンラインです。
 *
 * @param {double} revenueRatio
 * [optional]
 * Enter the rate of return for the operation. If not entered, it will be 0.
 * 運営の収益率を入力します。入力しない場合は0となります。
 *
 * @param {string} targetUserId
 * [optional]
 * If a seller exists, specify its user ID. If not specified, the management will be the seller.
 * 販売者が存在する場合そのユーザーIDを指定します。指定しない場合は運営が販売者となります。
 *
 * @param {string} description
 * [optional]
 * Enter a description of the product.
 * 商品の説明を入力します。
 *
 * @param {string} emailFrom
 * [optional]
 * If using a credit card that supports 3D Secure, specify the source e-mail address to which the authentication e-mail will be sent. The destination email address will be set to the registered Stripe account.
 * 3Dセキュア対応のクレジットカードを用いた場合、その認証用のメールを送信する際の送信元メールアドレスを指定します。送信先メールアドレスは登録されているStripeのアカウントが設定されます。
 *
 * @param {string} emailTitle
 * [optional]
 * Specify the title of the email to be sent for authentication when using a credit card that supports 3D Secure.
 * 3Dセキュア対応のクレジットカードを用いた場合、その認証用のメールを送信する際のメールタイトルを指定します。
 *
 * @param {string} emailContent
 * [optional]
 * Specify the body of the e-mail to be sent for authentication when using a credit card that supports 3D Secure.
 * 3Dセキュア対応のクレジットカードを用いた場合、その認証用のメールを送信する際のメール本文を指定します。{url}をリンククリック用URLに変換します。
 *
 * @param {string} locale
 * [optional]
 * Specify the purchaser's locale. Please specify like ja_JP.
 * 購入者のロケールを指定します。ja_JPのように指定してください。
 *
 * @param {string} successUrl
 * [required]
 * Specify the URL to redirect to upon success due to browser settings, etc.
 * ブラウザの設定等による成功時のリダイレクト先URLを指定します。
 *
 * @param {string} failureUrl
 * [required]
 * Specify the URL to redirect to upon failure due to browser settings, etc.
 * ブラウザの設定等による失敗時のリダイレクト先URLを指定します。
 *
 * @param {string} returnUrl
 * [required]
 * Specify the URL to redirect to after authentication.
 * 認証後のリダイレクト先URLを指定します。
 */
module.exports = (
  regions: string[],
  options: HttpFunctionsOptions,
  data: { [key: string]: any }
) => functions.https.onCall(
  {
    region: options.region ?? regions,
    timeoutSeconds: options.timeoutSeconds,
    memory: options.memory,
    minInstances: options.minInstances,
    concurrency: options.concurrency,
    maxInstances: options.maxInstances,
    serviceAccount: options?.serviceAccount ?? undefined,
    enforceAppCheck: options.enforceAppCheck ?? undefined,
    consumeAppCheckToken: options.consumeAppCheckToken ?? undefined,
  },
  async (query) => {
    try {
      let error: any | null = null;
      const firestoreDatabaseIds = options.firestoreDatabaseIds ?? [""];
      for (const databaseId of firestoreDatabaseIds) {
        try {
          const apiKey = process.env.PURCHASE_STRIPE_SECRETKEY ?? "";
          const stripeUserPath = process.env.PURCHASE_STRIPE_USERPATH ?? "plugins/stripe/user";
          const stripePurchasePath = process.env.PURCHASE_STRIPE_PURCHASEPATH ?? "purchase";
          const stripePaymentPath = process.env.PURCHASE_STRIPE_PAYMENTPATH ?? "payment";
          const stripeEmailProvider = process.env.PURCHASE_STRIPE_EMAILPROVIDER ?? "gmail";
          const firestoreInstance = firestoreLoader(databaseId);
          const stripeClient = new stripe.Stripe(apiKey, {
            apiVersion: "2025-02-24.acacia",
          });
          switch (query.data.mode) {
            case "create_account": {
              const userId = query.data.userId;
              const locale = query.data.locale;
              const refreshUrl = query.data.refreshUrl;
              const returnUrl = query.data.returnUrl;
              if (!locale) {
                throw new functions.https.HttpsError("invalid-argument", "The locale is empty.");
              }
              if (!userId) {
                throw new functions.https.HttpsError("invalid-argument", "The user id is empty.");
              }
              const country = locale.split("_")[1];
              const doc = await firestoreInstance.doc(`${stripeUserPath}/${userId}`).get();
              const data = doc.data();
              if (!data || !data["account"]) {
                const account = await stripeClient.accounts.create({
                  type: "express",
                  country: country ?? "JP",
                });
                const update: { [key: string]: any } = {};
                update["@uid"] = userId;
                update["@time"] = new Date();
                update["user"] = userId;
                update["account"] = account.id;
                await firestoreInstance.doc(`${stripeUserPath}/${userId}`).set(update, {
                  merge: true,
                });
                const endpoint = await stripeClient.accountLinks.create({
                  type: "account_onboarding",
                  account: account.id,
                  refresh_url: refreshUrl,
                  return_url: returnUrl,
                });
                return {
                  next: "registration",
                  endpoint: endpoint.url,
                  accountId: account.id,
                };
              } else {
                if (data["capability"] && data["capability"]["transfers"]) {
                  return {
                    next: "none",
                  };
                }
                const res = await stripeClient.accounts.retrieve(data["account"]);
                if (res["capabilities"] && res["capabilities"]["transfers"] === "active") {
                  const update: { [key: string]: any } = {};
                  update["capability"] = {
                    transfers: true,
                  };
                  await doc.ref.set(update, {
                    merge: true,
                  });
                  return {
                    next: "none",
                  };
                } else {
                  const endpoint = await stripeClient.accountLinks.create({
                    type: "account_onboarding",
                    account: data["account"],
                    refresh_url: refreshUrl,
                    return_url: returnUrl,
                  });
                  return {
                    next: "registration",
                    endpoint: endpoint.url,
                    accountId: data["account"],
                  };
                }
              }
            }
            case "delete_account": {
              const userId = query.data.userId;
              if (!userId) {
                throw new functions.https.HttpsError("invalid-argument", "The user id is empty.");
              }
              const doc = await firestoreInstance.doc(`${stripeUserPath}/${userId}`).get();
              const data = doc.data();
              if (!data || !data["account"]) {
                throw new functions.https.HttpsError("not-found", "Account id is not found.");
              }
              await stripeClient.accounts.del(data["account"]);
              const update: { [key: string]: any } = {};
              update["account"] = admin.firestore.FieldValue.delete();
              update["capability"] = admin.firestore.FieldValue.arrayRemove({
                "transfers": true
              });
              await doc.ref.set(update, {
                merge: true,
              });
              return {
                success: true,
              };
            }
            case "get_account": {
              const userId = query.data.userId;
              if (!userId) {
                throw new functions.https.HttpsError("invalid-argument", "The user id is empty.");
              }
              const doc = await firestoreInstance.doc(`${stripeUserPath}/${userId}`).get();
              const data = doc.data();
              if (!data || !data["account"]) {
                throw new functions.https.HttpsError("not-found", "Account id is not found.");
              }
              const res = await stripeClient.accounts.retrieve(data["account"]);
              return res;
            }
            case "dashboard_account": {
              const userId = query.data.userId;
              if (!userId) {
                throw new functions.https.HttpsError("invalid-argument", "The user id is empty.");
              }
              const doc = await firestoreInstance.doc(`${stripeUserPath}/${userId}`).get();
              const data = doc.data();
              if (!data || !data["account"]) {
                throw new functions.https.HttpsError("not-found", "Account id is not found.");
              }
              const res = await stripeClient.accounts.createLoginLink(data["account"]);
              return {
                endpoint: res["url"],
              };
            }
            case "create_customer_and_payment": {
              const userId = query.data.userId;
              const successUrl = query.data.successUrl;
              const cancelUrl = query.data.cancelUrl;
              const authInstance = admin.auth();
              if (!userId) {
                throw new functions.https.HttpsError("invalid-argument", "The user id is empty.");
              }
              const user = await authInstance.getUser(userId);
              if (!user) {
                throw new functions.https.HttpsError("not-found", "The user is not found.");
              }
              const doc = await firestoreInstance.doc(`${stripeUserPath}/${userId}`).get();
              const data = doc.data();
              if (!data || !data["customer"]) {
                const customer = await stripeClient.customers.create({
                  metadata: {
                    "user_id": userId,
                  },
                  email: user.email ?? (!data ? null : data["email"]),
                });
                const update: { [key: string]: any } = {};
                update["@uid"] = userId;
                update["@time"] = new Date();
                update["user"] = userId;
                update["customer"] = customer.id;
                await firestoreInstance.doc(`${stripeUserPath}/${userId}`).set(update, {
                  merge: true,
                });
                const session = await stripeClient.checkout.sessions.create({
                  payment_method_types: ["card"],
                  mode: "setup",
                  customer: customer.id,
                  success_url: successUrl,
                  cancel_url: cancelUrl,
                  metadata: {
                    "user_id": userId,
                  },
                });
                return {
                  endpoint: session.url,
                  customerId: customer.id,
                };
              } else {
                const session = await stripeClient.checkout.sessions.create({
                  payment_method_types: ["card"],
                  mode: "setup",
                  customer: data["customer"],
                  success_url: successUrl,
                  cancel_url: cancelUrl,
                });
                return {
                  endpoint: session.url,
                  customerId: data["customer"],
                };
              }
            }
            case "set_customer_default_payment": {
              const userId = query.data.userId;
              const paymentId = query.data.paymentId;
              if (!paymentId) {
                throw new functions.https.HttpsError("invalid-argument", "The payment id is empty.");
              }
              if (!userId) {
                throw new functions.https.HttpsError("invalid-argument", "The user id is empty.");
              }
              const doc = await firestoreInstance.doc(`${stripeUserPath}/${userId}`).get();
              const data = doc.data();
              if (!data || !data["customer"]) {
                throw new functions.https.HttpsError("not-found", "The customer is empty.");
              }
              const payment = await firestoreInstance.doc(`${stripeUserPath}/${userId}/${stripePaymentPath}/${paymentId}`).get();
              const paymentData = payment.data();
              if (!paymentData || !paymentData["id"]) {
                throw new functions.https.HttpsError("not-found", "The payment method is empty.");
              }
              await stripeClient.customers.update(
                data["customer"],
                {
                  invoice_settings: {
                    default_payment_method: paymentData["id"],
                  },
                }
              );
              if (data["defaultPayment"] !== paymentData["id"]) {
                const update: { [key: string]: any } = {};
                update["defaultPayment"] = paymentData["id"];
                await doc.ref.set(update, {
                  merge: true,
                });
              }
              return {
                success: true,
              };
            }
            case "delete_payment": {
              const userId = query.data.userId;
              const paymentId = query.data.paymentId;
              if (!paymentId) {
                throw new functions.https.HttpsError("invalid-argument", "The payment id is empty.");
              }
              if (!userId) {
                throw new functions.https.HttpsError("invalid-argument", "The user id is empty.");
              }
              const doc = await firestoreInstance.doc(`${stripeUserPath}/${userId}`).get();
              const data = doc.data();
              if (!data || !data["customer"]) {
                throw new functions.https.HttpsError("not-found", "The customer is empty.");
              }
              const payment = await firestoreInstance.doc(`${stripeUserPath}/${userId}/${stripePaymentPath}/${paymentId}`).get();
              const paymentData = payment.data();
              if (!paymentData || !paymentData["id"]) {
                throw new functions.https.HttpsError("not-found", "The payment method is empty.");
              }
              await stripeClient.paymentMethods.detach(
                paymentData["id"],
              );
              if (data["defaultPayment"] === paymentData["id"]) {
                const update: { [key: string]: any } = {};
                update["defaultPayment"] = admin.firestore.FieldValue.delete();
                await doc.ref.set(update, {
                  merge: true,
                });
              }
              return {
                success: true,
              };
            }
            case "delete_customer": {
              const userId = query.data.userId;
              if (!userId) {
                throw new functions.https.HttpsError("invalid-argument", "The user id is empty.");
              }
              const doc = await firestoreInstance.doc(`${stripeUserPath}/${userId}`).get();
              const data = doc.data();
              if (!data || !data["customer"]) {
                throw new functions.https.HttpsError("not-found", "Customer id is not found.");
              }
              await stripeClient.customers.del(data["customer"]);
              const update: { [key: string]: any } = {};
              update["customer"] = admin.firestore.FieldValue.delete();
              await doc.ref.set(update, {
                merge: true,
              });
              return {
                success: true,
              };
            }
            case "authorization": {
              const authInstance = admin.auth();
              const amount = parseFloat(query.data.amount);
              const currency = query.data.currency ?? "jpy";
              const returnUrl = query.data.returnUrl;
              const online = query.data.online == "true";
              const emailFrom = query.data.from;
              const emailTitle = query.data.title;
              const emailContent = query.data.content;
              const userId = query.data.userId;
              if (!userId) {
                throw new functions.https.HttpsError("invalid-argument", "The user id is empty.");
              }
              const userDoc = await firestoreInstance.doc(`${stripeUserPath}/${userId}`).get();
              const userData = userDoc.data();
              if (!userData || !userData["customer"]) {
                throw new functions.https.HttpsError("not-found", "The customer id is not found.");
              }
              let defaultPayment = userData["defaultPayment"];
              if (!defaultPayment) {
                const customer = await stripeClient.customers.retrieve(
                  userData["customer"],
                ) as stripe.Stripe.Customer;
                defaultPayment = customer.invoice_settings.default_payment_method;
                if (!defaultPayment) {
                  const payments = await firestoreInstance.collection(`${stripeUserPath}/${userId}/${stripePaymentPath}`).get();
                  if (payments.size <= 0) {
                    throw new functions.https.HttpsError("not-found", "The payment method is not found.");
                  }
                  defaultPayment = payments.docs[0].data()["id"];
                }
                const update: { [key: string]: any } = {};
                update["defaultPayment"] = defaultPayment;
                await userDoc.ref.set(update, {
                  merge: true,
                });
              }
              const user = await authInstance.getUser(userId);
              if (!user) {
                throw new functions.https.HttpsError("not-found", "The user is not found.");
              }
              let email = user.email;
              if (!email) {
                const paymentMethod = await stripeClient.paymentMethods.retrieve(
                  defaultPayment,
                );
                if (paymentMethod && paymentMethod["billing_details"] && paymentMethod["billing_details"]["email"]) {
                  email = paymentMethod["billing_details"]["email"];
                }
                if (!email) {
                  throw new functions.https.HttpsError("not-found", "The user's email is not found.");
                }
              }
              const paymentIntent = await stripeClient.paymentIntents.create({
                payment_method_types: ["card"],
                amount: amount,
                confirm: false,
                capture_method: "manual",
                payment_method: defaultPayment,
                description: "",
                customer: userData["customer"],
                receipt_email: email,
                currency: currency ?? "usd",
                setup_future_usage: "off_session",
              });
              if (!paymentIntent) {
                throw new functions.https.HttpsError("data-loss", "The payment is failed.");
              }
              const confirmedPaymentIntent = await stripeClient.paymentIntents.confirm(
                paymentIntent.id,
                {
                  return_url: returnUrl,
                }
              );
              const nextActionUrl = confirmedPaymentIntent.next_action?.redirect_to_url?.url ?? "";
              if (nextActionUrl && !online) {
                if (emailFrom && email && emailTitle && emailContent) {
                  switch (stripeEmailProvider) {
                    case "gmail": {
                      await gmail.send({
                        from: emailFrom,
                        to: email,
                        title: emailTitle,
                        content: emailContent.replace("{url}", nextActionUrl),
                      });
                      break;
                    }
                    case "sendgrid": {
                      await sendgrid.send({
                        from: emailFrom,
                        to: email,
                        title: emailTitle,
                        content: emailContent.replace("{url}", nextActionUrl),
                      });
                      break;
                    }
                  }
                } else {
                  throw new functions.https.HttpsError("unavailable", "3D Secure authentication is required, but the user is offline and no email settings have been configured.");
                }
              }
              return {
                url: online ? nextActionUrl : "",
                returnUrl: online ? confirmedPaymentIntent.next_action?.redirect_to_url?.return_url ?? "" : "",
                authorizedId: paymentIntent.id,
              };
            }
            case "confirm_authorization": {
              const authorizedId = query.data.authorizedId;
              if (!authorizedId) {
                throw new functions.https.HttpsError("invalid-argument", "The authorized id is empty.");
              }
              await stripeClient.paymentIntents.cancel(
                authorizedId,
              );
              return {
                success: true,
              };
            }
            case "create_purchase": {
              const authInstance = admin.auth();
              const amount = parseFloat(query.data.amount);
              const revenue = parseFloat(query.data.revenueRatio ?? 0);
              const currency = query.data.currency ?? "jpy";
              const userId = query.data.userId;
              const targetUserId = query.data.targetUserId;
              const orderId = query.data.orderId;
              const description = query.data.description;
              const emailFrom = query.data.emailFrom;
              const emailTitle = query.data.emailTitle;
              const emailContent = query.data.emailContent;
              const locale = query.data.locale;
              if (!orderId) {
                throw new functions.https.HttpsError("invalid-argument", "The order id is empty.");
              }
              if (!userId) {
                throw new functions.https.HttpsError("invalid-argument", "The user id is empty.");
              }
              const userDoc = await firestoreInstance.doc(`${stripeUserPath}/${userId}`).get();
              const userData = userDoc.data();
              if (!userData || !userData["customer"]) {
                throw new functions.https.HttpsError("not-found", "The customer id is not found.");
              }
              let defaultPayment = userData["defaultPayment"];
              if (!defaultPayment) {
                const customer = await stripeClient.customers.retrieve(
                  userData["customer"],
                ) as stripe.Stripe.Customer;
                defaultPayment = customer.invoice_settings.default_payment_method;
                if (!defaultPayment) {
                  const payments = await firestoreInstance.collection(`${stripeUserPath}/${userId}/${stripePaymentPath}`).get();
                  if (payments.size <= 0) {
                    throw new functions.https.HttpsError("not-found", "The payment method is not found.");
                  }
                  defaultPayment = payments.docs[0].data()["id"];
                }
                const update: { [key: string]: any } = {};
                update["defaultPayment"] = defaultPayment;
                await userDoc.ref.set(update, {
                  merge: true,
                });
              }
              const user = await authInstance.getUser(userId);
              if (!user) {
                throw new functions.https.HttpsError("not-found", "The user is not found.");
              }
              let email = user.email;
              if (!email) {
                const paymentMethod = await stripeClient.paymentMethods.retrieve(
                  defaultPayment,
                );
                if (paymentMethod && paymentMethod["billing_details"] && paymentMethod["billing_details"]["email"]) {
                  email = paymentMethod["billing_details"]["email"];
                }
                if (!email) {
                  throw new functions.https.HttpsError("not-found", "The user's email is not found.");
                }
              }
              if (targetUserId) {
                const targetDoc = await firestoreInstance.doc(`${stripeUserPath}/${targetUserId}`).get();
                const targetData = targetDoc.data();
                if (!targetData || !targetData["account"]) {
                  throw new functions.https.HttpsError("not-found", "The target data is not found.");
                }
                const paymentIntent = await stripeClient.paymentIntents.create({
                  payment_method_types: ["card"],
                  amount: amount,
                  confirm: false,
                  capture_method: "manual",
                  payment_method: defaultPayment,
                  description: description,
                  customer: userData["customer"],
                  metadata: {
                    "order_id": orderId,
                  },
                  receipt_email: email,
                  currency: currency,
                  setup_future_usage: "off_session",
                  application_fee_amount: amount * revenue,
                  transfer_data: {
                    destination: targetData["account"],
                  },
                });
                if (!paymentIntent) {
                  throw new functions.https.HttpsError("data-loss", "The payment is failed.");
                }
                const update: { [key: string]: any } = {};
                update["@uid"] = orderId;
                update["orderId"] = orderId;
                update["purchaseId"] = paymentIntent.id;
                update["paymentMethodId"] = defaultPayment;
                update["confirm"] = false;
                update["verify"] = false;
                update["capture"] = false;
                update["success"] = false;
                update["user"] = userId;
                update["target"] = targetUserId;
                update["nextAction"] = {
                  url: paymentIntent.next_action?.redirect_to_url?.url ?? "",
                  returnUrl: paymentIntent.next_action?.redirect_to_url?.return_url ?? "",
                };
                update["targetAccount"] = targetData["account"];
                update["customer"] = userData["customer"];
                update["amount"] = paymentIntent.amount;
                update["application"] = paymentIntent.application;
                update["applicationFeeAmount"] = paymentIntent.application_fee_amount;
                update["transferAmount"] = paymentIntent.transfer_data?.amount ?? 0;
                update["transferDistination"] = paymentIntent.transfer_data?.destination ?? "";
                update["currency"] = paymentIntent.currency;
                update["clientSecret"] = paymentIntent.client_secret;
                update["createdTime"] = new Date(paymentIntent.created * 1000);
                update["updatedTime"] = new Date();
                update["emailFrom"] = emailFrom;
                update["emailTo"] = email;
                update["emailTitle"] = emailTitle;
                update["emailContent"] = emailContent;
                update["locale"] = locale;
                await firestoreInstance.doc(`${stripeUserPath}/${userId}/${stripePurchasePath}/${orderId}`).set(update, {
                  merge: true,
                });
                return {
                  purchaseId: paymentIntent.id,
                };
              } else {
                const paymentIntent = await stripeClient.paymentIntents.create({
                  payment_method_types: ["card"],
                  amount: amount,
                  confirm: false,
                  capture_method: "manual",
                  payment_method: defaultPayment,
                  description: description,
                  customer: userData["customer"],
                  metadata: {
                    "order_id": orderId,
                  },
                  receipt_email: email,
                  currency: currency,
                  setup_future_usage: "off_session",
                });
                if (!paymentIntent) {
                  throw new functions.https.HttpsError("data-loss", "The payment is failed.");
                }
                const update: { [key: string]: any } = {};
                update["@uid"] = orderId;
                update["orderId"] = orderId;
                update["purchaseId"] = paymentIntent.id;
                update["paymentMethodId"] = defaultPayment;
                update["confirm"] = false;
                update["verify"] = false;
                update["capture"] = false;
                update["success"] = false;
                update["user"] = userId;
                update["nextAction"] = {
                  url: paymentIntent.next_action?.redirect_to_url?.url ?? "",
                  returnUrl: paymentIntent.next_action?.redirect_to_url?.return_url ?? "",
                };
                update["customer"] = userData["customer"];
                update["amount"] = paymentIntent.amount;
                update["application"] = paymentIntent.application;
                update["applicationFeeAmount"] = paymentIntent.application_fee_amount;
                update["transferAmount"] = paymentIntent.transfer_data?.amount ?? 0;
                update["transferDistination"] = paymentIntent.transfer_data?.destination ?? "";
                update["currency"] = paymentIntent.currency;
                update["clientSecret"] = paymentIntent.client_secret;
                update["createdTime"] = new Date(paymentIntent.created * 1000);
                update["updatedTime"] = new Date();
                update["emailFrom"] = emailFrom;
                update["emailTo"] = email;
                update["emailTitle"] = emailTitle;
                update["emailContent"] = emailContent;
                update["locale"] = locale;
                await firestoreInstance.doc(`${stripeUserPath}/${userId}/${stripePurchasePath}/${orderId}`).set(update, {
                  merge: true,
                });
                return {
                  purchaseId: paymentIntent.id,
                };
              }
            }
            case "confirm_purchase": {
              const userId = query.data.userId;
              const orderId = query.data.orderId;
              const successUrl = query.data.successUrl;
              const failureUrl = query.data.failureUrl;
              let returnUrl = query.data.returnUrl;
              const online = query.data.online == "true";
              if (!orderId) {
                throw new functions.https.HttpsError("invalid-argument", "The order id is empty.");
              }
              if (!userId) {
                throw new functions.https.HttpsError("invalid-argument", "The user id is empty.");
              }
              if (!online) {
                returnUrl = returnUrl + "?token=" + JSON.stringify({
                  userId: userId,
                  orderId: orderId,
                  successUrl: successUrl,
                  failureUrl: failureUrl,
                }).encrypt({
                  key: apiKey.slice(0, 32),
                  ivKey: apiKey.slice(-16),
                });
              }
              const doc = await firestoreInstance.doc(`${stripeUserPath}/${userId}/${stripePurchasePath}/${orderId}`).get();
              const data = doc.data();
              if (!data || !data["purchaseId"]) {
                throw new functions.https.HttpsError("not-found", "The purchase data is invalid.");
              }
              if (data["error"]) {
                throw new functions.https.HttpsError("aborted", "The purchase data has some errors");
              }
              if (data["cancel"]) {
                throw new functions.https.HttpsError("cancelled", "The purchase data is already canceled.");
              }
              if (data["confirm"]) {
                if (data["verify"]) {
                  throw new functions.https.HttpsError("ok", "The purchase data is already confirmed.");
                }
                try {
                  const paymentIntent = await stripeClient.paymentIntents.retrieve(
                    data["purchaseId"],
                  );
                  const nextActionUrl = paymentIntent.next_action?.redirect_to_url?.url ?? "";
                  const update: { [key: string]: any } = {};
                  if (nextActionUrl) {
                    if (!online) {
                      if (data["emailFrom"] && data["emailTo"] && data["emailTitle"] && data["emailContent"]) {
                        switch (stripeEmailProvider) {
                          case "gmail": {
                            await gmail.send({
                              from: data["emailFrom"],
                              to: data["emailTo"],
                              title: data["emailTitle"],
                              content: data["emailContent"].replace("{url}", nextActionUrl),
                            });
                            break;
                          }
                          case "sendgrid": {
                            await sendgrid.send({
                              from: data["emailFrom"],
                              to: data["emailTo"],
                              title: data["emailTitle"],
                              content: data["emailContent"].replace("{url}", nextActionUrl),
                            });
                            break;
                          }
                        }
                      } else {
                        update["error"] = true;
                        update["errorMessage"] = "3D Secure authentication is required, but the user is offline and no email settings have been configured.";
                      }
                    }
                    update["nextAction"] = {
                      url: nextActionUrl,
                      returnUrl: paymentIntent.next_action?.redirect_to_url?.return_url ?? "",
                    };
                    await doc.ref.set(update, {
                      merge: true,
                    });
                    return {
                      url: online ? nextActionUrl : "",
                      returnUrl: online ? paymentIntent.next_action?.redirect_to_url?.return_url ?? "" : "",
                      purchaseId: data["purchaseId"],
                    };
                  } else {
                    update["verify"] = true;
                    update["nextAction"] = admin.firestore.FieldValue.delete();
                    await doc.ref.set(update, {
                      merge: true,
                    });
                    return {
                      url: "",
                      returnUrl: "",
                      purchaseId: data["purchaseId"],
                    };
                  }
                } catch (err) {
                  const update: { [key: string]: any } = {};
                  update["error"] = true;
                  update["errorMessage"] = "The Purchase confirmation failed. Please replace the billing information and Refresh.";
                  await doc.ref.set(update, {
                    merge: true,
                  });
                  throw err;
                }
              } else {
                try {
                  const paymentIntent = await stripeClient.paymentIntents.confirm(
                    data["purchaseId"],
                    {
                      return_url: returnUrl,
                    }
                  );
                  const nextActionUrl = paymentIntent.next_action?.redirect_to_url?.url ?? "";
                  const update: { [key: string]: any } = {};
                  if (nextActionUrl && !online) {
                    if (data["emailFrom"] && data["emailTo"] && data["emailTitle"] && data["emailContent"]) {
                      switch (stripeEmailProvider) {
                        case "gmail": {
                          await gmail.send({
                            from: data["emailFrom"],
                            to: data["emailTo"],
                            title: data["emailTitle"],
                            content: data["emailContent"].replace("{url}", nextActionUrl),
                          });
                          break;
                        }
                        case "sendgrid": {
                          await sendgrid.send({
                            from: data["emailFrom"],
                            to: data["emailTo"],
                            title: data["emailTitle"],
                            content: data["emailContent"].replace("{url}", nextActionUrl),
                          });
                          break;
                        }
                      }
                    } else {
                      update["error"] = true;
                      update["errorMessage"] = "3D Secure authentication is required, but the user is offline and no email settings have been configured.";
                    }
                  }
                  update["nextAction"] = {
                    url: nextActionUrl,
                    returnUrl: paymentIntent.next_action?.redirect_to_url?.return_url ?? "",
                  };
                  await doc.ref.set(update, {
                    merge: true,
                  });
                  return {
                    url: online ? nextActionUrl : "",
                    returnUrl: online ? paymentIntent.next_action?.redirect_to_url?.return_url ?? "" : "",
                    purchaseId: data["purchaseId"],
                  };
                } catch (err) {
                  const update: { [key: string]: any } = {};
                  update["error"] = true;
                  update["errorMessage"] = "The Purchase confirmation failed. Please replace the billing information and Refresh.";
                  await doc.ref.set(update, {
                    merge: true,
                  });
                  throw err;
                }
              }
            }
            case "capture_purchase": {
              const userId = query.data.userId;
              const orderId = query.data.orderId;
              const amount = parseFloat(query.data.amount ?? 0.0);
              if (!orderId) {
                throw new functions.https.HttpsError("invalid-argument", "The order id is empty.");
              }
              if (!userId) {
                throw new functions.https.HttpsError("invalid-argument", "The user id is empty.");
              }
              const doc = await firestoreInstance.doc(`${stripeUserPath}/${userId}/${stripePurchasePath}/${orderId}`).get();
              const data = doc.data();
              if (!data || !data["purchaseId"]) {
                throw new functions.https.HttpsError("not-found", "The purchase data is invalid.");
              }
              if (data["error"]) {
                throw new functions.https.HttpsError("aborted", "The purchase data has some errors");
              }
              if (data["cancel"]) {
                throw new functions.https.HttpsError("cancelled", "This purchase data has already been cancelled.");
              }
              if (!data["confirm"] || !data["verify"]) {
                throw new functions.https.HttpsError("failed-precondition", "The purchase data is not confirmed.");
              }
              if (data["capture"]) {
                throw new functions.https.HttpsError("ok", "The purchase data is already captured.");
              }
              if (data["amount"] < amount) {
                throw new functions.https.HttpsError("invalid-argument", "You cannot capture an amount higher than the billing amount already saved.");
              }
              try {
                const paymentIntent = await (amount > 0 ? stripeClient.paymentIntents.capture(
                  data["purchaseId"],
                  {
                    amount_to_capture: amount,
                  }
                ) : stripeClient.paymentIntents.capture(
                  data["purchaseId"],
                ));
                if (paymentIntent.status !== "succeeded") {
                  throw new functions.https.HttpsError("aborted", "The Payment capture failed.");
                }
                return {
                  purchaseId: data["purchaseId"],
                };
              } catch (err) {
                const update: { [key: string]: any } = {};
                update["error"] = true;
                update["errorMessage"] = "The Purchase capture failed. Please replace the billing information and Refresh.";
                await doc.ref.set(update, {
                  merge: true,
                });
                throw err;
              }
            }
            case "refresh_purchase": {
              const orderId = query.data.orderId;
              const userId = query.data.userId;
              if (!orderId) {
                throw new functions.https.HttpsError("invalid-argument", "The order id is empty.");
              }
              if (!userId) {
                throw new functions.https.HttpsError("invalid-argument", "The user id is empty.");
              }
              const doc = await firestoreInstance.doc(`${stripeUserPath}/${userId}/${stripePurchasePath}/${orderId}`).get();
              const data = doc.data();
              if (!data || !data["purchaseId"]) {
                throw new functions.https.HttpsError("not-found", "The purchase data is invalid.");
              }
              if (data["success"]) {
                throw new functions.https.HttpsError("already-exists", "The payment has already been succeed.");
              }
              if (!data["error"]) {
                return {
                  success: true,
                };
              }
              const userDoc = await firestoreInstance.doc(`${stripeUserPath}/${userId}`).get();
              const userData = userDoc.data();
              if (!userData || !userData["customer"]) {
                throw new functions.https.HttpsError("not-found", "The customer id is not found.");
              }
              let defaultPayment = userData["defaultPayment"];
              if (!defaultPayment) {
                const customer = await stripeClient.customers.retrieve(
                  userData["customer"],
                ) as stripe.Stripe.Customer;
                defaultPayment = customer.invoice_settings.default_payment_method;
                if (!defaultPayment) {
                  const payments = await firestoreInstance.collection(`${stripeUserPath}/${userId}/${stripePaymentPath}`).get();
                  if (payments.size <= 0) {
                    throw new functions.https.HttpsError("not-found", "The payment method is not found.");
                  }
                  defaultPayment = payments.docs[0].data()["id"];
                }
                const update: { [key: string]: any } = {};
                update["defaultPayment"] = defaultPayment;
                await userDoc.ref.set(update, {
                  merge: true,
                });
              }
              if (defaultPayment === data["payment_method"]) {
                throw new functions.https.HttpsError("failed-precondition", "There was no change in the Payment method.");
              }
              await stripeClient.paymentIntents.update(
                data["purchaseId"],
                {
                  payment_method: defaultPayment,
                }
              );
              const update: { [key: string]: any } = {};
              update["paymentMethodId"] = defaultPayment;
              update["error"] = admin.firestore.FieldValue.delete();
              update["errorMessage"] = admin.firestore.FieldValue.delete();
              await doc.ref.set(update, {
                merge: true,
              });
              return {
                success: true,
              };
            }
            case "cancel_purchase": {
              const orderId = query.data.orderId;
              const userId = query.data.userId;
              if (!orderId) {
                throw new functions.https.HttpsError("invalid-argument", "The order id is empty.");
              }
              if (!userId) {
                throw new functions.https.HttpsError("invalid-argument", "The user id is empty.");
              }
              const doc = await firestoreInstance.doc(`${stripeUserPath}/${userId}/${stripePurchasePath}/${orderId}`).get();
              const data = doc.data();
              if (!data || !data["purchaseId"]) {
                throw new functions.https.HttpsError("not-found", "The purchase data is invalid.");
              }
              if (data["cancel"]) {
                throw new functions.https.HttpsError("ok", "The purchase data is already canceled.");
              }
              if (data["capture"] || data["success"]) {
                throw new functions.https.HttpsError("failed-precondition", "The payment has already been completed.");
              }
              await stripeClient.paymentIntents.cancel(
                data["purchaseId"],
              );
              const update: { [key: string]: any } = {};
              update["cancel"] = true;
              update["error"] = admin.firestore.FieldValue.delete();
              update["errorMessage"] = admin.firestore.FieldValue.delete();
              await doc.ref.set(update, {
                merge: true,
              });
              return {
                success: true,
              };
            }
            case "refund_purchase": {
              const orderId = query.data.orderId;
              const userId = query.data.userId;
              const amount = parseFloat(query.data.amount ?? 0.0);
              if (!orderId) {
                throw new functions.https.HttpsError("invalid-argument", "The order id is empty.");
              }
              if (!userId) {
                throw new functions.https.HttpsError("invalid-argument", "The user id is empty.");
              }
              const doc = await firestoreInstance.doc(`${stripeUserPath}/${userId}/${stripePurchasePath}/${orderId}`).get();
              const data = doc.data();
              if (!data || !data["purchaseId"]) {
                throw new functions.https.HttpsError("not-found", "The purchase data is invalid.");
              }
              if (!data["capture"] || !data["success"]) {
                throw new functions.https.HttpsError("failed-precondition", "The payment is not yet in your jurisdiction.");
              }
              if (data["amount"] < amount) {
                throw new functions.https.HttpsError("invalid-argument", "The amount to be refunded exceeds the original amount.");
              }
              try {
                if (amount > 0) {
                  await stripeClient.refunds.create({
                    payment_intent: data["purchaseId"],
                    amount: amount,
                  });
                } else {
                  await stripeClient.refunds.create({
                    payment_intent: data["purchaseId"],
                  });
                }
                const update: { [key: string]: any } = {};
                update["refund"] = true;
                update["cancel"] = true;
                await doc.ref.set(update, {
                  merge: true,
                });
                return {
                  success: true,
                };
              } catch (err) {
                const update: { [key: string]: any } = {};
                update["error"] = true;
                update["errorMessage"] = "The Purchase confirmation failed. Please replace the billing information and Refresh.";
                await doc.ref.set(update, {
                  merge: true,
                });
                throw err;
              }
            }
            case "create_subscription": {
              const productId = query.data.productId;
              const orderId = query.data.orderId;
              const userId = query.data.userId;
              const count = query.data.count ?? 1;
              const successUrl = query.data.successUrl;
              const cancelUrl = query.data.cancelUrl;
              if (!orderId) {
                throw new functions.https.HttpsError("invalid-argument", "The order id is empty.");
              }
              if (!userId) {
                throw new functions.https.HttpsError("invalid-argument", "The user id is empty.");
              }
              if (!productId) {
                throw new functions.https.HttpsError("invalid-argument", "The product id is empty.");
              }
              const res = await stripeClient.checkout.sessions.create({
                billing_address_collection: "auto",
                subscription_data: {
                  metadata: {
                    "userId": userId,
                    "orderId": orderId,
                  },
                },
                line_items: [
                  {
                    price: productId,
                    quantity: count,
                  },
                ],
                mode: "subscription",
                success_url: successUrl,
                cancel_url: cancelUrl,
              });
              return {
                endpoint: res["url"],
              };
            }
            case "delete_subscription": {
              const orderId = query.data.orderId;
              if (!orderId) {
                throw new functions.https.HttpsError("invalid-argument", "The order id is empty.");
              }
              const doc = await firestoreInstance.doc(`${stripePurchasePath}/${orderId}`).get();
              if (!doc.exists || !doc.get("subscription")) {
                throw new functions.https.HttpsError("not-found", "The orderId data is not found");
              }
              const res = await stripeClient.subscriptions.update(doc.get("subscription"), {
                cancel_at_period_end: true,
              });
              return {
                success: res["cancel_at_period_end"],
              };
            }
            default: {
              throw new functions.https.HttpsError("not-found", "There is no mode:" + query.data.mode);
            }
          }
        } catch (err) {
          error = err;
        }
      }
      if (error) {
        console.error(error);
        throw new functions.https.HttpsError("unknown", "Unknown error.");
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  },
);
