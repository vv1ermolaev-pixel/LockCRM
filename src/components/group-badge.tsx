import { Badge } from "@/components/ui/badge";
import { groupColorClasses, type GroupColor } from "@/lib/group-colors";
import { cn } from "@/lib/utils";

// A group label in the group's color: in the list, on the card, in the filter and in the "Группы" window
export function GroupBadge({ name, color, className }: { name: string; color: GroupColor; className?: string }) {
  return (
    <Badge className={cn("max-w-full text-ink", groupColorClasses[color], className)}>
      <span className="truncate">{name}</span>
    </Badge>
  );
}
