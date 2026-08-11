# English Studio App Shell

Status: implemented 2026-07-29.

This document defines the reusable layout contract for the authenticated Studio and its
public tool surfaces. It complements the product information architecture in
`english-studio-ia-v2-design.md`.

## The pattern

The industry name for this structural layer is an **application shell** (or **app shell**),
not a user journey or a sitemap:

- A **sitemap / information architecture** says which destinations exist and how they are
  grouped.
- A **user flow / journey** says which sequence a person follows to finish a task.
- An **app shell** is the persistent spatial and behavioural frame shared by those
  destinations.
- A **page frame / page container** is the inner layout contract for headings, actions,
  local tabs and page content.

The pattern predates generative AI products. It became especially visible in AI workspaces
because tools such as Claude and ElevenLabs combine product navigation, projects or tools,
sessions, editors and local history in one application.

There is no single framework that can decide bcailab's product semantics: what counts as a
session, whether history belongs to a tool, or how Progress aggregates evidence. Mature UI
systems do provide the reusable mechanics:

- [shadcn/ui Sidebar](https://ui.shadcn.com/docs/components/radix/sidebar): provider,
  collapsible rail, inset content, groups and mobile behaviour.
- [MUI Toolpad DashboardLayout](https://mui.com/toolpad/core/react-dashboard-layout/):
  header, collapsible sidebar and scrollable main content, plus a PageContainer convention.
- [Tailwind Catalyst application layouts](https://tailwindcss.com/blog/2024-05-24-catalyst-application-layouts):
  responsive sidebar layout with a mobile navigation substitution.
- [PatternFly Page](https://www.patternfly.org/components/page/): page shell, sidebar,
  sections, fill and scroll variants.
- [Atlassian layout grid](https://atlassian.design/foundations/grid-beta/applying-grid/):
  navigation and panels around a stable main grid with controlled spans and gutters.

The implementation decision is therefore: reuse the established app-shell anatomy, keep it
small and local, and encode bcailab's information architecture explicitly. Pulling in a
second component library would not answer the product questions and would fight the
existing design tokens.

## Studio hierarchy

```text
English Studio app shell
├── Product rail (destinations only)
│   ├── Home
│   ├── Progress
│   ├── Practice: Dictation, Reading, Writing
│   └── Tools: Translate, Speech
└── Main inset
    └── Page frame
        ├── Page header: title, description, page action
        ├── Optional local tabs
        └── Page body
            ├── standard workspace
            ├── wide catalogue/dashboard
            └── full workspace/editor
```

Tool history is never rendered in the product rail. If a tool has meaningful history, it
belongs to that tool's main workspace as a local tab or panel. A concrete session or
document is a detail workspace and provides a return to its tool page.

The brand mark and product navigation have separate jobs: the bcailab mark returns to the
site homepage, while `Home` returns to English Studio. The pinned account control is a
button on every signed-in Studio route and opens the same profile, theme and sign-out menu;
tool-specific settings may be exposed as an additional menu item.

## Code contract

`StudioShell` owns the persistent rail/main/canvas nesting. Tool layouts inject their rail
only when they need a tool-specific settings destination; they do not recreate the shell.

`StudioPage` owns the stable page origin and one of three body widths:

- `standard` — focused forms and writing workspaces.
- `wide` — catalogues, Home and progress dashboards.
- `workspace` — two-pane tools and extensible editor surfaces.

`StudioPageHeader`, `StudioPageTabs` and `StudioPageBody` use the same left edge. Changing
the body width never changes that origin. Primary pages use one heading scale and one
vertical rhythm. Page-level actions live in the header; tool-local navigation lives below
it.

Secondary routes follow the same semantic contract even when their inner workspace is
specialised:

- Every page supplies a route-specific browser title using
  `Page · Tool · English Studio · bcailab`.
- Every rendered page has exactly one `h1`; edit, settings and collapse controls are siblings
  of that heading rather than children of it.
- Settings and progress routes compose `StudioPage` instead of introducing a route-owned
  outer margin.
- Bounded session/editor workspaces may keep their own inner grid, but expose a clear return
  to the owning tool and keep the page title as the workspace heading.

## Material directory contract

Material-led tools use progressive disclosure instead of placing their complete bank on the
tool homepage:

```text
tool hub → collection catalogue → material detail → practice workspace
```

The hub explains the available collections and keeps learner work visible. The catalogue owns
URL-backed filters and requests one bounded server-side page; it never downloads the full bank
and filters it in the browser. Continuation state is opaque to the UI, stable for the selected
sort, and carried in the URL so refresh and browser history remain useful. The detail route is
the canonical entry to a material item.

A catalogue may promote a small, non-duplicated subset from its first page into richer cards
when those cards help a learner choose where to begin. The rest of the page remains a compact
list, and continuation pages do not repeat the promotional shelf. Cards are therefore a
discovery emphasis, not the storage shape of the whole library.

Writing is the first implementation: `/writing` is the hub,
`/writing/library?category=general|task1|task2` is the bounded catalogue, and
`/writing/prompt/:slug` is the assignment detail. General English can narrow by CEFR discovery
band; IELTS collections narrow by task family. A filter only changes discovery order and
visibility for that view. It never locks material, and a null learner or material level is
never presented as B1.

Reading and Dictation may reuse the same structural contract with their own dimensions, such
as topic, level, and practice state. Translate and Speech are workspaces rather than material
directories and must not acquire an invented category layer merely for visual consistency.

## Scroll and responsive rules

- Ordinary pages have one owner for vertical scrolling: the main inset.
- Only bounded editors or live sessions opt into inner scrolling.
- The desktop rail collapses through the shared rail control.
- On smaller screens the rail becomes a drawer and the page begins below its fixed trigger.
- Page widths compress through the same frame; individual routes must not add their own
  viewport-height lock or outer horizontal coordinate system.
- A saved client preference must not determine the server/client initial tree. Collapsed
  rails and panels render a deterministic default for SSR, then restore `localStorage`
  preferences in an effect after hydration.

These rules are the acceptance criteria for new Studio pages. A new tool should compose the
existing shell and frame before adding tool-specific layout inside the page body.
