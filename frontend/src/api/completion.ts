import { choreRequest, type ChoreCompletion } from "./chores";

// A confirmed write remains successful even when the subsequent read fails.
export async function completeChore(
  id: number,
  token: string,
  accept: (receipt: ChoreCompletion) => void,
  sync: () => Promise<boolean>,
): Promise<"synced" | "pending"> {
  const receipt = await choreRequest<ChoreCompletion>(
    `/chores/tasks/${id}/complete`,
    token,
    { method: "PATCH", body: "{}" },
  );
  accept(receipt);
  try {
    return (await sync()) ? "synced" : "pending";
  } catch {
    return "pending";
  }
}
