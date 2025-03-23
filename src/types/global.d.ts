declare global {
  interface Window {
    Buffer: typeof Buffer;
    process: typeof process;
    global: typeof globalThis;
    require?: (modulePath: string) => any;
    ReadableStream: any;
    crypto: Crypto;
    TextEncoder: typeof TextEncoder;
    TextDecoder: typeof TextDecoder;
    nftImageCache: Map<string, boolean>;
  }
}

declare module 'stream-browserify' {
  import { Readable, Writable, Transform, Duplex, PassThrough } from 'stream';
  export {
    Readable,
    Writable,
    Transform,
    Duplex,
    PassThrough
  };
}

declare module 'readable-stream' {
  import { Readable, Writable, Transform, Duplex, PassThrough } from 'stream';
  export class Writable {
    constructor(options?: any);
    _write(chunk: any, encoding: string, callback: (error?: Error | null) => void): void;
    write(chunk: any, encoding?: string | ((error?: Error | null) => void), cb?: (error?: Error | null) => void): boolean;
    end(chunk?: any, encoding?: string | Function, cb?: Function): this;
    cork(): void;
    uncork(): void;
    destroy(): void;
    on(event: string, listener: Function): this;
    once(event: string, listener: Function): this;
    emit(event: string, ...args: any[]): boolean;
    prependListener(event: string, listener: Function): this;
    pipe(dest: any, options?: { end?: boolean }): any;
  }
  export {
    Readable,
    Transform,
    Duplex,
    PassThrough
  };
}

export {}; 