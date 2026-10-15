// RFC 5545 TEXT escaping and UTF-8 content-line folding. No user text becomes a property name.
const encoder = new TextEncoder();
export function calendarText(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}
function fold(line) {
  let part = "",
    bytes = 0;
  const result = [];
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) {
      result.push(part);
      part = " ";
      bytes = 1;
    }
    part += char;
    bytes += size;
  }
  result.push(part);
  return result.join("\r\n");
}
const stamp = (value) =>
  new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
const compact = (day) => day.replace(/-/g, "");
const nextDay = (day) =>
  new Date(new Date(`${day}T00:00:00Z`).getTime() + 86400000)
    .toISOString()
    .slice(0, 10);

export function renderCalendar({ tasks, today, now, version, alarms, plan }) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lundao//Personal Duty Calendar//ZH-CN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:轮到 · 我的值日",
    "X-WR-TIMEZONE:Asia/Shanghai",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];
  for (const task of tasks) {
    const free = task.mode === "self_round";
    const day = free ? today : task.duty_date;
    const deadline = task.deadline_at
      ? new Date(new Date(task.deadline_at).getTime() + 8 * 3600000)
          .toISOString()
          .slice(11, 16)
      : "";
    const description = `${task.content}\n${free ? "自由轮次，显示今日待办，不设每日截止。" : `截止：北京时间 ${deadline}。`}\n完成后请在轮到打卡；系统日历会按自身频率同步。`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:duty-${task.dorm_id}-${task.assignee_id}-${task.id}@lundao`,
      `DTSTAMP:${stamp(now)}`,
      `SEQUENCE:${version}`,
      `DTSTART;VALUE=DATE:${compact(day)}`,
      `DTEND;VALUE=DATE:${compact(nextDay(day))}`,
      `SUMMARY:${calendarText(task.name + (free ? " · 本轮待办" : " · 值日"))}`,
      `DESCRIPTION:${calendarText(description)}`,
      "CLASS:PRIVATE",
      "TRANSP:TRANSPARENT",
      "STATUS:CONFIRMED",
    );
    if (alarms && plan?.enabled) {
      for (const time of plan.times) {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) continue;
        const at = new Date(`${day}T${time}:00+08:00`);
        if (at.getTime() <= now.getTime()) continue;
        lines.push(
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          `TRIGGER;VALUE=DATE-TIME:${stamp(at)}`,
          `DESCRIPTION:${calendarText(task.name + "还没完成，做完记得打卡。")}`,
          "END:VALARM",
        );
      }
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
