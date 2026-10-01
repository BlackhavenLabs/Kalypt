#!/usr/bin/env node
import { main } from '../src/cli.js';

main(process.argv.slice(2)).catch((error) => {
  console.error(`kalypt: ${error?.message ?? error}`);
  if (process.env.KALYPT_DEBUG) console.error(error?.stack);
  process.exitCode = 1;
});
