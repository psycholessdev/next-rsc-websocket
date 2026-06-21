// scripts/build-worker.js
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

async function build() {
  // Bundle and minify the Service Worker script
  const result = await esbuild.build({
    entryPoints: [path.join(__dirname, '../src/worker.ts')],
    bundle: true,
    minify: true,
    write: false,
    format: 'iife',
    target: 'es2022',
  });
  const workerCodeString = result.outputFiles[0].text;

  // Replace the placeholder with the actual compiled minified worker code string
  const pluginPath = path.join(__dirname, '../src/plugin.ts');
  let pluginContent = fs.readFileSync(pluginPath, 'utf8');
  const escapedCode = JSON.stringify(workerCodeString);
  pluginContent = pluginContent.replace(
    /(?<=\*<INJECTED_SW_CODE>\*\/\s").+(?="\s\/\*<\/INJECTED_SW_CODE>\*)/,
    workerCodeString.trim().replaceAll('"', '\\"'),
  );

  // Update the plugin file before the main TypeScript compilation begins
  fs.writeFileSync(pluginPath, pluginContent, 'utf8');
  console.log('Successfully injected compiled Service Worker into plugin.ts');
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
