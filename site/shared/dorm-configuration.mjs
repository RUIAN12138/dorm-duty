const keys = ["floor", "toilet", "sink", "water"];
export function validateDormConfiguration(value) {
  const bad = () => {
    throw new Error("请检查新版宿舍的任务、页面和提醒设置");
  };
  if (
    !value ||
    value.schema_version !== 2 ||
    !Array.isArray(value.tasks) ||
    value.tasks.length < 1 ||
    value.tasks.length > 4 ||
    !Array.isArray(value.pages) ||
    value.pages.length !== 3
  )
    bad();
  const pages = value.pages.map((p) => ({
    id: p?.id,
    label: String(p?.label || "").trim(),
  }));
  if (
    new Set(pages.map((p) => p.id)).size !== 3 ||
    !["duty", "water", "calendar"].every((id) =>
      pages.some((p) => p.id === id),
    ) ||
    pages.some((p) => !p.label || p.label.length > 8)
  )
    bad();
  if (!["soft", "hard"].includes(value.policy)) bad();
  const tasks = value.tasks.map((t) => {
    if (
      !keys.includes(t?.key) ||
      typeof t.enabled !== "boolean" ||
      !["duty", "water"].includes(t.page) ||
      !["round", "rotation"].includes(t.rotation) ||
      !["title", "card"].includes(t.display) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(t.deadline) ||
      !Number.isInteger(t.interval) ||
      t.interval < 1 ||
      t.interval > 30
    )
      bad();
    if(t.execution_time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t.execution_time)) bad();
    const effective = t.policy && t.policy !== "inherit" ? t.policy : value.policy;
    if(effective === "hard" && (t.execution_time || "08:00") >= t.deadline) bad();
    const name = String(t.name || "").trim(),
      content = String(t.content || "").trim();
    if (!name || [...name].length > 32 || [...content].length > 500)
      bad();
    if (
      t.policy !== undefined &&
      !["inherit", "soft", "hard"].includes(t.policy)
    )
      bad();
    return {
      policy: t.policy || "inherit",
      key: t.key,
      name,
      content,
      enabled: t.enabled,
      page: t.page,
      rotation: t.rotation,
      display: t.display,
      deadline: t.deadline,
      execution_time: t.execution_time || "08:00",
      interval: t.interval,
    };
  });
  if (
    new Set(tasks.map((t) => t.key)).size !== tasks.length ||
    !tasks.some((t) => t.enabled)
  )
    bad();
  if(value.second_page_kind !== undefined && !["tasks","nudge"].includes(value.second_page_kind)) bad();
  return { schema_version: 2, pages, tasks, policy: value.policy,second_page_kind:value.second_page_kind||"tasks" };
}
