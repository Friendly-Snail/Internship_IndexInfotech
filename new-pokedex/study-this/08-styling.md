# 8. Step seven: styling

The goal was simple: **the app must look exactly the same.** So we copied
`src/frontend/styles.css` to `src/styles.css` and changed as little as possible.

## 8.1 Loading the stylesheet

Old: a `<link>` in `index.html`, bundled by Bun.

```html
<link rel="stylesheet" href="./styles.css" />
```

New: imported in `__root.tsx` with Vite's `?url` suffix, then added through `head()`.

```tsx
import appCss from '../styles.css?url'
// ...
links: [{ rel: 'stylesheet', href: appCss }],
```

`?url` tells Vite: "don't inject this CSS with JavaScript; give me the final URL of the built
file". The server can then put a normal `<link>` into the HTML it renders, so the page is styled
from the very first paint, before any JavaScript runs.

## 8.2 Adding Tailwind without breaking the old CSS

The template added Tailwind. Normally you'd write `@import "tailwindcss";`, which includes three
parts: **theme** (design tokens), **preflight** (a CSS reset) and **utilities** (classes like
`flex`, `p-4`).

Preflight resets things like margins, heading sizes, list styles and button appearance. The old
hand-written CSS was designed *without* that reset, so including it would have changed how the
app looks. So we imported only the other two parts:

```css
/* src/styles.css */
/* Tailwind theme and utilities stay available; preflight is left out so the
   hand-written styles below render exactly as they did in the original app. */
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
```

Now Tailwind classes can be used in new components, and the old styles render as before.

## 8.3 The only CSS edits: buttons became links

In chapter 6 the navigation `<button>`s became `<Link>`s, which render `<a>` tags. The CSS
selectors had to follow:

```css
/* old */
.primary-nav button { ... }
.primary-nav button:hover { ... }
.primary-nav button[aria-current="page"] { ... }

/* new */
/* nav entries are router links; they keep the original button styling */
.primary-nav a {
  ...
  text-decoration: none;   /* links are underlined by default; buttons weren't */
}
.primary-nav a:hover { ... }
.primary-nav a[aria-current="page"] { ... }
```

Run `diff ../pokedex/src/frontend/styles.css src/styles.css` to confirm these are the only
differences.

## 8.4 shadcn/ui is installed but not used yet

The `shadcn` add-on created `components.json`, `src/lib/utils.ts` (the `cn` class-merging helper)
and some components in `src/components/ui/` (`button`, `input`, `label`, `select`, `slider`,
`switch`, `textarea`). **No page imports them yet.** The pages still use plain HTML elements with
the original CSS classes. They're ready for future work. To add more:

```bash
bunx shadcn@latest add dialog
```

(`.cursorrules` shows the same command with `pnpm dlx`; with Bun, use `bunx`.)

## Check yourself

1. What would have happened if we'd used `@import "tailwindcss";`?
2. Why did `.primary-nav a` need `text-decoration: none`?
3. What does `?url` do in `import appCss from '../styles.css?url'`?

<details>
<summary>Answers</summary>

1. Tailwind's preflight reset would have changed margins, headings, buttons and lists, so the app
   would no longer look like the original.
2. Browsers underline links by default. The old nav items were buttons, which aren't underlined.
3. It makes Vite return the final URL of the CSS file, so the server-rendered `<head>` can link to
   it directly.

</details>
