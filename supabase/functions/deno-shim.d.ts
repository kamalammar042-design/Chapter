// Type-checking shim: lets `tsc` check Edge Functions from Node. The real
// runtime is Deno, which provides these globals natively.
declare namespace Deno {
  const env: { get(name: string): string | undefined };
  function serve(handler: (req: Request) => Response | Promise<Response>): unknown;
}
