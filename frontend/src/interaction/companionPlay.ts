// Play uses existing expression artwork, never task-success/error/loading states.
// A shuffled bag gives every expression a turn without repeating the last one.
export const playfulEmotions = [
  "03",
  "10",
  "13",
  "14",
  "16",
  "17",
  "18",
  "19",
  "21",
  "30",
  "37",
  "39",
  "40",
] as const;

export function createCompanionPlay(random: () => number = Math.random) {
  let remaining: string[] = [];
  let previous = "";
  function refill() {
    remaining = [...playfulEmotions];
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j]!, remaining[i]!];
    }
  }
  return {
    next(current: string) {
      if (["00", "06", "15"].includes(current) && previous !== "07") {
        previous = "07";
        return previous;
      }
      if (!remaining.length) refill();
      let index = remaining.findIndex(
        (id) => id !== previous && id !== current,
      );
      // If a scene changed to the bag's final item, start a new round rather
      // than replaying the expression already on screen.
      if (index < 0) {
        refill();
        index = remaining.findIndex((id) => id !== previous && id !== current);
      }
      previous = remaining.splice(index, 1)[0]!;
      return previous;
    },
  };
}
