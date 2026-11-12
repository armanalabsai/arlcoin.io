// Types of whitelist.mjs (a plain module so the Pages Function can import it without a build).
export interface D1Like {
  prepare(sql: string): {
    first(): Promise<unknown>;
    bind(...values: unknown[]): { run(): Promise<unknown> };
  };
}
export declare const THROTTLE_LIMIT: number;
export declare const THROTTLE_MINUTES: number;
export declare function parseRegistration(
  body: unknown,
): { wallet: string; email: string; notice: string } | null;
export declare function handle(request: Request, db: D1Like | undefined): Promise<Response>;
