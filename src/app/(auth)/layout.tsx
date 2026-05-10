export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center px-4">
      <div className="mb-8">
        <span className="text-2xl font-bold text-slate-800 tracking-tight">
          GanttV2
        </span>
      </div>
      {children}
    </div>
  )
}
