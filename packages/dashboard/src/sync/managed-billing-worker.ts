import { workerData } from 'node:worker_threads';
import { updateManagedBilling, type ManagedBillingInput } from './managed-billing';

updateManagedBilling(workerData as ManagedBillingInput, Date.now(), false);
