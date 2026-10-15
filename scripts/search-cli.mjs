import fs from 'node:fs';

const content = fs.readFileSync('C:/nvm4w/nodejs/node_modules/command-code/dist/cli.mjs', 'utf8');

// Search for api.commandcode.ai calls related to usage, limits, subscriptions
const matches = [...content.matchAll(/\/api\/[a-zA-Z0-9_\-\/]+|\/v1\/[a-zA-Z0-9_\-\/]+/g)];
const endpoints = new Set(matches.map(m => m[0]));
console.log('API Endpoints found:');
for (const ep of endpoints) {
  if (ep.includes('usage') || ep.includes('limit') || ep.includes('sub') || ep.includes('plan') || ep.includes('credit') || ep.includes('bill') || ep.includes('me') || ep.includes('user')) {
    console.log('  ', ep);
  }
}
