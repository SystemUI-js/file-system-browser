declare module 'webdav/web' {
  export function createClient(
    URL: string,
    options?: {
      authType?: 'auto' | 'digest' | 'none' | 'password' | 'token';
      username?: string;
      password?: string;
      headers?: Record<string, string>;
      fetch?: typeof fetch;
      withCredentials?: boolean;
    }
  ): unknown;
}
