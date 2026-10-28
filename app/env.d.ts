declare namespace Cloudflare {
  interface Env {
    GOOGLE_CLIENT_SECRET: string;
    SESSION_SECRET: string;
  }
}

declare module 'virtual:prerender-runtime' {
  const runtime: ExportedHandler<Env>;
  export default runtime;
}
