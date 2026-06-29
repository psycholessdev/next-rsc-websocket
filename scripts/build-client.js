// scripts/build-client.js
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

async function build() {
  // Bundle and minify the Service Worker script
  const [workerResult, clientResult] = await Promise.all([
    esbuild.build({
      entryPoints: [path.join(__dirname, '../src/worker.ts')],
      bundle: true,
      minify: true,
      write: false,
      format: 'iife',
      target: 'es2022',
    }),
    esbuild.build({
      entryPoints: [path.join(__dirname, '../src/client.ts')],
      bundle: true,
      minify: true,
      write: false,
      format: 'iife',
      target: 'es2022',
    }),
  ]);

  const workerCodeString = workerResult.outputFiles[0].text.trim().replaceAll('"', '\\"');
  const clientCodeString = clientResult.outputFiles[0].text.trim().replaceAll('"', '\\"');

  // Replace the placeholder with the actual compiled client code strings
  const pluginPath = path.join(__dirname, '../src/plugin.ts');
  let pluginContent = fs.readFileSync(pluginPath, 'utf8');
  pluginContent = pluginContent.replace(
    /(?<=\*<INJECTED_SW_CODE>\*\/\s").+(?="\s\/\*<\/INJECTED_SW_CODE>\*)/,
    workerCodeString,
  );
  pluginContent = pluginContent.replace(
    /(?<=\*<INJECTED_CLIENT_CODE>\*\/\s").+(?="\s\/\*<\/INJECTED_CLIENT_CODE>\*)/,
    clientCodeString,
  );

  // Update the plugin file before the main TypeScript compilation begins
  fs.writeFileSync(pluginPath, pluginContent, 'utf8');
  console.log('Successfully injected compiled Client code into plugin.ts');
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
