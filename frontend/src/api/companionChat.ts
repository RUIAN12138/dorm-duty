import { choreRequest } from "./chores";
export interface ChatReminder {
  id: string;
  target_id: number;
  target_name: string;
  text: string;
  due_at: string;
  status: "proposed" | "pending" | "sent" | "cancelled" | "expired";
}
export interface ChatTurn {
  id?: number;
  role: "user" | "assistant";
  messages: string[];
  emotion: string;
  request_id: string;
}
export interface ChatState {
  available: boolean;
  voice_available: boolean;
  messages: ChatTurn[];
  reminders: ChatReminder[];
}
export interface ChatReply {
  messages: string[];
  emotion: string;
  reminder: ChatReminder | null;
}
export function companionClient(
  invite: string,
  memberId: number,
  token: string,
) {
  const identity = { invite, member_id: memberId };
  return {
    state: (signal?: AbortSignal) =>
      choreRequest<ChatState>(
        `/chores/companion/state?${new URLSearchParams({ invite, member_id: String(memberId) })}`,
        token,
        { signal },
      ),
    send: (text: string, requestId: string, signal?: AbortSignal) =>
      choreRequest<ChatReply>("/chores/companion/chat", token, {
        method: "POST",
        body: JSON.stringify({ ...identity, text, request_id: requestId }),
        signal,
      }),
    voice: (audio: string, signal?: AbortSignal) =>
      choreRequest<{ text: string }>("/chores/companion/transcribe", token, {
        method: "POST",
        body: JSON.stringify({ ...identity, audio }),
        signal,
      }),
    reminder: (
      id: string,
      action: "confirm" | "cancel",
      signal?: AbortSignal,
    ) =>
      choreRequest<{ status: ChatReminder["status"] }>(
        "/chores/companion/reminder",
        token,
        {
          method: "POST",
          body: JSON.stringify({ ...identity, id, action }),
          signal,
        },
      ),
    clear: (signal?: AbortSignal) =>
      choreRequest("/chores/companion/history", token, {
        method: "DELETE",
        body: JSON.stringify(identity),
        signal,
      }),
  };
}
