<script setup lang="ts">
import CompanionLogin from "../components/CompanionLogin.vue";
import { captureCompanionHandoff } from "../interaction/companion";
import { ref, onMounted } from "vue";
import { emailAccount, refreshEmailAccount } from "../api/email";
import { useRouter, useRoute } from "vue-router";
import { showToast } from "vant";
import { post } from "../api";
import { useSession } from "../stores/session";
const register = ref(false),
  busy = ref(false),
  username = ref(""),
  password = ref(""),
  nickname = ref(""),
  error = ref("");
const session = useSession(),
  router = useRouter(),
  route = useRoute();
onMounted(async () => {
  try {
    await refreshEmailAccount();
    if (emailAccount.required) await router.replace("/");
  } catch {
    error.value = "暂时无法确认登录方式，请重试或返回邮箱入口。";
  }
});
async function submit() {
  busy.value = true;
  error.value = "";
  try {
    await refreshEmailAccount();
    if (emailAccount.required) {
      await router.replace("/");
      return;
    }
    if (register.value) {
      await post("/auth/register", {
        username: username.value,
        password: password.value,
        nickname: nickname.value,
      });
      register.value = false;
      showToast("请使用账号密码登录；已有账号请使用原密码。");
    }
    if (!(await session.login(username.value, password.value))) return;
    showToast(register.value ? "注册成功" : "欢迎回来");
    captureCompanionHandoff();
    const next = String(route.query.next || "/dorm");
    await router.replace(
      next.startsWith("/") &&
        !next.startsWith("//") &&
        !next.startsWith("/login") &&
        !next.startsWith("/admin/login")
        ? next
        : "/dorm",
    );
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <main class="login-page">
    <router-link to="/" class="admin-back">← 返回今日任务</router-link>
    <CompanionLogin />
    <div class="brand-line">
      <span class="brand-mark"
        ><van-icon aria-hidden="true" name="flower-o" /></span
      ><span>轮到</span><small>DORM DUTY</small>
    </div>
    <h1>轮到</h1>

    <div class="login-tabs">
      <button
        :class="{ active: !register }"
        @click="
          register = false;
          error = '';
        "
      >
        登录</button
      ><button
        :class="{ active: register }"
        @click="
          register = true;
          error = '';
        "
      >
        注册账号
      </button>
    </div>
    <van-form @submit="submit">
      <van-cell-group inset class="form-panel">
        <van-field
          v-model="username"
          label="账号"
          name="username"
          placeholder="3–32 位字母、数字或下划线"
          autocomplete="username"
          :rules="[
            {
              pattern: /^[A-Za-z0-9_]{3,32}$/,
              message: '请输入 3–32 位字母、数字或下划线',
            },
          ]"
        />
        <van-field
          v-if="register"
          v-model="nickname"
          label="昵称"
          name="nickname"
          placeholder="室友怎么称呼你"
          maxlength="32"
          :rules="[{ required: true, message: '请输入昵称' }]"
        />
        <van-field
          v-model="password"
          label="密码"
          name="password"
          type="password"
          placeholder="至少 8 位"
          :autocomplete="register ? 'new-password' : 'current-password'"
          :rules="[
            {
              validator: (v: string) => v.length >= 8 && v.length <= 128,
              message: '密码需要 8–128 位',
            },
          ]"
        />
      </van-cell-group>
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      <van-button block type="primary" native-type="submit" :loading="busy"
        >{{ register ? "注册并进入管理" : "登录管理账号"
        }}<van-icon aria-hidden="true" name="arrow"
      /></van-button>
    </van-form>
  </main>
</template>

<style scoped>
.login-page :deep(.brand-line) {
  display: none;
}
.login-page h1 {
  font-size: 26px;
  text-align: center;
}
.login-page .intro {
  text-align: center;
  font-size: 13px;
}
.login-page {
  padding-top: 24px;
}
</style>

<style scoped>
.login-page {
  padding-top: 12px;
}
.login-page :deep(.companion-login) {
  height: 150px;
}
.login-page :deep(.companion-frame),
.login-page :deep(.dorm-companion) {
  width: 100px !important;
  height: 100px !important;
}
.login-page :deep(.van-cell-group) {
  border-radius: 26px;
  overflow: hidden;
}
.login-page :deep(.van-field) {
  background: var(--ui-surface-muted);
}
.login-page :deep(.van-button) {
  border-radius: 28px;
}
</style>
