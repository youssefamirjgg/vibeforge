#!/usr/bin/env node
import { main } from '../src/cli.js';

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Youssef Amir

const major = Number(process.versions.node.split('.')[0]);
if (major < 18) {
  console.error('vibeforge needs Node.js 18 or newer.');
  process.exit(1);
}

// Set exitCode and let the event loop drain instead of calling process.exit():
// on Windows, exiting while fetch() sockets are still closing can crash Node with
// "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)".
main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code ?? 0;
  },
  (err) => {
    console.error(err?.message || err);
    process.exitCode = 1;
  },
);