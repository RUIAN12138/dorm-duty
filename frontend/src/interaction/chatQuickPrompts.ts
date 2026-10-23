// This is the existing question library; the note action remains in the view.
export const CHAT_QUESTIONS = [
  "今天做什么？",
  "怎么改轮序？",
  "帮我设提醒",
] as const;

export function pickQuickPrompts(
  width: number,
  previous: readonly string[] = [],
  random: () => number = Math.random,
): string[] {
  const count = width < 420 ? 2 : 3;
  const candidates = CHAT_QUESTIONS.flatMap((first) =>
    CHAT_QUESTIONS.filter((value) => value !== first).flatMap((second) =>
      count === 2
        ? [[first, second]]
        : [
            [
              first,
              second,
              CHAT_QUESTIONS.find(
                (value) => value !== first && value !== second,
              )!,
            ],
          ],
    ),
  );
  // Enumerating the tiny library guarantees bounded work, even with a fixed or
  // invalid random source. Prefer another subset when the small screen allows.
  const signature = (list: readonly string[]) => list.join("\u0000");
  const subset = (list: readonly string[]) => [...list].sort().join("\u0000");
  const different = candidates.filter(
    (list) => signature(list) !== signature(previous),
  );
  const differentSubset = different.filter(
    (list) => subset(list) !== subset(previous),
  );
  const choices = differentSubset.length ? differentSubset : different;
  const value = random();
  const index = Number.isFinite(value)
    ? Math.min(
        choices.length - 1,
        Math.max(0, Math.floor(value * choices.length)),
      )
    : 0;
  return [...choices[index]!];
}
