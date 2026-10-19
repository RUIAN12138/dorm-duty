export interface JoinedDorm {
  code: string;
  name: string;
  memberId: number;
  nickname: string;
  marker: string;
  creator?: boolean;
}
const key = "dorm-joined-rooms-v1";
export function joinedDorms(): JoinedDorm[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (r): r is JoinedDorm =>
          !!r &&
          typeof r.code === "string" &&
          /^[A-Z0-9]{6,16}$/.test(r.code) &&
          typeof r.name === "string" &&
          Number.isInteger(r.memberId) &&
          r.memberId > 0 &&
          typeof r.nickname === "string" &&
          typeof r.marker === "string",
      )
      .slice(0, 12);
  } catch {
    return [];
  }
}
export function rememberDorm(room: JoinedDorm) {
  const rooms = [
    room,
    ...joinedDorms().filter((r) => r.code !== room.code),
  ].slice(0, 12);
  try {
    localStorage.setItem(key, JSON.stringify(rooms));
  } catch {
    /* Current visit still works without storage. */
  }
  return rooms;
}
export function forgetDorm(code: string) {
  const rooms = joinedDorms().filter((room) => room.code !== code);
  try {
    localStorage.setItem(key, JSON.stringify(rooms));
  } catch {
    /* The current list can still be updated when storage is unavailable. */
  }
  return rooms;
}
