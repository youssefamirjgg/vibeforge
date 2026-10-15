
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Youssef Amir

import readline from 'node:readline';

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (open, close) => (s) => (useColor ? `\x1b[${open}m${s}\x1b[${close}m` : String(s));

export const c = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  cyan: wrap(36, 39),
  magenta: wrap(35, 39),
};

export const log = (...a) => console.log(...a);
export const warn = (m) => console.error(c.yellow(`! ${m}`));
export const fail = (m) => console.error(c.red(`✖ ${m}`));

export function spinner(text) {
  if (!process.stderr.isTTY) {
    console.error(`… ${text}`);
    return { stop() {} };
  }
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const t = setInterval(() => {
    process.stderr.write(`\r${c.cyan(frames[i++ % frames.length])} ${text}`);
  }, 80);
  return {
    stop() {
      clearInterval(t);
      process.stderr.write('\r\x1b[K');
    },
  };
}

/** Ask a yes/no question. Defaults to "no". */
export function confirm(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${question} ${c.dim('[y/N]')} `, (ans) => {
      rl.close();
      resolve(/^y(es)?$/i.test(ans.trim()));
    });
  });
}

/** Read a secret without echoing it to the terminal. */
export function promptHidden(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      // piped input: read everything, use the first line
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (d) => (data += d));
      process.stdin.on('end', () => resolve(data.split(/\r?\n/)[0].trim()));
      process.stdin.on('error', reject);
      return;
    }
    process.stdout.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    let buf = '';
    const onData = (ch) => {
      for (const k of ch) {
        if (k === '\r' || k === '\n') {
          done();
          return resolve(buf.trim());
        }
        if (k === '\u0003') {
          done();
          return reject(new Error('cancelled'));
        }
        if (k === '\u007f' || k === '\b') buf = buf.slice(0, -1);
        else buf += k;
      }
    };
    const done = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      process.stdout.write('\n');
    };
    process.stdin.on('data', onData);
  });
}
