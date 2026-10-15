# ⚒️ vibeforge

[![npm](https://img.shields.io/npm/v/vibeforge-cli)](https://www.npmjs.com/package/vibeforge-cli)
[![license](https://img.shields.io/npm/l/vibeforge-cli)](LICENSE)

**Describe what you want. Gemini builds the whole project on your disk.**

A tiny, zero‑dependency CLI: save your Gemini API key once, then ask for anything — a portfolio website, a Python script, a small game — and get real files in a new folder, ready to run.

```console
$ vibeforge login
$ vibeforge build "a personal portfolio website with dark mode and a projects grid"

A responsive dark-mode portfolio with a projects grid and contact section.

  + new       index.html (4210 B)
  + new       css/style.css (3120 B)
  + new       js/main.js (860 B)
  + new       README.md (540 B)

✔ Wrote 4 files to personal-portfolio

Next steps
  cd personal-portfolio
  open index.html
```

## Install

Requires **Node.js 18.3+**.

```bash
npm install -g vibeforge-cli
# or run without installing:
npx vibeforge-cli --help
```

> The npm package is called `vibeforge-cli`, but the command you type is just **`vibeforge`**.

From source:

```bash
git clone https://github.com/youssefamirgg/vibeforge && cd vibeforge
npm link
```

## Setup (once)

Get a free key from [Google AI Studio](https://aistudio.google.com/apikey), then:

```bash
vibeforge login          # hidden input, saved in a .vibeforge folder in your home directory
```

Prefer environment variables? `export GEMINI_API_KEY=...` works too and takes priority
(on Windows PowerShell: `$env:GEMINI_API_KEY="..."`).

## Usage

| Command | What it does |
| --- | --- |
| `vibeforge build "<idea>"` | Create a new project in a new folder |
| `vibeforge edit "<change>"` | Modify the project in the current folder (asks before writing) |
| `vibeforge login` / `logout` | Save / remove your API key |
| `vibeforge config` | Show the key (masked) and model |
| `vibeforge config model <name>` | Change the default Gemini model |

| Option | Meaning |
| --- | --- |
| `-o, --out <dir>` | Output folder for `build` |
| `-m, --model <name>` | Model for this run (default `gemini-3.8-flash`, or `VIBEFORGE_MODEL`) |
| `-n, --dry-run` | Show which files would be written, write nothing |
| `-f, --force` | `build` into a non‑empty folder |
| `-y, --yes` | `edit` without the confirmation prompt |

### Examples

```bash
vibeforge build "python script that renames photos by the date they were taken" -o photo-renamer
vibeforge build "snake game in a single html file"
cd my-site && vibeforge edit "add a contact form and a footer with social links"
```

Prompts can be in any language, including Arabic.

If Gemini says the model is unavailable, pick another one with `vibeforge config model <name>`.

## Safety

Model output is treated as untrusted input:

- Files can only be written **inside** the target folder — absolute paths, `..`, `.git` and `node_modules` are rejected, and symlinks are never followed.
- Nothing is written if **any** file in the response is invalid.
- `build` refuses to touch a non‑empty folder unless you pass `--force`.
- `edit` shows every file it will create or overwrite and asks first.
- `edit` never sends `.env` files, lockfiles, `node_modules`, `.git` or binary files to the model.
- Your API key is never printed. On macOS/Linux the config file is created with owner‑only permissions (`chmod 600`); on Windows it lives in your user profile folder.

> Your prompt and (for `edit`) your project's text files are sent to the Gemini API. Don't run `edit` on code you can't share with Google.

## How it works

1. Sends your request to Gemini with a JSON schema (`project_name`, `summary`, `files[]`, `next_steps[]`).
2. Validates every path and size limit.
3. Writes the files and prints next steps.

No dependencies, ~650 lines of plain ESM. Hack on it:

```bash
npm test      # runs against a local mock Gemini server – no key needed
```

## Contributing

PRs welcome. Ideas: streaming output, `--run` to execute a generated script, templates/presets, support for other providers.

## License

MIT © Youssef Amir

---

<div dir="rtl">

## 🇪🇬 بالعربي

**اوصف اللي عايزه، وGemini يبنيه كله على جهازك.**

```bash
npm install -g vibeforge-cli
vibeforge login                       # تحط مفتاح Gemini مرة واحدة
vibeforge build "موقع بورتفوليو بتصميم داكن"
vibeforge build "سكربت بايثون يغيّر أسماء الصور حسب تاريخها"
vibeforge edit "ضيف فورم تواصل في الصفحة"   # يعدّل المشروع اللي إنت واقف فيه
```

> اسم الحزمة على npm هو `vibeforge-cli`، لكن الأمر اللي بتكتبه هو `vibeforge` بس.

- مفيش أي dependencies.
- مفيش حاجة بتتكتب برا فولدر المشروع، و`edit` بيسألك قبل ما يكتب.
- المفتاح بيتحفظ في فولدر `.vibeforge` جوه فولدر حسابك، ومبيتطبعش أبداً.

</div>