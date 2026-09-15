/// <reference lib="webworker" />
import initPython, { format as pythonFormat } from '@wasm-fmt/ruff_fmt/web';
import initGo, { format as goFormat } from '@wasm-fmt/gofmt/web';
import { format as prettierFormat } from 'prettier/standalone';
import javaPlugin from 'prettier-plugin-java';

addEventListener('message', async ({ data: { code, language } }) => {
  try {
    let formatted: string;
    if (language === 'python') {
      await initPython(new URL('/formatters/ruff_fmt_bg.wasm', self.location.origin));
      formatted = pythonFormat(code, 'draft.py', { line_width: 100 });
    } else if (language === 'go') {
      await initGo(new URL('/formatters/gofmt.wasm', self.location.origin));
      formatted = goFormat(code);
    } else if (language === 'java') {
      formatted = await prettierFormat(code, {
        parser: 'java',
        plugins: [javaPlugin],
        printWidth: 100,
        tabWidth: 2,
      });
    } else throw new Error('Unsupported language.');
    postMessage({ code: formatted });
  } catch (error) {
    postMessage({ error: String(error instanceof Error ? error.message : error).slice(0, 300) });
  }
});
