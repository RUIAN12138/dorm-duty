import type {
  ChoreBoardData,
  ChoreCompletion,
  ChoreTask,
} from "../../../api/chores";
export function createDraftSandbox(
  input: ChoreBoardData,
  now?: () => Date,
): {
  snapshot(): ChoreBoardData;
  complete(task: Pick<ChoreTask, "id">): ChoreCompletion;
  undo(id: number): { task: ChoreTask; version: number };
  nudge(task: Pick<ChoreTask, "id">): "sent" | "recent";
  sendNote(note: { target_member_id: number | number[] | "all"; text: string }): void;
  read(id: number): boolean;
  pages(value: NonNullable<ChoreBoardData["configuration"]>["pages"]): void;
  events: {
    complete: number;
    undo: number;
    nudge: number;
    note: number;
    read: number;
  };
  notes: { target_member_id: number | number[] | "all"; text: string }[];
};
