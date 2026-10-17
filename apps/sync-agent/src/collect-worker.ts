import {parentPort,workerData} from 'node:worker_threads';
import {captureHome} from '../../../packages/dashboard/src/agent/capture';
captureHome(workerData.home,workerData.snapshot,workerData.allowed,workerData.parents).then(result=>parentPort?.postMessage({result})).catch(()=>parentPort?.postMessage({error:'SOURCE_CAPTURE_FAILED'}));
