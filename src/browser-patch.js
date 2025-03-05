// This file patches browser implementations of Node.js built-ins
// to fix specific errors like the one with readable-stream/_stream_writable.js

// Fix for the "Cannot read properties of undefined (reading 'slice')" error
// in browserify-sign/node_modules/readable-stream/lib/_stream_writable.js
try {
  // Add missing implementations
  if (typeof window !== 'undefined') {
    if (!window.process) {
      window.process = {};
    }
    
    if (!window.process.nextTick) {
      window.process.nextTick = function(fn) {
        setTimeout(fn, 0);
      };
    }
    
    if (!window.process.version) {
      window.process.version = '';
    }
    
    if (!window.process.env) {
      window.process.env = {};
    }

    // Create Buffer polyfill if needed
    if (!window.Buffer) {
      window.Buffer = require('buffer/').Buffer;
    }
    
    // Fix for readable-stream
    const WritablePrototype = {
      pipe: function() {},
      write: function() { return true; },
      end: function() { return true; },
      cork: function() {},
      uncork: function() {},
      on: function() { return this; },
      once: function() { return this; },
      emit: function() { return true; },
      prependListener: function() { return this; },
      destroy: function() {}
    };
    
    // Attempt to patch readable-stream
    try {
      const pathToFix = 'readable-stream/lib/_stream_writable';
      const mod = require(pathToFix);
      if (mod && mod.prototype === undefined) {
        mod.prototype = WritablePrototype;
        console.log('Successfully patched readable-stream');
      }
    } catch (err) {
      console.warn('Could not directly patch readable-stream', err);
    }
  }
} catch (e) {
  console.warn('Browser polyfill patch error:', e);
}

export default {}; 