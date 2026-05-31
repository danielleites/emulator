#!/usr/bin/env node
/**
 * merge-package-json.js
 * מוסיף תלויות נדרשות ל-package.json של RN skeleton
 * (react-native-webview, async-storage)
 */
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(process.cwd(), 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const additions = {
  'react-native-webview': '^13.10.5',
  '@react-native-async-storage/async-storage': '^1.23.1',
};

pkg.dependencies = pkg.dependencies || {};
let changed = false;
for (const [name, version] of Object.entries(additions)) {
  if (!pkg.dependencies[name]) {
    pkg.dependencies[name] = version;
    changed = true;
    console.log(`  + ${name}@${version}`);
  }
}

if (changed) {
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log('✓ package.json updated');
} else {
  console.log('✓ package.json already has all deps');
}
