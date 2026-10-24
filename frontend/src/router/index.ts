import { createRouter, createWebHistory } from "vue-router";
import { useSession } from "../stores/session";
import { emailAccount, refreshEmailAccount } from "../api/email";
export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior() {
    return { top: 0, left: 0 };
  },
  routes: [
    { path: "/login", redirect: "/" },
    {
      path: "/",
      component: () => import("../views/GuestHome.vue"),
      meta: { public: true },
    },
    {
      path: "/guide",
      component: () => import("../views/WelcomeGuide.vue"),
      meta: { public: true },
    },
    {
      path: "/water",
      component: () => import("../views/GuestHome.vue"),
      meta: { public: true },
    },
    {
      path: "/calendar",
      component: () => import("../views/GuestHome.vue"),
      meta: { public: true },
    },
    {
      path: "/admin/login",
      component: () => import("../views/Login.vue"),
      meta: { public: true },
    },
    { path: "/manage", component: () => import("../views/Home.vue") },
    { path: "/dorm", component: () => import("../views/Dorm.vue") },
    { path: "/schedule", component: () => import("../views/Schedule.vue") },
    { path: "/history", component: () => import("../views/History.vue") },
    { path: "/profile", component: () => import("../views/Profile.vue") },
    { path: "/messages", component: () => import("../views/Messages.vue") },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});
router.beforeEach(async (to) => {
  if (["/", "/water", "/calendar", "/guide"].includes(to.path)) return;
  try {
    await refreshEmailAccount();
    if (
      emailAccount.required &&
      (to.path === "/admin/login" || !emailAccount.loggedIn)
    )
      return "/";
  } catch {
    // Do not expose an obsolete login form when email policy cannot be checked.
    return "/";
  }
  const session = useSession();
  await session.init();
  // A retained token that could not be checked is not proof of logout. Keep
  // protected and login routes behind the public startup recovery surface so
  // temporary network failures cannot flash a misleading login page.
  if (!session.initialized) return "/";
  if (!to.meta.public && !session.user)
    return { path: "/admin/login", query: { next: to.fullPath } };
  if (to.path === "/admin/login" && session.user) return "/dorm";
});
