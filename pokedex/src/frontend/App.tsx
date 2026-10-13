import { useState } from "react";
import { BattlesPage } from "./pages/BattlesPage";
import { SearchPage } from "./pages/SearchPage";
import { PokemonPage } from "./pages/PokemonPage";
import { Layout } from "./components/Layout";
import type { PageId } from "./components/Layout";

const features = [
  {
    page: "pokemon",
    title: "Find your Pokémon",
    text: "Get to know their types and base stats.",
    tag: "POKÉMON LOOKUP",
  },
  {
    page: "search",
    title: "Follow your curiosity",
    text: "Explore Pokémon by type and encounter region.",
    tag: "TYPE & REGION",
  },
  {
    page: "battles",
    title: "Build a rivalry",
    text: "Compare teams and revisit saved battles.",
    tag: "TEAM BATTLES",
  },
  {
    page: "pokedex",
    title: "Make it your own",
    text: "Keep a personal collection of Pokémon.",
    tag: "YOUR POKEDEX",
  },
] as const;

/** Navigation works now; data controls arrive in the following feature milestones. */
export function App() {
  const [activePage, setActivePage] = useState<PageId>("overview");
  const feature = features.find((entry) => entry.page === activePage);

  function navigate(page: PageId) {
    setActivePage(page);
    // Move keyboard focus to the new content after React updates the page.
    requestAnimationFrame(() => document.getElementById("main-content")?.focus());
  }

  return (
    <Layout activePage={activePage} onNavigate={navigate}>
      {activePage === "overview" ? (
        <>
          <section className="hero" aria-labelledby="page-title">
            <div className="hero-copy">
              <p className="eyebrow">WELCOME TO YOUR POKÉMON WORKSPACE</p>
              <h1 id="page-title">
                A world to explore.
                <br />
                <span>A team to discover.</span>
              </h1>
              <p>Find a favorite, explore its possibilities, and make your next great team.</p>
              <button className="button-primary" onClick={() => navigate("pokemon")}>
                Explore Pokémon <span aria-hidden="true">→</span>
              </button>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="orbital orbital-one" />
              <div className="orbital orbital-two" />
              <div className="explorer-orb">
                <span />
              </div>
              <span className="star star-one">✦</span>
              <span className="star star-two">✦</span>
            </div>
          </section>
          <section aria-labelledby="explore-title" className="explore-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">PICK A PATH</p>
                <h2 id="explore-title">What will you explore?</h2>
              </div>
              <p>Everything in one little workspace.</p>
            </div>
            <div className="feature-grid">
              {features.map((entry, index) => (
                <button
                  className="feature-card"
                  key={entry.page}
                  onClick={() => navigate(entry.page)}
                >
                  <span className="card-top">
                    <span className="card-number">0{index + 1}</span>
                    <span aria-hidden="true">↗</span>
                  </span>
                  <span className="small-label">{entry.tag}</span>
                  <span className="card-title">{entry.title}</span>
                  <span className="card-description">{entry.text}</span>
                </button>
              ))}
            </div>
          </section>
        </>
      ) : activePage === "pokemon" ? (
        <PokemonPage />
      ) : activePage === "search" ? (
        <SearchPage />
      ) : activePage === "battles" ? (
        <BattlesPage />
      ) : (
        <section className="feature-page" aria-labelledby="page-title">
          <p className="eyebrow">{feature?.tag}</p>
          <h1 id="page-title">{feature?.title}</h1>
          <p className="page-description">{feature?.text}</p>
          <div className="empty-state">
            <span className="empty-mark" aria-hidden="true">
              ✦
            </span>
            <h2>A new adventure is on the way</h2>
            <p>
              This page is ready for the next step. Search, battle, and collection controls will be
              added in the upcoming updates.
            </p>
            <button className="button-secondary" onClick={() => navigate("overview")}>
              Back to overview
            </button>
          </div>
        </section>
      )}
    </Layout>
  );
}
