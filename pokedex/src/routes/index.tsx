import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Overview });

function Overview() {
  return (
    <main style={{ maxWidth: 800, margin: "4rem auto", padding: "2rem" }}>
      <p>POKÉMON EXPLORER</p>
      <h1>Your Pokémon journey continues</h1>
      <p>Explore Pokémon, search by type and region, battle teams, and manage your Pokédex.</p>
      <p>
        <Link to="/ui">Open Pokémon Explorer</Link>
      </p>
      <p>
        <a href="/api/docs">API documentation</a> · <a href="/api/discovery">API discovery</a>
      </p>
    </main>
  );
}
