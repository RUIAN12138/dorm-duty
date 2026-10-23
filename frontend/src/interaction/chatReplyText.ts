const graphemeSegmenter =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("zh", { granularity: "grapheme" })
    : null;
const wordSegmenter =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("zh", { granularity: "word" })
    : null;

export function graphemes(text: string): string[] {
  if (graphemeSegmenter)
    return Array.from(graphemeSegmenter.segment(text), (part) => part.segment);
  // Compatibility protection for common emoji and combining sequences in old
  // embedded engines. Current supported engines use native UAX29 segmentation;
  // this deliberately does not claim to be a full Unicode segmentation table.
  const clusters: string[] = [];
  let joined = false,
    regional = 0;
  for (const point of text) {
    const last = clusters.length - 1;
    const extend =
      /[\p{Mark}\uFE0E\uFE0F\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]/u.test(
        point,
      );
    const flag = /\p{Regional_Indicator}/u.test(point);
    if (
      last >= 0 &&
      (extend ||
        joined ||
        point === "\u200D" ||
        (point === "\n" && clusters[last] === "\r") ||
        (flag && regional % 2 === 1))
    )
      clusters[last] += point;
    else clusters.push(point);
    joined = point === "\u200D";
    regional = flag ? regional + 1 : 0;
  }
  return clusters;
}

const sentenceEnd = /[。！？!?]/u;
const pauseEnd = /[，,；;、：:]/u;
const closing = /^[\p{Punctuation}\p{White_Space}]+$/u;
const closingQuote = /^[”’」』】）》）\]}'"]+$/u;
const opening = /^[“‘「『【《（([{]+$/u;

/** Pure, deterministic display projection. No normalization or trimming. */
export function splitReplyText(text: string, limit = 20): string[] {
  const size = Math.max(2, Math.floor(limit) || 20);
  const all = graphemes(text);
  if (!all.length) return [];
  const result: string[] = [];
  let offset = 0;
  while (offset < all.length) {
    const remaining = all.length - offset;
    if (remaining <= size) {
      result.push(all.slice(offset).join(""));
      break;
    }
    const max = offset + size;
    // A period in a number/URL is not a sentence boundary. Chinese and strong
    // English sentence marks are explicit; . requires whitespace/end after it.
    const sentence: number[] = [],
      pauses: number[] = [];
    for (let end = offset + 1; end <= max; end++) {
      const char = all[end - 1]!;
      if (
        sentenceEnd.test(char) ||
        (char === "." && /^\s/u.test(all[end] || "")) ||
        char.includes("\n")
      )
        sentence.push(end);
      else if (pauseEnd.test(char)) pauses.push(end);
    }
    let end = sentence.at(-1) ?? pauses.at(-1);
    if (end !== undefined) {
      while (
        end < max &&
        (sentenceEnd.test(all[end]!) || closingQuote.test(all[end]!))
      )
        end++;
    } else {
      // Word segmentation supplies Chinese word/phrase and whitespace bounds;
      // prefer a useful-sized phrase rather than a one-character tail.
      const window = all.slice(offset, max + 1).join("");
      const lengths = new Map<number, number>();
      let codeUnits = 0;
      for (let i = offset; i <= max && i < all.length; i++) {
        codeUnits += all[i]!.length;
        lengths.set(codeUnits, i + 1);
      }
      const bounds: number[] = [];
      if (wordSegmenter)
        for (const word of wordSegmenter.segment(window)) {
          const boundary = lengths.get(word.index + word.segment.length);
          if (
            boundary &&
            boundary <= max &&
            boundary > offset + Math.floor(size / 2)
          )
            bounds.push(boundary);
        }
      end = bounds.at(-1) ?? max;
    }
    // Avoid cutting an opener off its phrase, or leaving only a closing mark
    // at the start/end. Moving content across the boundary preserves every byte.
    while (end > offset + 1 && opening.test(all[end - 1]!)) end--;
    if (end < all.length && closing.test(all[end]!) && end - offset >= size) {
      let clusterEnd = end;
      while (clusterEnd < all.length && closing.test(all[clusterEnd]!))
        clusterEnd++;
      const marks = clusterEnd - end;
      if (marks < size) end = Math.max(offset + 1, end - marks);
    }
    if (all.slice(end).every((char) => closing.test(char))) {
      // Reserve at least one content grapheme for a punctuation-heavy tail.
      if (all.length - end <= size && end > offset + 1) end--;
    }
    result.push(all.slice(offset, end).join(""));
    offset = end;
  }
  return result;
}

/** Reconnect only legacy 20-codepoint continuations inside one response. */
export function splitReplyMessages(parts: readonly string[]): string[] {
  const paragraphs: string[] = [];
  let paragraph = "";
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    paragraph += part;
    const hardContinuation =
      Array.from(part).length === 20 &&
      !/[。！？!?，,；;、：:\n][”’」』】）》）\]}'"]*$/u.test(part) &&
      i + 1 < parts.length;
    if (!hardContinuation) {
      paragraphs.push(paragraph);
      paragraph = "";
    }
  }
  if (paragraph) paragraphs.push(paragraph);
  return paragraphs.flatMap((text) => splitReplyText(text));
}

export interface ChatSourceItem {
  id: string;
  role: "user" | "assistant";
  text: string;
  parts?: readonly string[];
  fresh?: boolean;
}
export interface ChatDisplayItem extends ChatSourceItem {
  group: string;
  followup: boolean;
}
export function projectChatItems(
  items: readonly ChatSourceItem[],
): ChatDisplayItem[] {
  return items.flatMap((item) => {
    const pieces =
      item.role === "user"
        ? [item.text]
        : splitReplyMessages(item.parts || [item.text]);
    return pieces.map((text, index) => ({
      ...item,
      text,
      id: index ? `${item.id}:segment:${index}` : item.id,
      group: item.id,
      followup: index > 0,
    }));
  });
}
export const replyReadingDelay = (text: string) =>
  Math.min(250, 150 + graphemes(text).length * 5);
