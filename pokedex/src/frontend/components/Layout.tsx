import type { ReactNode } from "react";

export const pages = [
  { id: "overview", label: "Overview", mark: "01" },
  { id: "pokemon", label: "Pokémon", mark: "02" },
  { id: "search", label: "Type & region", mark: "03" },
  { id: "battles", label: "Battles", mark: "04" },
  { id: "pokedex", label: "My Pokedex", mark: "05" },
] as const;
export type PageId = (typeof pages)[number]["id"];

type LayoutProps = {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  children: ReactNode;
};

/** Shared navigation and page shell; feature pages supply the content. */
export function Layout({ activePage, onNavigate, children }: LayoutProps) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <a className="brand" href="/ui" aria-label="Pokémon Explorer home">
          <span className="brand-mark" aria-hidden="true">
            P
          </span>
          <span>
            Pokémon<span className="brand-subtitle">EXPLORER</span>
          </span>
        </a>
        <p className="nav-label">YOUR WORKSPACE</p>
        <nav className="primary-nav" aria-label="Main navigation">
          {pages.map((page) => (
            <button
              key={page.id}
              type="button"
              aria-current={activePage === page.id ? "page" : undefined}
              onClick={() => onNavigate(page.id)}
            >
              <span className="nav-mark" aria-hidden="true">
                {page.mark}
              </span>
              {page.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="small-label">DEVELOPER TOOLS</span>
          <a href="/api/docs">
            API documentation <span aria-hidden="true">↗</span>
          </a>
          <a href="/">
            API discovery <span aria-hidden="true">↗</span>
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
