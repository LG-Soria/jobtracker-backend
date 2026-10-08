import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, '..');
const composeFile = path.join(backendDir, 'docker-compose.test.yml');
const envFile = path.join(backendDir, '.env.test');
const binSuffix = process.platform === 'win32' ? '.cmd' : '';
const prismaCmd = path.join(backendDir, 'node_modules', '.bin', `prisma${binSuffix}`);
const jestCmd = path.join(backendDir, 'node_modules', '.bin', `jest${binSuffix}`);
const dockerCmd = process.platform === 'win32' ? 'docker.exe' : 'docker';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const commandLine = [command, ...args].join(' ');
    const child = spawn(commandLine, {
      cwd: backendDir,
      shell: true,
      stdio: 'inherit',
      ...options,
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${commandLine} exited with code ${code ?? 'unknown'}`));
    });
  });
}

function quote(value) {
  return `"${value}"`;
}

async function loadEnvFile(filePath) {
  const raw = await readFile(filePath, 'utf8');
  const env = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retry(task, attempts, delayMs) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await task();
      return;
    } catch (error) {
      lastError = error;

      if (attempt === attempts) {
        break;
      }

      await sleep(delayMs);
    }
  }

  throw lastError;
}

async function waitForPort(host, port, timeoutMs = 30_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const connected = await new Promise((resolve) => {
      const socket = net.createConnection({ host, port });

      socket.once('connect', () => {
        socket.end();
        resolve(true);
      });

      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
    });

    if (connected) return;
    await sleep(1_000);
  }

  throw new Error(`Timed out waiting for PostgreSQL at ${host}:${port}`);
}

async function main() {
  const fileEnv = await loadEnvFile(envFile);
  const env = { ...process.env, ...fileEnv };
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is missing in .env.test');
  }

  const parsed = new URL(databaseUrl);
  const host = parsed.hostname;
  const port = Number(parsed.port || 5432);

  await run(dockerCmd, ['compose', '-f', quote(composeFile), 'up', '-d']);

  try {
    await waitForPort(host, port);
    await retry(() => run(quote(prismaCmd), ['migrate', 'deploy'], { env }), 5, 2_000);
    await run(quote(jestCmd), ['--config', './test/jest-e2e.json', '--runInBand'], { env });
  } finally {
    await run(dockerCmd, ['compose', '-f', quote(composeFile), 'down', '-v']);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
