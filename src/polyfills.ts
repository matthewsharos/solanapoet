// Essential polyfills
import { Buffer } from 'buffer';
import process from 'process';
import * as stream from 'stream-browserify';
import util from 'util';
import events from 'events';

// Ensure Buffer is available globally
if (typeof window !== 'undefined') {
  window.Buffer = window.Buffer || Buffer;
}

// Ensure process is available globally
if (typeof window !== 'undefined') {
  window.process = window.process || process;
}

// Ensure global is available
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.global = window.global || window;
}

// Polyfill TextEncoder and TextDecoder if not available
if (typeof window !== 'undefined') {
  if (typeof window.TextEncoder === 'undefined') {
    window.TextEncoder = util.TextEncoder;
  }
  if (typeof window.TextDecoder === 'undefined') {
    window.TextDecoder = util.TextDecoder;
  }
}

// Polyfill ReadableStream if not available
if (typeof window !== 'undefined' && typeof window.ReadableStream === 'undefined') {
  // @ts-ignore
  window.ReadableStream = stream.Readable;
}

// Export for type declarations
export {
  Buffer,
  process,
  stream,
  util,
  events
}; 