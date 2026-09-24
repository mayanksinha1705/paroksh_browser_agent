export function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-3.5 px-6">
      <h1 className="text-2xl font-semibold text-foreground">
        Hello, <span className="text-blue-400">there</span>
      </h1>
      <p className="text-xs text-muted-foreground max-w-[260px]">
        Tell me what to do in this tab — I&apos;ll drive the browser for you.
      </p>
    </div>
  );
}
