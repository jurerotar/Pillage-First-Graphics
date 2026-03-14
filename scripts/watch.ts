import chokidar from 'chokidar';
import { type ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';

let building = false;
let pending = false;
let child: ChildProcess | null = null;
let debounceTimer: NodeJS.Timeout | null = null;

const runBuild = () => {
  if (building) {
    pending = true;
    return;
  }

  building = true;

  child = spawn('npm', ['run', 'build'], {
    stdio: 'inherit',
    shell: true,
  });

  child.on('exit', (code: number | null) => {
    child = null;
    building = false;
    if (pending) {
      pending = false;
      // Debounce quick successive triggers
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(runBuild, 150);
    }
    if (code !== 0 && code !== null) {
      console.error(`tsdown exited with code ${code}`);
    }
  });
};

const svgDir = path.join(process.cwd(), 'src', 'svg');

const watcher = chokidar.watch(svgDir, {
  ignored: (p, stats) => stats?.isFile() ? (!p.endsWith('.svg') || p.endsWith('.svgo.svg') || p.endsWith('.inkscape.svg')) : false,
  ignoreInitial: false,
  awaitWriteFinish: {
    stabilityThreshold: 200,
    pollInterval: 100,
  },
});

watcher
  .on('add', () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(runBuild, 100);
  })
  .on('change', () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(runBuild, 100);
  })
  .on('unlink', () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(runBuild, 100);
  })
  .on('ready', () => {
    runBuild();
  });

const cleanup = async () => {
  await watcher.close();
  if (child) {
    child.kill();
  }
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

