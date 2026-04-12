const path = require('node:path');

const afterPackModule = require('./afterPack.cjs');

const { validateNativeBinaries } = afterPackModule._internal;

async function main() {
  const [bundlePathArg, platform, arch] = process.argv.slice(2);

  if (!bundlePathArg || !platform || !arch) {
    console.error('Usage: node ./scripts/electron-builder/verifyBundle.cjs <bundlePath> <platform> <arch>');
    process.exit(1);
  }

  const bundlePath = path.resolve(bundlePathArg);
  const mismatches = await validateNativeBinaries(bundlePath, platform, arch);

  if (mismatches.length === 0) {
    console.log(`[verifyBundle] OK ${platform}-${arch}: ${bundlePath}`);
    return;
  }

  console.error(
    `[verifyBundle] Found ${mismatches.length} incompatible native binaries in ${platform}-${arch}: ${bundlePath}`
  );
  for (const mismatch of mismatches.slice(0, 50)) {
    console.error(`- ${mismatch.path} [${mismatch.format}] -> ${mismatch.archs.join(', ')}`);
  }
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
