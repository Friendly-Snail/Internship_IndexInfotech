import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";

export const pages = [
  { to: "/", label: "Overview", mark: "01" },
  { to: "/pokemon", label: "Pokémon", mark: "02" },
  { to: "/search", label: "Type & region", mark: "03" },
  { to: "/battles", label: "Battles", mark: "04" },
  { to: "/pokedex", label: "My Pokedex", mark: "05" },
] as const;

/** Shared navigation and page shell; each route supplies the content. */
export function Layout({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const previousPathname = useRef(pathname);

  // move keyboard focus to the new content after navigating, but not on the first load
  // comparing paths (not a first-render flag) stays correct when StrictMode reruns effects
  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    document.getElementById("main-content")?.focus();
  }, [pathname]);

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
            <Link key={page.to} to={page.to} activeOptions={{ exact: true }}>
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
          <a href="/api">
            API discovery <span aria-hidden="true">↗</span>
          </a>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            Explore / <strong>{pages.find((page) => page.to === pathname)?.label}</strong>
          </span>
          <span className="workspace-badge">Pokémon workspace</span>
        </header>
        <main id="main-content" tabIndex={-1} key={pathname}>
          {children}
        </main>
        <footer className="page-footer">A little curiosity. A world of Pokémon.</footer>
      </div>
    </div>
  );
}
