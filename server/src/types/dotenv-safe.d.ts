declare module 'dotenv-safe' {
  interface DotenvSafeOptions {
    path?: string;
    example?: string;
    allowEmptyValues?: boolean;
    sample?: string;
  }
  function config(options?: DotenvSafeOptions): { parsed: Record<string, string> };
  export = { config };
}
