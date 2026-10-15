
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Youssef Amir

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_MODEL = 'gemini-3.8-flash';

export function configDir() {
  return process.env.VIBEFORGE_HOME || path.join(os.homedir(), '.vibeforge');
}

function configFile() {
  return path.join(configDir(), 'config.json');
}

export function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile(), 'utf8'));
  } catch {
    return {};
  }
}

export function writeConfig(cfg) {
  const dir = configDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = configFile();
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
  // writeFileSync only applies the mode on creation; enforce it on existing files too.
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* best effort (e.g. Windows) */
  }
}

export function getApiKey() {
  return process.env.GEMINI_API_KEY || readConfig().apiKey || null;
}

export function getModel() {
  return process.env.VIBEFORGE_MODEL || readConfig().model || DEFAULT_MODEL;
}

export function maskKey(key) {
  if (!key) return '(not set)';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}
