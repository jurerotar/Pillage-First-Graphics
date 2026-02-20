import chokidar from 'chokidar';
import { spawn } from 'node:child_process';
import path from 'node:path';

let building = false;
let pending = false;
let debounceTimer: NodeJS.Timeout | null = null;

const runBuild = () => {
  if (building) {
    pending = true;
    return;
  }

  building = true;

  const child = spawn('npm', ['run', 'build'], {
    stdio: 'inherit',
    shell: true,
  });

  child.on('exit', (code) => {
    building = false;
    if (pending) {
      pending = false;
      // Debounce quick successive triggers
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(runBuild, 150);
    }
    if (code !== 0) {
      console.error(`tsdown exited with code ${code}`);
    }
  });
};

const svgDir = path.join(process.cwd(), 'src', 'svg');

const watcher = chokidar.watch(svgDir, {
  ignored: (p, stats) => stats?.isFile() ? (!p.endsWith('.svg') || p.endsWith('.svgo.svg')) : false,
  ignoreInitial: false,
  awaitWriteFinish: {
    stabilityThreshold: 200,
    pollInterval: 100,
  },
});

watcher
  .on('add', (path: string) => {
    console.log(`[svg-watch] Added: ${path}`);
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(runBuild, 100);
  })
  .on('change', (path: string) => {
    console.log(`[svg-watch] Changed: ${path}`);
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(runBuild, 100);
  })
  .on('unlink', (path: string) => {
    console.log(`[svg-watch] Removed: ${path}`);
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(runBuild, 100);
  })
  .on('ready', () => {
    console.log('[svg-watch] Initial scan complete. Running initial build...');
    runBuild();
  });

