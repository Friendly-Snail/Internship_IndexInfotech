import type { ReactNode } from "react";
import { useEffect } from "react";
import { Link, useLocation } from "@tanstack/react-router";

export const pages = [
  { id: "overview", label: "Overview", mark: "01" },
  { id: "pokemon", label: "Pokémon", mark: "02" },
  { id: "search", label: "Type & region", mark: "03" },
  { id: "battles", label: "Battles", mark: "04" },
  { id: "pokedex", label: "My Pokedex", mark: "05" },
] as const;
export type PageId = (typeof pages)[number]["id"];

const paths = { overview: "/", pokemon: "/pokemon", search: "/search", battles: "/battles", pokedex: "/pokedex" } as const;
export function Layout({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const activePage = pages.find((page) => paths[page.id] === pathname)?.id;
  useEffect(() => { document.getElementById("main-content")?.focus(); }, [pathname]);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link className="brand" to="/" aria-label="Pokémon Explorer home">
          <span className="brand-mark" aria-hidden="true">
            P
          </span>
          <span>
            Pokémon<span className="brand-subtitle">EXPLORER</span>
          </span>
        </Link>
        <p className="nav-label">YOUR WORKSPACE</p>
        <nav className="primary-nav" aria-label="Main navigation">
          {pages.map((page) => (
            <Link
              key={page.id}
              to={paths[page.id]}
              aria-current={activePage === page.id ? "page" : undefined}
            >
              <span className="nav-mark" aria-hidden="true">
                {page.mark}
              </span>
              {page.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="small-label">DEVELOPER TOOLS</span>
          <a href="/api/docs">
            API documentation <span aria-hidden="true">↗</span>
          </a>

        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            Explore / <strong>{pages.find((page) => page.id === activePage)?.label}</strong>
          </span>
          <span className="workspace-badge">Pokémon workspace</span>
        </header>
        <main id="main-content" tabIndex={-1} key={activePage}>
          {children}
        </main>
        <footer className="page-footer">A little curiosity. A world of Pokémon.</footer>
      </div>
    </div>
  );
}
