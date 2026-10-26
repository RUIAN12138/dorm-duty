import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { Icon } from "vant";
import "vant/es/icon/style/index.mjs";
import "../theme.css";
import "../style.css";
import "../focus.css";
import { installMotionTokens } from "../interaction/motion";
import { installTheme } from "../interaction/theme";
import App from "./OpticsPreview.vue";
installMotionTokens();
installTheme();
createApp(App)
  .use(Icon)
  .use(
    createRouter({
      history: createWebHistory(),
      routes: [
        { path: "/:pathMatch(.*)*", component: { template: "<div />" } },
      ],
    }),
  )
  .mount("#app");
