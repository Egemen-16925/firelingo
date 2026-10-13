import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

// WxtVitest: "@/" yollarını çözer ve testlerde `browser` API'sini bellek içi bir taklitle sağlar.
export default defineConfig({
  plugins: [WxtVitest()],
});
