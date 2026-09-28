export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-5">
      <div className="space-y-2 border-b border-line pb-5">
        <div className="skeleton h-3.5 w-32" />
        <div className="skeleton h-6 w-72" />
        <div className="skeleton h-4 w-96 max-w-full" />
      </div>
      <div className="card divide-y divide-line">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex gap-6 px-4 py-3.5">
            <div className="skeleton h-4 w-1/3" />
            <div className="skeleton h-4 w-1/4" />
            <div className="skeleton h-4 w-1/6" />
          </div>
        ))}
      </div>
    </div>
  );
}
