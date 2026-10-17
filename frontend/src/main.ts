import { createApp } from "vue";
import { createPinia } from "pinia";
import {
  Badge,
  Button,
  Cell,
  CellGroup,
  Checkbox,
  Field,
  Form,
  Icon,
  Loading,
  Switch,
} from "vant";
import "vant/es/badge/style/index.mjs";
import "vant/es/button/style/index.mjs";
import "vant/es/cell/style/index.mjs";
import "vant/es/cell-group/style/index.mjs";
import "vant/es/checkbox/style/index.mjs";
import "vant/es/field/style/index.mjs";
import "vant/es/form/style/index.mjs";
import "vant/es/icon/style/index.mjs";
import "vant/es/loading/style/index.mjs";
import "vant/es/switch/style/index.mjs";
import "vant/es/dialog/style/index.mjs";
import "vant/es/toast/style/index.mjs";
import "./style.css";
import "./focus.css";
import App from "./App.vue";
import { tilt } from "./interactions/tilt";
import { router } from "./router";
import { installMotionTokens } from "./interaction/motion";
installMotionTokens();
createApp(App)
  .use(createPinia())
  .use(router)
  .use(Badge)
  .use(Button)
  .use(Cell)
  .use(CellGroup)
  .use(Checkbox)
  .use(Field)
  .use(Form)
  .use(Icon)
  .use(Loading)
  .use(Switch)
  .directive("tilt", tilt)
  .mount("#app");
