import type { EmailRoom } from "../api/email";
export function preferredEntryRoom(rooms: EmailRoom[], invite = "") {
  return (
    rooms.find((room) => room.invite_code === invite) ||
    (rooms.length === 1 ? rooms[0] : undefined)
  );
}
