import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  // WXT, Firefox'u varsayılan olarak MV2 derler; MV3 açıkça istenir.
  manifestVersion: 3,
  manifest: {
    name: "Firelingo",
    permissions: ["storage", "activeTab"],
    // Kullanıcı kendi temel adresini girebildiği için geniş; her adres ayarlar sayfasında ayrı ayrı istenir.
    optional_host_permissions: ["*://*/*"],
    icons: { 48: "icon/on.svg", 96: "icon/on.svg" },
    // Varsayılan durum kapalı: gri ikon.
    action: { default_title: "Firelingo", default_icon: "icon/off.svg" },
    commands: {
      "toggle-pen": { suggested_key: { default: "Alt+Shift+H" }, description: "Fosforlu kalemi aç/kapat" },
    },
    browser_specific_settings: { gecko: { id: "firelingo@egemen-16925.github.io" } },
  },
});
