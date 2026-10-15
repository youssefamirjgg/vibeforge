
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Youssef Amir

import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv', 'venv', 'coverage', '.vibeforge']);
const SKIP_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']);
const MAX_FILE_BYTES = 60 * 1024;
const MAX_TOTAL_BYTES = 200 * 1024;
const MAX_FILES = 60;

function looksBinary(buf) {
  return buf.subarray(0, 4000).includes(0);
}

/** Read the text files of an existing project so the model can edit it. */
export function readProject(root) {
  const out = [];
  let total = 0;
  let skipped = 0;

  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(abs);
        continue;
      }
      if (!e.isFile() || SKIP_FILES.has(e.name) || e.name === '.env' || e.name.startsWith('.env.')) continue;
      if (out.length >= MAX_FILES) {
        skipped++;
        continue;
      }
      const st = fs.statSync(abs);
      if (st.size > MAX_FILE_BYTES || total + st.size > MAX_TOTAL_BYTES) {
        skipped++;
        continue;
      }
      const buf = fs.readFileSync(abs);
      if (looksBinary(buf)) continue;
      total += st.size;
      out.push({ path: path.relative(root, abs).split(path.sep).join('/'), content: buf.toString('utf8') });
    }
  };

  walk(root);
  return { files: out, skipped };
}

export function formatProject(files) {
  return files.map((f) => `=== FILE: ${f.path} ===\n${f.content}\n=== END FILE ===`).join('\n\n');
}
