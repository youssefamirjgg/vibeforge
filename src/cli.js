
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Youssef Amir

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { getApiKey, getModel, maskKey, readConfig, writeConfig, DEFAULT_MODEL } from './config.js';
import { generateProject } from './gemini.js';
import { BUILD_SYSTEM, EDIT_SYSTEM } from './prompts.js';
import { readProject, formatProject } from './context.js';
import { planWrites, applyWrites, slugify, isEmptyDir } from './writer.js';
import { c, log, warn, fail, spinner, confirm, promptHidden } from './ui.js';

const pkg = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));

const HELP = `
${c.bold('vibeforge')} ${c.dim(`v${pkg.version}`)}  –  describe it, Gemini builds it.

${c.bold('Usage')}
  vibeforge login                      save your Gemini API key (hidden input)
  vibeforge build "<what you want>"    create a new project in a new folder
  vibeforge edit  "<what to change>"   modify the project in the current folder
  vibeforge config                     show current settings
  vibeforge config model <name>        change the default model (default: ${DEFAULT_MODEL})
  vibeforge logout                     remove the saved key

${c.bold('Options')}
  -o, --out <dir>     output folder for build (default: name chosen by the model)
  -m, --model <name>  model to use for this run
  -f, --force         build: allow writing into a non-empty folder
  -y, --yes           edit: skip the confirmation prompt
  -n, --dry-run       show the files that would be written, write nothing
  -h, --help          show this help
  -v, --version       show version

${c.bold('Examples')}
  vibeforge build "a personal portfolio website with dark mode"
  vibeforge build "python script that renames photos by date taken" -o photo-renamer
  vibeforge edit "add a contact form and a footer"

Get a free key at ${c.cyan('https://aistudio.google.com/apikey')}
You can also set the ${c.bold('GEMINI_API_KEY')} environment variable instead of using login.
`;

const OPTIONS = {
  out: { type: 'string', short: 'o' },
  model: { type: 'string', short: 'm' },
  force: { type: 'boolean', short: 'f' },
  yes: { type: 'boolean', short: 'y' },
  'dry-run': { type: 'boolean', short: 'n' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
};

function requireKey() {
  const key = getApiKey();
  if (!key) {
    throw new Error('No Gemini API key found. Run `vibeforge login` or set GEMINI_API_KEY.');
  }
  return key;
}

function printPlan(plan) {
  for (const f of plan) {
    const tag = f.status === 'new' ? c.green('+ new      ') : c.yellow('~ overwrite');
    log(`  ${tag} ${f.rel} ${c.dim(`(${f.bytes} B)`)}`);
  }
}

async function cmdLogin() {
  log(`Get a key at ${c.cyan('https://aistudio.google.com/apikey')}`);
  const key = await promptHidden('Paste your Gemini API key (hidden): ');
  if (!key) throw new Error('No key entered.');
  if (/\s/.test(key) || key.length < 20) throw new Error("That doesn't look like a valid API key.");
  writeConfig({ ...readConfig(), apiKey: key });
  const where = process.platform === 'win32' ? ' to .vibeforge\\config.json in your user folder' : ' to ~/.vibeforge/config.json (owner-only permissions)';
  log(c.green(`✔ Saved ${maskKey(key)}`) + c.dim(where));
}

function cmdLogout() {
  const cfg = readConfig();
  delete cfg.apiKey;
  writeConfig(cfg);
  log(c.green('✔ Key removed.'));
}

function cmdConfig(args) {
  const [sub, value] = args;
  if (sub === 'model') {
    if (!value) throw new Error('Usage: vibeforge config model <name>');
    writeConfig({ ...readConfig(), model: value });
    log(c.green(`✔ Default model set to ${value}`));
    return;
  }
  if (sub) throw new Error(`Unknown config option: ${sub}`);
  log(`${c.bold('API key')}  ${maskKey(getApiKey())}${process.env.GEMINI_API_KEY ? c.dim('  (from GEMINI_API_KEY)') : ''}`);
  log(`${c.bold('Model')}    ${getModel()}`);
}

async function cmdBuild(prompt, opts) {
  const apiKey = requireKey();
  const model = opts.model || getModel();

  const sp = spinner(`Forging with ${model}…`);
  let result;
  try {
    result = await generateProject({ apiKey, model, system: BUILD_SYSTEM, prompt });
  } finally {
    sp.stop();
  }

  const dirName = opts.out || slugify(result.project_name);
  const root = path.resolve(process.cwd(), dirName);
  if (!opts.force && !opts['dry-run'] && !isEmptyDir(root)) {
    throw new Error(`Folder "${dirName}" is not empty. Use --out <dir> to pick another one, or --force to overwrite.`);
  }

  const plan = planWrites(root, result.files);
  log(`\n${c.bold(result.summary || 'Done.')}\n`);
  printPlan(plan);

  if (opts['dry-run']) {
    log(c.dim('\n(dry run – nothing written)'));
    return;
  }
  applyWrites(root, plan);
  log(`\n${c.green('✔')} Wrote ${plan.length} file${plan.length === 1 ? '' : 's'} to ${c.bold(path.relative(process.cwd(), root) || '.')}`);
  const steps = Array.isArray(result.next_steps) ? result.next_steps.filter((s) => typeof s === 'string') : [];
  if (steps.length) {
    log(`\n${c.bold('Next steps')}`);
    log(`  ${c.cyan(`cd ${path.relative(process.cwd(), root) || '.'}`)}`);
    for (const s of steps) log(`  ${c.cyan(s)}`);
  }
}

async function cmdEdit(prompt, opts) {
  const apiKey = requireKey();
  const model = opts.model || getModel();
  const root = process.cwd();

  const { files: existing, skipped } = readProject(root);
  if (!existing.length) throw new Error('No readable text files found here. Use `vibeforge build` for a new project.');
  if (skipped) warn(`${skipped} large or extra file(s) were not sent to the model.`);

  const fullPrompt = `Current project files:\n\n${formatProject(existing)}\n\nRequested change:\n${prompt}`;
  const sp = spinner(`Editing with ${model}…`);
  let result;
  try {
    result = await generateProject({ apiKey, model, system: EDIT_SYSTEM, prompt: fullPrompt });
  } finally {
    sp.stop();
  }

  const plan = planWrites(root, result.files);
  log(`\n${c.bold(result.summary || 'Done.')}\n`);
  printPlan(plan);

  if (opts['dry-run']) {
    log(c.dim('\n(dry run – nothing written)'));
    return;
  }
  if (!opts.yes) {
    if (!process.stdin.isTTY) throw new Error('Non-interactive shell: re-run with --yes to apply the changes.');
    if (!(await confirm('\nApply these changes?'))) {
      log('Cancelled. Nothing was written.');
      return;
    }
  }
  applyWrites(root, plan);
  log(`${c.green('✔')} Applied ${plan.length} change${plan.length === 1 ? '' : 's'}.`);
  const steps = Array.isArray(result.next_steps) ? result.next_steps.filter((s) => typeof s === 'string') : [];
  for (const s of steps) log(`  ${c.cyan(s)}`);
}

export async function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  } catch (e) {
    fail(e.message);
    log(HELP);
    return 1;
  }
  const { values: opts, positionals } = parsed;

  if (opts.version) {
    log(pkg.version);
    return 0;
  }
  const [cmd, ...rest] = positionals;
  if (opts.help || !cmd || cmd === 'help') {
    log(HELP);
    return 0;
  }

  try {
    switch (cmd) {
      case 'login':
        await cmdLogin();
        break;
      case 'logout':
        cmdLogout();
        break;
      case 'config':
        cmdConfig(rest);
        break;
      case 'build':
      case 'edit': {
        const prompt = rest.join(' ').trim();
        if (!prompt) throw new Error(`Tell me what to ${cmd}. Example: vibeforge ${cmd} "a todo app"`);
        if (prompt.length > 8000) throw new Error('Request is too long (max 8000 characters).');
        await (cmd === 'build' ? cmdBuild(prompt, opts) : cmdEdit(prompt, opts));
        break;
      }
      default:
        throw new Error(`Unknown command: ${cmd}. Run \`vibeforge --help\`.`);
    }
  } catch (e) {
    fail(e.message);
    if (e.status === 404) {
      log(c.dim('Hint: this model may be retired or unavailable to you. Pick another with: vibeforge config model <name>'));
    }
    return 1;
  }
}
