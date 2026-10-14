import { createRouter, createWebHistory } from "vue-router";
import { useSession } from "../stores/session";
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
  if (["/", "/water", "/calendar"].includes(to.path)) return;
  const session = useSession();
  await session.init();
  if (!to.meta.public && !session.user)
    return { path: "/admin/login", query: { next: to.fullPath } };
  if (to.path === "/admin/login" && session.user) return "/dorm";
});
