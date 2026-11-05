// A block of the settings page
export function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 rounded-28 bg-card p-6 shadow-card sm:rounded-32 sm:p-8">
      <h2 className="font-display text-heading font-semibold sm:text-heading-lg">{title}</h2>
      {children}
    </section>
  );
}

// What came of the last action: a message or an error
export function SettingsMessage({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="rounded-14 bg-muted px-4 py-3 text-15 text-copy">
      {children}
    </p>
  );
}
