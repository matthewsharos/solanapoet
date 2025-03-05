// This file is used to run the TypeScript server with Node.js
// It registers ts-node to handle TypeScript files
require('ts-node').register({
  transpileOnly: true,
  esm: true,
  compilerOptions: {
    module: 'CommonJS'
  }
});

// Import and run the TypeScript server
require('./index.ts'); 