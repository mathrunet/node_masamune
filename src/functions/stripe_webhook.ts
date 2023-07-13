import * as functions from "firebase-functions";
import * as stripe from "stripe";
import * as admin from "firebase-admin";

/**
 * Receives and processes webhooks from Stripe.
 * Please register the URL when you deploy this in your Stripe webhook settings.
 * Firestore integration is a must; please make Firestore available as well.
 *
 * StripeからのWebhookを受け取り処理を行います。
 * こちらをデプロイした際のURLをStripeのWebhook設定に登録してください。
 * Firestoreとの連携が必須です。Firestoreも利用可能にしてください。
 *
 * @param {string} purchase.stripe.secret_key
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
 * @param {string} purchase.stripe.user_path
 * Stripe user (customer) pass.
 * Stripeのユーザー（カスタマー）用パス。
 *
 * @param {string} purchase.stripe.payment_path
 * Path for payment method information to be placed under [purchase.stripe.user_path].
 * [purchase.stripe.user_path]の下に配置する支払い方法の情報用パス。
 *
 * @param {string} purchase.stripe.purchase_path
 * Path for purchase information to be placed under [purchase.stripe.user_path].
 * [purchase.stripe.user_path]の下に配置する購入情報用パス。
 *
 * @param {string} purchase.stripe.webhook_secret
 * Specify the **Signature Secret** after setting it up as a webhook.
 * Webhookとして設定したあとの**署名シークレット**を指定します。
 *
 */
module.exports = (regions: string[], data: { [key: string]: string }) => functions.region(...regions).https.onRequest(
  async (req, res) => {
    try {
      const config = functions.config().purchase;
      const stripeConfig = config.stripe;
      const apiKey = stripeConfig.secret_key;
      const stripeUserPath = stripeConfig.user_path;
      const stripePurchasePath = stripeConfig.purchase_path;
      const stripeWebhookSecret = stripeConfig.webhook_secret;
      const firestoreInstance = admin.firestore();
      const stripeClient = new stripe.Stripe(apiKey, {
        apiVersion: "2022-11-15",
      });
      const signature = req.headers["stripe-signature"];
      if (!signature) {
        res.status(403).send(JSON.stringify({
          "error": "Access denied.",
        }));
        return;
      }
      const event = stripeClient.webhooks.constructEvent(req.rawBody, signature, stripeWebhookSecret);

      switch (event.type) {
      case "payment_intent.requires_action":
      case "payment_intent.amount_capturable_updated": {
        const payment = event.data.object as {
                        [key: string]: any
                    };
        const purchaseId = payment["id"];
        const customerId = payment["customer"];
        const status = payment["status"];
        if (!customerId) {
          res.status(404).send(JSON.stringify({
            "error": "The customer id is not found.",
          }));
          return;
        }
        if (!status) {
          res.status(404).send(JSON.stringify({
            "error": "The status is not found.",
          }));
          return;
        }
        const userCol = await firestoreInstance.collection(`${stripeUserPath}`).where("customer", "==", customerId).get();
        if (userCol.empty) {
          res.status(404).send(JSON.stringify({
            "error": "The account data is not found.",
          }));
          return;
        }
        const user = userCol.docs[0];
        const userId = user.id;
        const purchaseCol = await firestoreInstance.collection(`${stripeUserPath}/${userId}/${stripePurchasePath}`).where("purchaseId", "==", purchaseId).get();
        if (purchaseCol.empty) {
          res.status(404).send(JSON.stringify({
            "error": "The purchase data is not found.",
          }));
          return;
        }
        const purchase = purchaseCol.docs[0];
        const update: { [key: string]: any } = {};
        switch (status) {
        case "requires_payment_method":
        case "requires_confirmation": {
          update["confirm"] = false;
          update["verify"] = false;
          update["capture"] = false;
          update["success"] = false;
          break;
        }
        case "requires_action": {
          update["confirm"] = true;
          update["verify"] = false;
          update["capture"] = false;
          update["success"] = false;
          break;
        }
        case "requires_capture": {
          update["confirm"] = true;
          update["verify"] = true;
          update["capture"] = false;
          update["success"] = false;
          break;
        }
        }
        update["updatedTime"] = new Date();
        await purchase.ref.set(update, {
          merge: true,
        });

        res.status(200).send(JSON.stringify({
          "success": true,
        }));
        return;
      }
      case "payment_intent.succeeded": {
        const payment = event.data.object as {
                        [key: string]: any
                    };
        const purchaseId = payment["id"];
        const customerId = payment["customer"];
        if (!customerId) {
          res.status(404).send(JSON.stringify({
            "error": "The customer id is not found.",
          }));
          return;
        }
        const userCol = await firestoreInstance.collection(`${stripeUserPath}`).where("customer", "==", customerId).get();
        if (userCol.empty) {
          res.status(404).send(JSON.stringify({
            "error": "The account data is not found.",
          }));
          return;
        }
        const user = userCol.docs[0];
        const userId = user.id;
        const purchaseCol = await firestoreInstance.collection(`${stripeUserPath}/${userId}/${stripePurchasePath}`).where("purchaseId", "==", purchaseId).get();
        if (purchaseCol.empty) {
          res.status(404).send(JSON.stringify({
            "error": "The purchase data is not found.",
          }));
          return;
        }
        const purchase = purchaseCol.docs[0];
        const update: { [key: string]: any } = {};
        update["confirm"] = true;
        update["verify"] = true;
        update["capture"] = true;
        update["success"] = true;
        update["error"] = admin.firestore.FieldValue.delete();
        update["errorMessage"] = admin.firestore.FieldValue.delete();
        update["updatedTime"] = new Date();

        if (payment["charges"] && payment["charges"]["data"] && payment["charges"]["data"].length > 0 && payment["charges"]["data"][0]) {
          if (payment["charges"]["data"][0]["receipt_url"]) {
            update["receiptUrl"] = payment["charges"]["data"][0]["receipt_url"];
          }
          if (payment["charges"]["data"][0]["amount_captured"]) {
            update["capturedAmount"] = payment["charges"]["data"][0]["amount_captured"];
          }
        }
        await purchase.ref.set(update, {
          merge: true,
        });

        res.status(200).send(JSON.stringify({
          "success": true,
        }));
        return;
      }
      case "payment_intent.payment_failed": {
        const payment = event.data.object as {
                        [key: string]: any
                    };
        const purchaseId = payment["id"];
        const customerId = payment["customer"];
        const status = payment["status"];
        if (!customerId) {
          res.status(404).send(JSON.stringify({
            "error": "The customer id is not found.",
          }));
          return;
        }
        const userCol = await firestoreInstance.collection(`${stripeUserPath}`).where("customer", "==", customerId).get();
        if (userCol.empty) {
          res.status(404).send(JSON.stringify({
            "error": "The account data is not found.",
          }));
          return;
        }
        const user = userCol.docs[0];
        const userId = user.id;
        const purchaseCol = await firestoreInstance.collection(`${stripeUserPath}/${userId}/${stripePurchasePath}`).where("purchaseId", "==", purchaseId).get();
        if (purchaseCol.empty) {
          res.status(404).send(JSON.stringify({
            "error": "The purchase data is not found.",
          }));
          return;
        }
        const errorMessage = payment["last_payment_error"]["message"];
        const purchase = purchaseCol.docs[0];
        const update: { [key: string]: any } = {};
        switch (status) {
        case "requires_payment_method":
        case "requires_confirmation": {
          update["confirm"] = false;
          update["verify"] = false;
          update["capture"] = false;
          update["success"] = false;
          break;
        }
        case "requires_action": {
          update["confirm"] = true;
          update["verify"] = false;
          update["capture"] = false;
          update["success"] = false;
          break;
        }
        case "requires_capture": {
          update["confirm"] = true;
          update["verify"] = true;
          update["capture"] = false;
          update["success"] = false;
          break;
        }
        }
        update["updatedTime"] = new Date();
        update["error"] = true;
        update["errorMessage"] = errorMessage;
        await purchase.ref.set(update, {
          merge: true,
        });

        res.status(200).send(JSON.stringify({
          "success": true,
        }));
        return;
      }
      case "payment_method.detached":
      case "payment_method.updated": {
        const payment = event.data.object as {
                        [key: string]: any
                    };
        const previous = event.data.previous_attributes as {
                        [key: string]: any
                    };
        let customerId = payment["customer"];
        if (!customerId) {
          customerId = previous["customer"];
        }
        if (!customerId) {
          res.status(404).send(JSON.stringify({
            "error": "The customer id is not found.",
          }));
          return;
        }
        const col = await firestoreInstance.collection(`${stripeUserPath}`).where("customer", "==", customerId).get();
        if (col.empty) {
          res.status(404).send(JSON.stringify({
            "error": "The account data is not found.",
          }));
          return;
        }
        const user = col.docs[0];
        const userId = user.id;
        await syncStripePayment(
          stripeClient,
          firestoreInstance,
          userId,
          customerId,
        );

        res.status(200).send(JSON.stringify({
          "success": true,
        }));
        return;
      }
      case "customer.updated": {
        const customer = event.data.object as {
                        [key: string]: any
                    };
        const customerId = customer["id"];
        if (!customerId) {
          res.status(404).send(JSON.stringify({
            "error": "The customer id is not found.",
          }));
          return;
        }
        const col = await firestoreInstance.collection(`${stripeUserPath}`).where("customer", "==", customerId).get();
        if (col.empty) {
          res.status(404).send(JSON.stringify({
            "error": "The account data is not found.",
          }));
          return;
        }
        const user = col.docs[0];
        const userId = user.id;
        await syncStripePayment(
          stripeClient,
          firestoreInstance,
          userId,
          customerId,
        );

        res.status(200).send(JSON.stringify({
          "success": true,
        }));
        return;
      }
      case "checkout.session.completed": {
        const session = event.data.object as {
                        [key: string]: any
                    };
        const customerId = session["customer"];
        if (!customerId) {
          res.status(404).send(JSON.stringify({
            "error": "The customer id is not found.",
          }));
          return;
        }
        const setupIntent = session["setup_intent"];
        if (!setupIntent) {
          res.status(404).send(JSON.stringify({
            "error": "The setup intent is not found.",
          }));
          return;
        }
        const col = await firestoreInstance.collection(`${stripeUserPath}`).where("customer", "==", customerId).get();
        if (col.empty) {
          res.status(404).send(JSON.stringify({
            "error": "The account data is not found.",
          }));
          return;
        }
        const user = col.docs[0];
        const userId = user.id;
        const update: { [key: string]: any } = {};
        if (session["setup_intent"]) {
          update["setupIntent"] = session["setup_intent"];
        }
        await user.ref.set(update, {
          merge: true,
        });

        await syncStripePayment(
          stripeClient,
          firestoreInstance,
          userId,
          customerId,
        );

        res.status(200).send(JSON.stringify({
          "success": true,
        }));
        return;
      }
      case "customer.subscription.trial_will_end":
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const now = new Date();
        const update: { [key: string]: any } = {};
        const subscription = event.data.object as {
                        [key: string]: any
                    };
        const status = subscription["status"];
        if (status != "active") {
          res.status(200).send(JSON.stringify({
            "success": "Subscription is not active.",
          }));
          return;
        }
        const endDate = new Date(subscription["current_period_end"] as number * 1000);
        const id = subscription["id"];
        const userId = subscription.metadata.userId as string;
        const orderId = subscription.metadata.orderId as string ?? id;
        const targetPath = `${stripePurchasePath}/${orderId}`;
        const plan = subscription.plan as {
                        [key: string]: any
                    };

        let doc: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
        const subscriptionCol = await firestoreInstance.collection(`${stripePurchasePath}`).where("subscription", "==", id).get();
        if (subscriptionCol.empty) {
          doc = await firestoreInstance.doc(targetPath);
        } else {
          doc = subscriptionCol.docs[0].ref;
        }
        update["expired"] = now >= endDate;
        if (userId) {
          update["user"] = userId;
        }
        update["@uid"] = orderId;
        update["@time"] = new Date();
        update["subscription"] = id;
        update["application"] = subscription["application"];
        update["application_fee_percent"] = subscription["application_fee_percent"];
        update["cancel_at"] = subscription["cancel_at"];
        update["cancel_at_period_end"] = subscription["cancel_at_period_end"];
        update["canceled_at"] = subscription["canceled_at"];
        update["collection_method"] = subscription["collection_method"];
        update["currency"] = subscription["currency"];
        update["current_period_start"] = subscription["current_period_start"];
        update["current_period_end"] = subscription["current_period_end"];
        update["customer"] = subscription["customer"];
        update["default_payment_method"] = subscription["default_payment_method"];
        update["ended_at"] = subscription["ended_at"];
        update["latest_invoice"] = subscription["latest_invoice"];
        update["price_id"] = plan["id"];
        update["active"] = plan["active"];
        update["amount"] = plan["amount"];
        update["billing_scheme"] = plan["billing_scheme"];
        update["interval"] = plan["interval"];
        update["interval_count"] = plan["interval_count"];
        update["usage_type"] = plan["usage_type"];
        update["quantity"] = subscription["quantity"];
        update["start_date"] = subscription["start_date"];
        update["start_date"] = subscription["start_date"];
        console.log(`Subscription status is ${status} ${stripePurchasePath}.`);
        await doc.set(update, {
          merge: true,
        });
        res.status(200).send(JSON.stringify({
          "success": "Subscription is active.",
        }));
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as {
                        [key: string]: any
                    };
        const status = subscription["status"];
        console.log(`Subscription status is ${status} ${"expired"}.`);
        // Then define and call a method to handle the subscription deleted.
        // handleSubscriptionDeleted(subscriptionDeleted);
        break;
      }
      default: {
        res.status(404).send(JSON.stringify({
          "error": "Event is not found.",
        }));
        return;
      }
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  }
);

/**
 * Synchronize Stripe acquisition results to Firestore.
 *
 * Stripeの取得結果をFirestoreに同期します。
 *
 * @param {stripe.Stripe} stripeClient
 * Stripe client instances.
 * ストライプのクライアントインスタンス。
 *
 * @param {FirebaseFirestore.Firestore} firestoreInstance
 * Firestore client instances.
 * Firestoreのクライアントインスタンス。
 *
 * @param {string} userId
 * User ID.
 * ユーザーID。
 *
 * @param {string} customerId
 * Customer ID.
 * 顧客ID。
 *
 * @returns {Promise<void>}
 *
 */
async function syncStripePayment(stripeClient : stripe.Stripe, firestoreInstance : FirebaseFirestore.Firestore, userId : string, customerId : string) {
  const config = functions.config().purchase;
  const stripeConfig = config.stripe;
  const stripeUserPath = stripeConfig.user_path;
  const stripePaymentPath = stripeConfig.payment_path;

  const customer = await stripeClient.customers.retrieve(
    customerId,
  ) as stripe.Stripe.Customer;
  let defaultSource = customer.invoice_settings.default_payment_method;
  const paymentMethods = await stripeClient.customers.listPaymentMethods(
    customerId,
    {
      type: "card",
    },
  );

  if (!defaultSource && paymentMethods.data.length > 0) {
    defaultSource = paymentMethods.data[0].id;

    await stripeClient.customers.update(
      customerId,
      {
        invoice_settings: {
          default_payment_method: defaultSource,
        },
      }
    );
  }

  const payments = await firestoreInstance.collection(`${stripeUserPath}/${userId}/${stripePaymentPath}`).get();

  await firestoreInstance.runTransaction(
    async (transaction) => {
      payments.docs.forEach((doc) => {
        const data = doc.data();
        const method = paymentMethods.data.find((m) => m.id == data["id"]);
        if (!method) {
          transaction.delete(doc.ref);
        } else {
          const card = method.card;
          if (!card) {
            return;
          }
          const update: { [key: string]: any } = {};
          const isDefault = method.id == defaultSource;
          if (method.type === data["type"] && card.exp_month === data["expMonth"] && card.exp_year === data["expYear"] && card.brand === data["brand"] && card.last4 === data["numberLast"] && card.last4 === data["numberLast"] && isDefault === data["default"]) {
            return;
          }
          update["type"] = method.type;
          update["expMonth"] = card.exp_month;
          update["expYear"] = card.exp_year;
          update["brand"] = card.brand;
          update["numberLast"] = card.last4;
          update["default"] = isDefault;
          transaction.set(doc.ref, update, {
            merge: true,
          });
        }
      });
      paymentMethods.data.forEach(async (method) => {
        const card = method.card;
        if (!card) {
          return;
        }
        const doc = payments.docs.find((item) => item.data()["id"] == method.id);
        if (doc) {
          return;
        }
        const uid = method.id;
        const update: { [key: string]: any } = {};
        const isDefault = method.id == defaultSource;
        update["@uid"] = uid;
        update["@time"] = new Date();
        update["id"] = uid;
        update["type"] = method.type;
        update["expMonth"] = card.exp_month;
        update["expYear"] = card.exp_year;
        update["brand"] = card.brand;
        update["numberLast"] = card.last4;
        update["default"] = isDefault;
        transaction.set(firestoreInstance.doc(`${stripeUserPath}/${userId}/${stripePaymentPath}/${uid}`), update, {
          merge: true,
        });
      });

      const update: { [key: string]: any } = {};
      if (defaultSource) {
        update["defaultPayment"] = defaultSource;
      } else {
        update["defaultPayment"] = admin.firestore.FieldValue.delete();
      }
      await transaction.set(firestoreInstance.doc(`${stripeUserPath}/${userId}`), update, {
        merge: true,
      });
    });
}
