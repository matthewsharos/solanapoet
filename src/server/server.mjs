// This file is used to run the TypeScript server with Node.js in ES modules mode
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Use ts-node/register to handle TypeScript files
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'CommonJS'
  }
});

// Import and run the TypeScript server
import('./index.ts'); 