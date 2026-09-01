# react-native-remote-paywall

Update your React Native paywall without shipping an app update. Zero dependencies.

Your paywall is a JSON document you host. The SDK fetches it, validates it,
caches it, and renders it into React Native primitives. Change the headline,
the trial framing, the order of the plans — publish the JSON, and the next
person who opens the paywall sees it. No release, no review, no staged rollout.

- **Zero runtime dependencies.** `react` and `react-native` are peers. Nothing
  else ships, so nothing else can break your build.
- **No code crosses the wire.** Nodes are data; buttons carry named intents,
  not handlers. There is no expression language and nothing to `eval` — which
  is what keeps this on the right side of App Store rule 2.5.2.
- **Never a blank screen.** Fresh document → last cached document → the copy
  you shipped in the binary. In that order, every time.
- **Your purchase stack stays yours.** The SDK never talks to StoreKit or Play
  Billing. It calls your callbacks and gets out of the way.

## Installation

```sh
npm install react-native-remote-paywall
```

## Quick start

```tsx
import {
  createPaywallClient,
  RemotePaywall,
} from 'react-native-remote-paywall';
import defaultPaywall from './paywalls/default.json';

const paywalls = createPaywallClient({
  // → https://cdn.example.com/paywalls/default.json
  endpoint: 'https://cdn.example.com/paywalls',

  // Shipped inside the binary. The last line of defence — see below.
  bundled: { default: defaultPaywall },

  host: {
    resolveProducts: async (productIds) => askYourStore(productIds),
    onPurchase: async (productId) => purchases.buy(productId),
    onRestore: async () => purchases.restore(),
    onDismiss: () => navigation.goBack(),
  },
});

// At app start: warms the document, its products and its images, so the
// paywall opens instantly later. Failures here are swallowed by design.
paywalls.prefetch('default');

// Wherever the paywall belongs.
<RemotePaywall client={paywalls} id="default" />;
```

`createPaywallClient` takes:

| Option | Default | Notes |
|---|---|---|
| `endpoint` | — | Document URL is `` `${endpoint}/${id}.json` ``. Required unless `buildUrl` is given. |
| `buildUrl` | — | `(id) => string`. Full override when your URLs don't follow that shape. |
| `host` | — | Required. Your purchase stack — see below. |
| `bundled` | `{}` | `{ [id]: PaywallDocument }` shipped in the binary. |
| `storage` | in-memory | Anything with `get`/`set` — see below. |
| `requestTimeoutMs` | `10000` | Aborts the fetch. |
| `coldStartTimeoutMs` | `700` | Bounds the first-show wait. Never aborts the fetch. |

It throws if you supply neither `endpoint` nor `buildUrl`, and `id` must match
`^[a-zA-Z0-9_-]{1,64}$`. Those are the only two throws in the SDK, and both
fire on a developer's first run rather than in a user's hands. Everything
else degrades.

`<RemotePaywall>` takes `client`, `id`, and optional `renderLoading` /
`renderError` render props. Both default to rendering nothing.

## What renders, and when

The whole point of the library is the answer to "what does the user see while
the network is being the network". There are three cases, and the SDK picks
between them for you:

| State on open | What shows | What happens behind it |
|---|---|---|
| A cached document exists | The cached document, immediately | Refreshes in the background; the new revision lands in cache for the next open |
| No cache, but `bundled` has this id | The network document if it arrives within `coldStartTimeoutMs`, otherwise the bundled one | The losing fetch keeps going and writes cache for the next launch |
| Neither | `renderLoading()` until the fetch lands | On success, the document; on failure, `renderError()` and one `onError` call |

A paywall never waits on the network longer than `coldStartTimeoutMs` when it
has *anything* better to show. That is the entire design.

## Wiring your purchase stack

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

Prices come from `resolveProducts`, never from the document — that is how
`{{package.price}}` shows the right currency for the user's storefront without
your server knowing anything about storefronts.

While `onPurchase` or `onRestore` is in flight the SDK holds a busy lock:
buttons disable, a second tap in the same tick is dropped, and the button
announces itself as disabled rather than silently ignoring taps. `onDismiss`
and `onOpenURL` are deliberately *not* gated — a host promise that never
settles must not trap the user on the screen. If one never settles, a 30 s
watchdog releases the lock and emits `host_callback_timeout`.

`onError` fires at most once per paywall, and only when there is nothing to
show at all. A failed background refresh with a paywall already on screen is
not an error.

## Persisting the cache

Storage defaults to in-memory, which is what keeps the dependency count at
zero. Pass a real adapter and the cache survives an app restart — which is
what makes the second launch render instantly and work on a plane:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

storage: {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
},
```

Or with MMKV:

```ts
const mmkv = new MMKV();

storage: {
  get: async (key) => mmkv.getString(key) ?? null,
  set: async (key, value) => { mmkv.set(key, value); },
},
```

`set` must be atomic per key — a reader sees the old value or the new one,
never half a document. Both of the above are. Keys are namespaced
`rnrp:v1:doc:<id>`.

## Publishing the document

Serve it with `Cache-Control: max-age=60`. Sixty seconds is short enough that
a fix reaches users the same minute you publish it, and long enough that a CDN
absorbs a launch spike instead of your origin.

**Ship a `bundled` document for every id you use.** It is not a nicety. It is
what the user sees on a first launch with no network, and it is the reason
this library never renders a blank screen. Worst case, someone sees a paywall
a year out of date — which still sells, where a spinner does not.

## Two things that will bite you

**An empty placeholder renders as an empty string.**
`"Try free for {{package.trialLength}}"` becomes `"Try free for "` when the
store returns no trial. It never leaks the raw `{{...}}` and never throws, but
it will happily show you half a sentence. Write copy that survives the token
being empty, or put trial copy only on packages that have one.

**A fresh document applies on the next show, not instantly.** When a cached
document exists, the SDK renders it immediately and refreshes in the
background; the new revision takes effect the next time the paywall opens.
This is the deliberate trade for never showing a spinner where a paywall
should be. Plan copy changes a session ahead — and do not use this as a kill
switch.

## The document format

[`SCHEMA.md`](SCHEMA.md) is the contract: seven node types, a closed
placeholder set, four actions, and the forward-compatibility rules that let a
document published today render on a build shipped a year ago. Each rule there
links to the test that proves it.

A complete document you can copy and edit lives in
[`templates/example.json`](templates/example.json), and
[`example/`](example/) is an Expo app that runs the whole
fetch → validate → cache → render path against it.

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT
