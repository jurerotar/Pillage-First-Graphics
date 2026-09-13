import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

type PackageJson = {
  version: string;
};

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as PackageJson;

const getDistTag = (version: string): string => {
  const prerelease = version.match(/^\d+\.\d+\.\d+-([^+]+)/)?.[1];

  if (!prerelease) {
    return 'latest';
  }

  const firstIdentifier = prerelease.split('.')[0];
  const label = firstIdentifier.match(/^[a-z][a-z-]*/i)?.[0];

  return (label ?? 'next').toLowerCase();
};

const tag = getDistTag(packageJson.version);
const args = ['publish', '--tag', tag, ...process.argv.slice(2)];

process.stdout.write(
  `Publishing ${packageJson.version} with npm dist-tag "${tag}"\n`,
);

const result = spawnSync('npm', args, {
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
