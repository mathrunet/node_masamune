import { spawnSync } from "node:child_process";

test("Worker条件のpackage入口はExpressを読み込まず、公開Functionsとdeployを提供する", () => {
  const result = spawnSync(process.execPath, ["--conditions=workerd", "-e", `
    const core = require('@mathrunet/masamune_cloudflare');
    const tidb = require('@mathrunet/masamune_cloudflare_tidb');
    console.log(JSON.stringify({
      core: require.resolve('@mathrunet/masamune_cloudflare'),
      tidb: require.resolve('@mathrunet/masamune_cloudflare_tidb'),
      deploy: typeof core.deploy,
      functions: typeof tidb.Functions.tidb,
      express: Object.keys(require.cache).some(p => p.includes('/express/')),
    }));
  `], { encoding: "utf8" });
  expect(result.status).toBe(0);
  const value = JSON.parse(result.stdout);
  expect(value.core).toMatch(/dist\/worker\.js$/);
  expect(value.tidb).toMatch(/dist\/worker\.js$/);
  expect(value).toEqual(expect.objectContaining({ deploy: "function", functions: "function", express: false }));
});
