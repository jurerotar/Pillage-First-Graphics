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
      // biome-ignore lint/suspicious/noConsole: Build scripts report progress in the terminal.
      console.error(`tsdown exited with code ${code}`);
    }
  });
};

const watchedDirs = [
  path.join(process.cwd(), 'src', 'svg'),
  path.join(process.cwd(), 'src', 'graphic-packs', 'default', 'buildings'),
];

const watcher = chokidar.watch(watchedDirs, {
  ignored: (filePath, stats) => {
    if (!stats?.isFile()) {
      return false;
    }

    if (filePath.endsWith('.svgo.svg') || filePath.endsWith('.inkscape.svg')) {
      return true;
    }

    return !/\.(avif|png|svg|webp)$/i.test(filePath);
  },
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
