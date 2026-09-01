/**
 * The few Node APIs the test suite reads files with.
 *
 * `@types/node` is deliberately absent from tsconfig's `types`. Pulling it in
 * would put Node's globals in scope for library code too, where `setTimeout`
 * is retyped to return a `NodeJS.Timeout` and `process` and `Buffer` look
 * available — all of which typecheck on a laptop and are absent on a device.
 * Declaring only what the tests use keeps that door shut.
 */

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
