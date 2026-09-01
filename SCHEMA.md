# Paywall schema v1

A paywall is a JSON document. The SDK fetches it from a URL you control,
validates it, and renders it into React Native primitives. Nothing else.

Three constraints shape the whole design:

- **No code crosses the wire.** Every node is data. Buttons carry named
  intents, not handlers. There is no expression language, no scripting, no
  eval. This is what keeps the SDK compliant with App Store rule 2.5.2 and
  what makes it safe to fetch a paywall from a server you may not fully trust.
- **No prices in the document.** Prices are localized per storefront and can
  change without your server knowing. They come from the store at runtime.
- **Old SDKs must survive new documents.** A paywall published today runs on
  an SDK build shipped a year ago. Every unknown thing degrades instead of
  throwing.

A complete document you can copy and edit lives in
[`templates/example.json`](templates/example.json).

---

## Document

```jsonc
{
  "schemaVersion": 1,
  "id": "default",
  "revision": "2026-08-31T09:14:22Z",
  "packages": [ /* PackageDefinition[] */ ],
  "root": { /* Node */ },
  "background": { "color": "#0B0D12" },
  "meta": { "experiment": "hero-v3" }
}
```

| Field | Required | Notes |
|---|---|---|
| `schemaVersion` | yes | Major version. Bumped only for breaking changes. |
| `id` | yes | Stable identifier you choose. Must match `^[a-zA-Z0-9_-]{1,64}$`. |
| `revision` | no | Opaque, changes on every publish. Used for cache comparison. |
| `packages` | yes | At least one. Order is display order. |
| `root` | yes | Root node of the layout tree. |
| `background` | no | Colour and optional full-bleed image. |
| `meta` | no | Passed through to the host untouched. Ignored by the renderer. |

### The `id` contract

The same `id` is a URL path segment, a storage key and an analytics dimension,
so it is restricted to `^[a-zA-Z0-9_-]{1,64}$`. An id outside that set throws a
`RangeError` — one of only two throws in the SDK, and one that fires on a
developer's first run rather than in a user's hands. The restriction is what
stops `../` or a full URL in an id from redirecting the document request
somewhere you did not intend. Proved by
[`src/resolveUrl.test.ts`](src/resolveUrl.test.ts).

---

## Packages

```jsonc
{
  "id": "annual",
  "productId": "com.example.app.pro.annual",
  "title": "Annual",
  "subtitle": "{{package.price}} per year",
  "badge": "Best value",
  "selectedByDefault": true
}
```

`productId` is passed verbatim to your app. The SDK never parses it, never
sends it anywhere, and has no idea what a subscription is.

At most one package may set `selectedByDefault`. If none does, the first one
is selected. If several do, the first wins and the rest are ignored. Proved by
[`src/validateDocument.test.tsx`](src/validateDocument.test.tsx).

---

## Nodes

Seven types. The set is closed — adding one is a schema change.

Every node, whatever its type, accepts these:

| Field | Notes |
|---|---|
| `id` | Optional. Useful for host-side analytics and tests. |
| `style` | Optional. The allow-listed subset below; unknown keys are dropped. |
| `hidden` | When true, the node and its whole subtree are skipped. |
| `fallback` | Rendered instead of this node when the SDK does not know `type`. |
| `accessibilityLabel` | Optional spoken label. Supports placeholders. See [Accessibility](#accessibility). |

### `stack`

Container. Vertical by default.

| Field | Default | Notes |
|---|---|---|
| `direction` | `vertical` | |
| `gap` | `0` | Points between children. |
| `align` | `stretch` | `start` / `center` / `end` / `stretch` |
| `justify` | `start` | `start` / `center` / `end` / `space-between` |
| `scrollable` | `false` | Vertical stacks only. Ignored elsewhere. |
| `children` | — | Required. May be empty. |

### `text`

`text` is required and supports placeholders. Optional `action` makes it
tappable — this is how you build "Restore" and "Terms" links without a button.
`numberOfLines` truncates.

### `image`

`source.uri` is required. Set `source.prefetch: true` on anything above the
fold: those URLs are warmed as soon as a document is fetched, which is why
calling `paywalls.prefetch(id)` at app start is what keeps holes off the
screen when the paywall opens later. Warming never blocks a render — a slow
image delays nothing, it just arrives uncached. Omit `accessibilityLabel` on
decorative images and the renderer marks them non-accessible, so screen
readers skip past instead of announcing an unlabelled graphic.

### `button`

`label` and `action` are required. `pressedStyle` merges over the base style
while held; `disabledStyle` applies while a purchase or restore is in flight.
The SDK handles the in-flight state itself so you cannot double-charge a user
by tapping twice — and it announces that state, so the button reads as dimmed
*and* disabled rather than silently ignoring taps.

### `packageList`

Renders the selectable rows. Selection state lives in the SDK; the schema only
describes appearance. `packageIds` narrows the set, otherwise every package in
the document is shown in order.

Row styling is flat rather than nested because a row's internal structure is
fixed: badge, title, subtitle. If you need a different row layout, that is a
schema change, not a config change. This is deliberate — it is the boundary
that stops the schema from growing into a full description of React Native.

### `spacer`

`size` for fixed space, `flex` for space that absorbs what's left. `flex` wins
when both are set.

### `divider`

`thickness` and `color`. Nothing else.

---

## Placeholders

Any user-visible string may contain `{{...}}` tokens. They resolve against the
selected package, or — inside a `packageList` row — against that row's package.

| Token | Resolves to |
|---|---|
| `{{package.title}}` | Title from the package definition |
| `{{package.price}}` | Localized price from the store |
| `{{package.period}}` | Localized billing period |
| `{{package.pricePerUnit}}` | Localized per-period price, when available |
| `{{package.introPrice}}` | Localized introductory price, when available |
| `{{package.trialLength}}` | Localized trial duration |

The list is closed. An unknown token, or one the store did not return, renders
as an empty string. It never leaks raw `{{...}}` to the user and never throws —
including for a token that is not merely unknown but malformed, like
`{{package.}}` or `{{price}}`. Proved by
[`src/placeholders.test.ts`](src/placeholders.test.ts).

Write copy that survives an empty token. `"Try free for {{package.trialLength}}"`
degrades to `"Try free for "` when there is no trial — so guard it by putting
trial copy on a package that actually has one, or keep the sentence whole:
`"{{package.trialLength}} free, then {{package.price}}"` reads badly empty.
This is a real footgun and worth a line in your README.

---

## Accessibility

Every node accepts an optional `accessibilityLabel`, and it supports
placeholders like any other user-visible string. Use it when the visible label
is too terse to stand alone:

```jsonc
{
  "type": "button",
  "label": "Try free for {{package.trialLength}}",
  "accessibilityLabel": "Start a {{package.trialLength}} free trial, then {{package.price}} per {{package.period}}",
  "action": { "type": "purchase" }
}
```

This matters more than it looks. A visible label degrades to `"Try free for "`
when the store returns no trial — a sighted user skims past the gap, a screen
reader announces a sentence that stops mid-air. Writing the spoken label as a
complete thought is the cheapest fix.

**Roles are inferred, never authorable.** There is no `accessibilityRole` field.
The renderer already knows a `button` is a button and a `packageList` row is a
radio, and a document fetched from a server should not be able to tell
assistive technology that a purchase button is something else. Same reasoning
that keeps actions as named intents rather than handlers.

| Node | Announced as | Default label | State |
|---|---|---|---|
| `button` | button | the resolved `label` | disabled while a purchase or restore is in flight |
| `text` with an `openURL` action | link | the resolved `text` | — |
| `text` with any other action | button | the resolved `text` | — |
| `text` with no action | static text | the resolved `text` | — |
| `image` with a label | image | `accessibilityLabel` | — |
| `image` without a label | *skipped entirely* | — | — |
| `packageList` row | radio | title, subtitle and badge, joined | selected / not selected |
| `stack`, `spacer`, `divider` | nothing focusable | — | — |

Only `openURL` leaves the app, so only `openURL` is a link. A "Restore" link
looks like a link but behaves as a button, and announcing it as one tells a
screen-reader user to expect a page they will never get.

An explicit `accessibilityLabel` always wins over the default in that table.
Proved by the accessibility block in
[`src/renderNode.test.tsx`](src/renderNode.test.tsx).

---

## Actions

```jsonc
{ "type": "purchase", "packageId": "annual" }  // packageId optional
{ "type": "restore" }
{ "type": "dismiss" }
{ "type": "openURL", "url": "https://example.com/terms" }
```

Four intents, all of which call a host callback. The SDK implements none of
them. `purchase` without `packageId` uses the current selection.

`openURL` accepts `http`, `https` and `mailto` only. Everything else is
dropped at parse time — a fetched document must not be able to trigger a
deep link into your app. The action goes, the node stays: a "Terms" link with
a `javascript:` URL still renders, it just does nothing. Proved by
[`src/validateDocument.test.tsx`](src/validateDocument.test.tsx).

---

## Forward compatibility

The rules that let you keep publishing while old SDK builds are still in the
wild. All of them are "degrade", none of them are "throw".

These rules are part of the public contract, exactly like the function
signatures. Changing a rule here is a breaking change even when no signature
moves. Each rule links to the test that proves it, and the rule and its test
must change in the same commit, in both directions.

**Unknown node type.** Render `fallback` if present, otherwise skip the node
and continue with its siblings. The example document ends with a
`countdownTimer` node — a type that does not exist in v1 — carrying a text
fallback. On a v1 SDK the user sees "Offer ends soon". On a future SDK that
knows the type, they see a live timer. Same document, no branching. Proved by
[`src/validateDocument.test.tsx`](src/validateDocument.test.tsx), which
validates that very document and renders "Offer ends soon" out of it.

**Unknown style key.** Dropped at parse time. Not forwarded to React Native.
This matters for more than tidiness: it stops a newer document from reaching
style props an old SDK never intended to expose. Proved by
[`src/style.test.ts`](src/style.test.ts).

**Unknown action type.** The node still renders, but taps do nothing and an
`onEvent` is emitted so you can see it in analytics. Proved by
[`src/useActionDispatcher.test.ts`](src/useActionDispatcher.test.ts).

**Unknown top-level field.** Preserved but ignored. Proved by
[`src/validateDocument.test.tsx`](src/validateDocument.test.tsx).

**`schemaVersion` higher than the SDK supports.** The document is rejected
whole. The SDK falls back to the last cached document, and if there is none,
to the bundled default the host app shipped with. It never renders a partially
understood document — that is the one case where degrading node by node would
produce something worse than showing nothing new. Proved by
[`src/validateDocument.test.tsx`](src/validateDocument.test.tsx).

### What counts as breaking

Bump `schemaVersion` only for these:

- removing a node type, field or token
- changing the meaning or type of an existing field
- changing a default value
- making an optional field required

Everything else is additive and stays on v1: new node types, new optional
fields, new tokens, new action types. Additive changes are safe precisely
because of the rules above.

### Practical consequence

Once the SDK is on npm and inside someone's shipped app, you no longer control
which version parses your JSON. Treat every field name as permanent from the
day it ships. The cost of a badly named field is that you carry it forever;
the cost of a breaking change is that you split your user base across two
schema versions and maintain both.

---

## Publishing

Serve the document with `Cache-Control: max-age=60`. Sixty seconds is short
enough that a fix reaches users the same minute you publish it, and long enough
that a CDN absorbs a launch spike instead of your origin.

**A fresh document applies on the next show, not instantly.** When a cached
document exists, the SDK renders it immediately and refreshes in the background;
the newly fetched revision is written to cache and takes effect the next time
the paywall opens. This is the deliberate trade for never showing a spinner
where a paywall should be. Plan copy changes a session ahead, and do not use
this as a kill switch. Proved by
[`src/paywallClient.test.ts`](src/paywallClient.test.ts), which asserts the
newer revision reaches the cache while the rendered document stays put.

---

## What the host provides

```ts
interface PaywallHost {
  resolveProducts(productIds: string[]): Promise<ResolvedProduct[]>;
  onPurchase(productId: string): Promise<void>;
  onRestore(): Promise<void>;
  onDismiss(): void;
  onOpenURL?(url: string): void;
  onEvent?(event: PaywallEvent): void;
  onError?(error: unknown): void;
}
```

Every one of these is where your existing purchase stack plugs in. Wire
`onPurchase` to `Purchases.purchaseProduct` if you use RevenueCat, or to
`SKPaymentQueue` if you do not. The SDK stays out of it.

`onError` fires at most once per paywall, and only when there is nothing to
show at all — no fresh document, no cache, no bundled fallback. A failed
background refresh with a paywall already on screen is not an error.

### `onEvent` names

The set is closed.

| Name | Fired when |
|---|---|
| `action_purchase` | A `purchase` action was dispatched to the host |
| `action_restore` | A `restore` action was dispatched to the host |
| `action_dismiss` | A `dismiss` action was dispatched to the host |
| `action_open_url` | An `openURL` action was dispatched to the host |
| `action_unknown` | A node with an unrecognised action type was tapped |
| `select_package` | The user selected a different package |
| `resolve_products_failed` | `resolveProducts` rejected; tokens stay empty |
| `refresh_failed` | A background refresh failed; the screen is unaffected |
| `bundled_shown` | The network lost the cold-start race and `bundled` was shown |
| `host_callback_timeout` | A host purchase/restore promise never settled |

## Storage

```ts
interface StorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}
```

Defaults to in-memory, which is why the package has no dependencies. Pass an
AsyncStorage or MMKV adapter in two lines if you want the cache to survive an
app restart — and you do, because that is what makes the second launch render
instantly and work offline.

`set` must be atomic per key: a reader either sees the previous value or the
new one, never a half-written document. Both AsyncStorage and MMKV satisfy
this. Keys are namespaced `rnrp:v1:doc:<id>`, and the `v1` segment means a
future change to the cache envelope simply misses the old entries instead of
deserializing them into new code.

A `get` that rejects, returns junk, or returns a document that no longer
validates all read the same way — as "no cache" — so a corrupt entry costs a
network round trip, never a crash. Proved by
[`src/documentCache.test.ts`](src/documentCache.test.ts).
