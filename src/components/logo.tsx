// The landing's logo: three overlapping circles and the product name
export function Logo() {
  return (
    <span className="flex items-center gap-2.5 sm:gap-3">
      <span className="flex" aria-hidden>
        <span className="size-3.5 rounded-full bg-ink sm:size-4" />
        <span className="-ml-1 size-3.5 rounded-full bg-mid-green sm:-ml-1.25 sm:size-4" />
        <span className="-ml-1 size-3.5 rounded-full bg-white sm:-ml-1.25 sm:size-4" />
      </span>
      <span className="font-display text-logo font-bold sm:text-logo-lg">Tribe</span>
    </span>
  );
}
