// Placeholder block for an empty list, a missing page or an error
export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  text: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-28 border-2 border-dashed border-rule bg-plate px-6 py-14 text-center">
      <div className="mb-2 flex size-14 items-center justify-center rounded-full bg-card [&_svg]:size-6">{icon}</div>
      <p className="text-17 font-bold">{title}</p>
      <p className="max-w-md text-15 text-copy">{text}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
