import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const home = os.homedir();
const cliPath = 'C:/nvm4w/nodejs/node_modules/command-code/dist/cli.mjs';

console.log('--- Checking CLI.mjs Pricing ---');
if (fs.existsSync(cliPath)) {
  const content = fs.readFileSync(cliPath, 'utf8');
  const regex = /"([^"\n]+)":\{inputCost:([\d.eE+-]+),outputCost:([\d.eE+-]+)((?:,[a-zA-Z]+Cost:[\d.eE+-]+)*)\}/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const [, model, input, output, extras] = match;
    if (model.includes('deepseek') || model.includes('mimo') || model.includes('glm')) {
      console.log(`Model: ${model} -> input: ${input}, output: ${output}, extras: ${extras}`);
    }
  }
} else {
  console.log('CLI.mjs not found at:', cliPath);
}

console.log('\n--- Checking ~/.commandcode/config.json ---');
const configPath = path.join(home, '.commandcode', 'config.json');
if (fs.existsSync(configPath)) {
  console.log(fs.readFileSync(configPath, 'utf8'));
}
