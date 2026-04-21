/**
 * Minimal `Deno` typings for Supabase Edge Functions. Runtime is real Deno; the workspace
 * TypeScript server does not resolve `jsr:@supabase/functions-js/edge-runtime.d.ts`.
 */
declare namespace Deno {
  export function serve(
    handler: (request: Request) => Response | Promise<Response>,
  ): void;
  export namespace env {
    export function get(key: string): string | undefined;
  }
}
