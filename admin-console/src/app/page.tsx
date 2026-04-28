/**
 * Admin Console — placeholder home page
 *
 * This page is replaced by the Dashboard (Epic 2) once auth is wired up
 * (Admin Console Epic 1 Story 1.2 — Auth.js from Auth Unification project).
 *
 * For now it serves as the build/lint/typecheck target for CI.
 */
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <div className="rounded-2xl border border-gray-200 bg-white p-10 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">ospa Admin Console</h1>
        <p className="mt-2 text-sm text-gray-500">
          Scaffold complete. Auth &amp; feature surfaces ship in Epic 1 Stories 1.2–1.4.
        </p>
      </div>
    </main>
  )
}
