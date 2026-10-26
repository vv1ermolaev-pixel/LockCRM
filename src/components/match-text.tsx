import type { Range } from "@/lib/search";

// Text with the parts that matched the search marked
export function MatchText({ text, ranges }: { text: string; ranges: Range[] }) {
  if (ranges.length === 0) return text;

  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(
      <mark key={start} className="rounded-6 bg-pistachio text-foreground box-decoration-clone">
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}
