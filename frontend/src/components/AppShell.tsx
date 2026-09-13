import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

const NAV = [
  { to: "/documents", label: "Documentos", icon: "📄" },
  { to: "/goals", label: "Metas", icon: "🎯" },
  { to: "/plan", label: "Plan", icon: "🗺️" },
  { to: "/dashboard", label: "Dashboard", icon: "📊" },
  { to: "/settings", label: "Configuración", icon: "⚙️" },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="text-2xl">🧠</span>
          <span className="text-lg font-bold text-slate-800">StudyAI</span>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-2 pt-6 text-xs text-slate-400">
          MVP · usuario demo
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">{children}</div>
      </main>
    </div>
  );
}
