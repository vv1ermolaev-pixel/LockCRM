import { avatarColor, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ContactAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
        avatarColor(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
