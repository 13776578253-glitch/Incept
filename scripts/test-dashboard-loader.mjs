import os from 'node:os';
import { loadLocalPricingMap } from '../packages/dashboard/src/adapters/local/pricing.js';
import { collectCommandCodeEvents } from '../packages/dashboard/src/adapters/local/collectors/commandcode.js';

const home = os.homedir();
console.log('Testing Dashboard Loader...');
