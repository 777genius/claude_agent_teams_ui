import "vuetify/styles";
import { createVuetify } from "vuetify";
import { aliases, mdi } from "vuetify/iconsets/mdi-svg";

const brand = {
  cyan: "#00f0ff",
  magenta: "#ff00ff",
  lightBackground: "#f0f2f5",
  lightSurface: "#ffffff",
  darkBackground: "#0a0a0f",
  darkSurface: "#12121a"
};

export default defineNuxtPlugin({
  name: "vuetify",
  setup(nuxtApp) {
    const vuetify = createVuetify({
      icons: {
        defaultSet: "mdi",
        aliases,
        sets: { mdi }
      },
      theme: {
        defaultTheme: "dark",
        themes: {
          light: {
            colors: {
              primary: brand.cyan,
              secondary: brand.magenta,
              background: brand.lightBackground,
              surface: brand.lightSurface
            }
          },
          dark: {
            colors: {
              primary: brand.cyan,
              secondary: brand.magenta,
              background: brand.darkBackground,
              surface: brand.darkSurface
            }
          }
        }
      }
    });

    nuxtApp.vueApp.use(vuetify);
    nuxtApp.provide("vuetifyTheme", vuetify.theme);
  }
});
