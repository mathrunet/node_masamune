
import { WorkersOptions } from "../lib/src/workers_base";
import { Hono } from "hono";

/**
 * Endpoints for testing.
 * 
 * テストを行うためのエンドポイントです。
 */
module.exports = (
  hono: Hono,
  options: WorkersOptions,
  data: { [key: string]: any }
) => {
  hono.get("/", async (c) => {
    return c.json({ message: "Hello, World!" });
  });
  return hono;
};
