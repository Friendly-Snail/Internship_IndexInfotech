# 6. Step five: from `useState` page switching to real routes

## 6.1 How the old frontend booted

```
src/server.ts ─ routes: { "/ui": frontend }   ← Bun imports index.html and bundles it
      │
src/frontend/index.html   <div id="root"></div>  <script src="./main.tsx">
      │
src/frontend/main.tsx     createRoot(container).render(<App />)
      │
src/frontend/App.tsx      const [activePage, setActivePage] = useState<PageId>("overview")
                          activePage === "pokemon" ? <PokemonPage /> : activePage === "search" ? ...
```

Problems with this:

- The URL was always `/ui`. Refreshing the browser always went back to the overview.
- The back button left the app instead of going to the previous page.
- `App.tsx` had to import every page and grow the `? :` chain for each new one.
- The browser received an empty `<div id="root">`. Nothing showed until the JavaScript loaded.

## 6.2 How the new frontend boots

```
vite.config.ts ─ tanstackStart()          ← scans src/routes, generates src/routeTree.gen.ts
      │
src/router.tsx            getRouter(): createRouter({ routeTree, context: { queryClient } })
      │
src/routes/__root.tsx     the <html> document + <Layout> + <Outlet />
      │
src/routes/<page>.tsx     the page component for the current URL
```

There's no `index.html` and no `main.tsx` any more. TanStack Start renders the HTML document
itself, from React, on the server.

### `src/router.tsx`

```ts
export function getRouter() {
  const context = getContext()           // creates the QueryClient (chapter 7)

  const router = createTanStackRouter({
    routeTree,                           // generated from src/routes
    context,                             // available to every route
    scrollRestoration: true,
    defaultPreload: 'intent',            // start loading a page when the user hovers its link
    defaultPreloadStaleTime: 0,
  })

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })
  return router
}
```

`setupRouterSsrQueryIntegration` connects TanStack Query to server rendering. Data fetched while
rendering on the server is sent along with the HTML, so the browser doesn't fetch it again.

### `src/routes/__root.tsx`: the old `index.html` + `main.tsx`, as React

```tsx
export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      { title: 'Pokémon Explorer' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,   // the <html>…</html> wrapper
  component: RootLayout,          // what goes inside it
})

function RootLayout() {
  return (
    <Layout>
      <Outlet />                  {/* the current page renders here */}
    </Layout>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        {children}
        <noscript>Please enable JavaScript to use Pokémon Explorer.</noscript>
        <TanStackDevtools /* ... */ />
        <Scripts />
      </body>
    </html>
  )
}
```

Compare it with the old `index.html`. The `<title>`, viewport meta, stylesheet link and
`<noscript>` message all moved here. `<HeadContent />` writes the `head()` values into the page,
and `<Scripts />` adds the JavaScript bundle.

`<Outlet />` is the key idea. It means "render the child route that matches the current URL here".
It replaces the whole `activePage === ... ? ... : ...` chain.

## 6.3 Each page is now a file

```tsx
// src/routes/pokemon.tsx
export const Route = createFileRoute("/pokemon")({ component: PokemonPage });

function PokemonPage() { /* ... */ }
```

| Old | New | URL |
| --- | --- | --- |
| Overview JSX inside `App.tsx` | `src/routes/index.tsx` | `/` |
| `src/frontend/pages/PokemonPage.tsx` | `src/routes/pokemon.tsx` | `/pokemon` |
| `src/frontend/pages/SearchPage.tsx` | `src/routes/search.tsx` | `/search` |
| `src/frontend/pages/BattlesPage.tsx` | `src/routes/battles.tsx` | `/battles` |
| `src/frontend/pages/PokedexPage.tsx` | `src/routes/pokedex.tsx` | `/pokedex` |

Note that the page components are **no longer exported** (`function PokemonPage` instead of
`export function PokemonPage`). Only `Route` is exported; the router finds the component through it.

The old `App.tsx` also had a "coming soon" placeholder for pages that didn't exist yet. Every page
exists now, so it was dropped.

## 6.4 Navigation: buttons become `<Link>`s

```tsx
// old: src/frontend/components/Layout.tsx
export const pages = [
  { id: "overview", label: "Overview", mark: "01" },
  { id: "pokemon", label: "Pokémon", mark: "02" },
  // ...
] as const;

<button
  type="button"
  aria-current={activePage === page.id ? "page" : undefined}
  onClick={() => onNavigate(page.id)}
>
```

```tsx
// new: src/components/Layout.tsx
export const pages = [
  { to: "/", label: "Overview", mark: "01" },
  { to: "/pokemon", label: "Pokémon", mark: "02" },
  // ...
] as const;

<Link key={page.to} to={page.to} activeOptions={{ exact: true }}>
```

What changed:

- `id` became `to`, a real URL path.
- `<button onClick>` became `<Link>`, which renders a real `<a href>`. That means right-click →
  "Open in new tab" works now.
- `aria-current="page"` is **added automatically** by `<Link>` when its URL is active. The CSS
  selector changed from `.primary-nav button[aria-current="page"]` to
  `.primary-nav a[aria-current="page"]`.
- `activeOptions={{ exact: true }}` matters for the Overview link. Without it, `/` would count
  as active on every page, because every path starts with `/`.
- `Layout` no longer needs `activePage` and `onNavigate` props. It reads the URL itself with
  `useLocation`.

The overview page's buttons use the router too:

```tsx
// src/routes/index.tsx
const navigate = useNavigate();
<button onClick={() => void navigate({ to: entry.to })}>
```

## 6.5 Keeping keyboard focus behavior

The old app moved focus to the new page content after each navigation, for keyboard and
screen-reader users:

```ts
// old: App.tsx
function navigate(page: PageId) {
  setActivePage(page);
  requestAnimationFrame(() => document.getElementById("main-content")?.focus());
}
```

There's no `navigate` function of our own any more. The router does the navigating. So
`Layout` now **watches the URL** and moves focus when it changes:

```ts
// new: src/components/Layout.tsx
const pathname = useLocation({ select: (location) => location.pathname });
const previousPathname = useRef(pathname);

// move keyboard focus to the new content after navigating, but not on the first load
// comparing paths (not a first-render flag) stays correct when StrictMode reruns effects
useEffect(() => {
  if (previousPathname.current === pathname) return;
  previousPathname.current = pathname;
  document.getElementById("main-content")?.focus();
}, [pathname]);
```

The comments explain two careful choices:

1. **Not on the first load.** If you open `/battles` directly, focus should stay where the browser
   puts it, at the top of the document.
2. **Compare paths instead of using an "is first render" flag.** In development, React's
   StrictMode runs effects twice. A boolean flag would be flipped by the first run, and the second
   run would wrongly move focus. Comparing the stored path with the current path gives the right
   answer however many times the effect runs.

> **Lesson:** when you migrate, list the *behaviors* of the old code (like "focus moves to main
> content after navigation"), not just its features. Behaviors are easy to lose by accident.

## Check yourself

1. What does `<Outlet />` replace from the old `App.tsx`?
2. Why does the Overview link need `activeOptions={{ exact: true }}`?
3. Where did the contents of the old `index.html` go?
4. Why doesn't the focus effect use a simple `isFirstRender` boolean?
5. Try it: run the app, go to `/battles`, and press the browser's back button. What would have
   happened in the old app?

<details>
<summary>Answers</summary>

1. The `activePage === "pokemon" ? <PokemonPage /> : ...` chain. The router puts the matching
   page into the outlet.
2. `/` is a prefix of every path, so without `exact` the Overview link would look active on every
   page.
3. Into `src/routes/__root.tsx`: `head()` for the meta, title and stylesheet, and `RootDocument`
   for `<html>`, `<body>`, `<noscript>` and the scripts.
4. React StrictMode runs effects twice in development, so a flag would be wrong on the second run.
   Comparing the previous and current paths is correct no matter how often it runs.
5. The old app never changed the URL, so the back button would have left the app entirely.

</details>
