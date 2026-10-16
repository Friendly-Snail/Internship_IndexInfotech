import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: OverviewPage });

const features = [
  {
    to: "/pokemon",
    title: "Find your Pokémon",
    text: "Get to know their types and base stats.",
    tag: "POKÉMON LOOKUP",
  },
  {
    to: "/search",
    title: "Follow your curiosity",
    text: "Explore Pokémon by type and encounter region.",
    tag: "TYPE & REGION",
  },
  {
    to: "/battles",
    title: "Build a rivalry",
    text: "Compare teams and revisit saved battles.",
    tag: "TEAM BATTLES",
  },
  {
    to: "/pokedex",
    title: "Make it your own",
    text: "Keep a personal collection of Pokémon.",
    tag: "YOUR POKEDEX",
  },
] as const;

function OverviewPage() {
  const navigate = useNavigate();

  return (
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
          <button className="button-primary" onClick={() => void navigate({ to: "/pokemon" })}>
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
              key={entry.to}
              onClick={() => void navigate({ to: entry.to })}
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
  );
}
