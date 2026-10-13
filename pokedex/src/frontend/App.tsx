import { useState } from "react";

/** First frontend milestone: a rendered page with working React state. */
export function App() {
  const [clicks, setClicks] = useState(0);

  return (
    <main className="page">
      <p className="eyebrow">Pokémon Explorer</p>
      <h1>Your Pokémon adventure starts here.</h1>
      <p>Search, stats, and team battles are coming next.</p>
      <section aria-labelledby="demo-title">
        <h2 id="demo-title">Try the button</h2>
        <p>Each click updates the page using React state.</p>
        <button type="button" onClick={() => setClicks((previous) => previous + 1)}>
          Click me
        </button>
        <p role="status">Clicks: {clicks}</p>
      </section>
      <nav aria-label="API tools">
        <a href="/">API discovery</a>
        <a href="/api/docs">API documentation</a>
      </nav>
    </main>
  );
}
