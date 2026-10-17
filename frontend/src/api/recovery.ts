import { choreRequest } from "./chores";
import type { GuestCreation } from "./guest";

export interface RecoveryStatus {
  configured: boolean;
  version: number;
  updated_at: string | null;
}
export interface GeneratedRecovery extends RecoveryStatus {
  recovery_code: string;
}
export function getRecovery(token: string, signal?: AbortSignal) {
  return choreRequest<RecoveryStatus>("/dorms/recovery", token, { signal });
}
export function generateRecovery(
  token: string,
  version: number,
  signal?: AbortSignal,
) {
  return choreRequest<GeneratedRecovery>("/dorms/recovery", token, {
    method: "POST",
    body: JSON.stringify({ expected_version: version }),
    signal,
  });
}
export function recoverOwner(
  invite: string,
  code: string,
  signal?: AbortSignal,
) {
  return choreRequest<GuestCreation>("/guest/recover", "", {
    method: "POST",
    headers: { "X-Dorm-Email": "1" },
    body: JSON.stringify({
      invite_code: invite.trim(),
      recovery_code: code.trim(),
    }),
    signal,
  });
}
