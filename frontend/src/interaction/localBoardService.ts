import type { InjectionKey } from "vue";
import type { ChoreBoardData, ChoreCompletion, ChoreTask } from "../api/chores";
import type { companionClient } from "../api/companionChat";

/** An injected local capability, never a flag that authorizes live APIs. */
export interface LocalBoardService {
  kind: "tutorial" | "draft";
  board: ChoreBoardData;
  events: {
    complete: number;
    undo: number;
    nudge: number;
    note: number;
    read: number;
  };
  matches(invite: string, memberId: number, token: string): boolean;
  complete(task: ChoreTask): ChoreCompletion;
  undo(id: number): { task: ChoreTask; version: number };
  nudge?(task: ChoreTask): "sent" | "recent";
  sendNote(note: {
    target_member_id: number | number[] | "all";
    text: string;
  }): Promise<void>;
  read(id: number): boolean;
  api: ReturnType<typeof companionClient>;
  sentNotes: { target_member_id: number | number[] | "all"; text: string }[];
}
export const localBoardServiceKey: InjectionKey<LocalBoardService> = Symbol(
  "local-board-service",
);
