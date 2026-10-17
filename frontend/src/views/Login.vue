<script setup lang="ts">
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
    await session.login(username.value, password.value);
    showToast(register.value ? "注册成功" : "欢迎回来");
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
    <div class="brand-line">
      <span class="brand-mark"
        ><van-icon aria-hidden="true" name="flower-o" /></span
      ><span>轮到</span><small>DORM DUTY</small>
    </div>
    <h1>宿舍管理</h1>
    <p class="intro">登录后创建或加入宿舍，管理排班与值日内容。</p>
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
    <p class="login-foot">
      共享空间，共同照顾。<br />首次登录后，可以创建宿舍或用邀请码加入。
    </p>
  </main>
</template>
