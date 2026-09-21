/** Node互換の公開入口。Worker向け入口はpackage.jsonのconditional exportsで分離する。 */
export * from "@mathrunet/masamune";
export * from "./worker";
