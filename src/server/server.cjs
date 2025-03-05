// This file is used to run the TypeScript server with Node.js in CommonJS mode
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'CommonJS'
  }
});

// Import and run the TypeScript server
require('./index.ts'); 