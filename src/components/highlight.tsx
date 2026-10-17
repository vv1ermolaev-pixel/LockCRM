import { cn } from "@/lib/utils";

// White "plate" behind heading words, as on the landing; radius and padding come from the caller.
// box-decoration-clone keeps the plate intact when the words wrap onto a second line.
export function Highlight({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={cn("bg-card box-decoration-clone", className)}>{children}</span>;
}
