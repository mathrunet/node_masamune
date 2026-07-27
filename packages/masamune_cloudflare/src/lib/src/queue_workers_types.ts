/**
 * Options used when retrying a Cloudflare Queues message.
 */
export interface WorkersQueueRetryOptions {
    delaySeconds?: number;
}

/**
 * A message delivered by Cloudflare Queues.
 */
export interface WorkersQueueMessage<Body = unknown> {
    readonly id: string;
    readonly timestamp: Date;
    readonly body: Body;
    readonly attempts: number;
    ack(): void;
    retry(options?: WorkersQueueRetryOptions): void;
}

/**
 * A batch delivered to a Cloudflare Queues consumer.
 */
export interface WorkersQueueMessageBatch<Body = unknown> {
    readonly queue: string;
    readonly messages: readonly WorkersQueueMessage<Body>[];
    ackAll(): void;
    retryAll(options?: WorkersQueueRetryOptions): void;
}

/**
 * The execution context passed to a Cloudflare Queues consumer.
 */
export interface WorkersQueueExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
}
