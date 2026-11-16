import { Worker } from '@temporalio/worker';
import * as activities from '../activities/index';

async function run() {
  const taskQueue = process.env.TEMPORAL_TASK_QUEUE || 'mine-os-core';
  const worker = await Worker.create({
    workflowsPath: new URL('../workflows', import.meta.url).pathname,
    activities,
    taskQueue,
  });
  await worker.run();
}

run().catch((err) => { console.error(err); process.exit(1); });
