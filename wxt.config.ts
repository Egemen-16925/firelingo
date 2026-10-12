import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  // WXT, Firefox'u varsayılan olarak MV2 derler; MV3 açıkça istenir.
  manifestVersion: 3,
  manifest: {
    name: "Firelingo",
    action: { default_title: "Firelingo" },
  },
});
