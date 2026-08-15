declare module 'webdav/web' {
  export function createClient(
    remoteURL: string,
    options?: Record<string, unknown>
  ): unknown;
}
