
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Youssef Amir

import fs from 'node:fs';
import path from 'node:path';

export const LIMITS = {
  maxFiles: 80,
  maxFileBytes: 500 * 1024,
  maxTotalBytes: 3 * 1024 * 1024,
};

const BLOCKED_SEGMENTS = new Set(['..', '.git', 'node_modules']);

/** Turn a model-supplied relative path into an absolute path that is guaranteed to stay inside root. */
export function resolveSafe(root, rel) {
  if (typeof rel !== 'string' || !rel.trim()) throw new Error('empty file path');
  if (rel.includes('\0')) throw new Error(`invalid path: ${JSON.stringify(rel)}`);
  const norm = rel.replace(/\\/g, '/');
  if (norm.startsWith('/') || /^[a-zA-Z]:/.test(norm)) {
    throw new Error(`absolute paths are not allowed: ${rel}`);
  }
  const parts = norm.split('/').filter((p) => p && p !== '.');
  if (!parts.length) throw new Error(`invalid path: ${rel}`);
  if (parts.some((p) => BLOCKED_SEGMENTS.has(p))) {
    throw new Error(`path not allowed: ${rel}`);
  }
  const full = path.resolve(root, ...parts);
  const back = path.relative(root, full);
  if (!back || back.startsWith('..') || path.isAbsolute(back)) {
    throw new Error(`path escapes project directory: ${rel}`);
  }
  return full;
}

/** Validate the model output and decide what would happen to each file. */
export function planWrites(root, files) {
  if (!Array.isArray(files) || files.length === 0) throw new Error('The model returned no files.');
  if (files.length > LIMITS.maxFiles) {
    throw new Error(`Too many files (${files.length} > ${LIMITS.maxFiles}).`);
  }
  const seen = new Set();
  let total = 0;
  return files.map((f) => {
    if (typeof f?.content !== 'string') throw new Error(`file has no text content: ${f?.path}`);
    const abs = resolveSafe(root, f.path);
    if (seen.has(abs)) throw new Error(`duplicate file in response: ${f.path}`);
    seen.add(abs);
    const bytes = Buffer.byteLength(f.content);
    if (bytes > LIMITS.maxFileBytes) throw new Error(`file too large: ${f.path}`);
    total += bytes;
    if (total > LIMITS.maxTotalBytes) throw new Error('Total output too large.');
    let status = 'new';
    try {
      const st = fs.lstatSync(abs);
      if (st.isSymbolicLink()) throw new Error(`refusing to write through symlink: ${f.path}`);
      if (st.isDirectory()) throw new Error(`a directory already exists at: ${f.path}`);
      status = 'overwrite';
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    return { rel: path.relative(root, abs).split(path.sep).join('/'), abs, content: f.content, bytes, status };
  });
}

/** Write a validated plan to disk. Re-checks the real path of each parent to defeat symlink tricks. */
export function applyWrites(root, plan) {
  fs.mkdirSync(root, { recursive: true });
  const realRoot = fs.realpathSync(root);
  for (const item of plan) {
    const dir = path.dirname(item.abs);
    fs.mkdirSync(dir, { recursive: true });
    const realDir = fs.realpathSync(dir);
    const back = path.relative(realRoot, realDir);
    if (back.startsWith('..') || path.isAbsolute(back)) {
      throw new Error(`path escapes project directory: ${item.rel}`);
    }
    fs.writeFileSync(item.abs, item.content);
  }
}

/** Turn an arbitrary model-suggested name into a safe directory name. */
export function slugify(name, fallback = 'vibeforge-project') {
  const s = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return s || fallback;
}

export function isEmptyDir(dir) {
  try {
    return fs.readdirSync(dir).length === 0;
  } catch (e) {
    if (e.code === 'ENOENT') return true;
    throw e;
  }
}
