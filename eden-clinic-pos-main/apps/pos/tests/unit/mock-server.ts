import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

async function getFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Could not determine an ephemeral mock-server port.'));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolvePort(address.port);
      });
    });
  });
}

async function waitForHealth(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // The child has not opened its listener yet.
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }

  throw new Error(`Mock server did not become healthy at ${baseUrl}.`);
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolveStop) => {
    child.once('exit', () => resolveStop());
    child.kill();
  });
}

export type MockServer = {
  baseUrl: string;
  reset(options?: { addons?: { recall?: boolean } }): Promise<void>;
  offboard(staffId: string): Promise<void>;
  stop(): Promise<void>;
};

export async function startMockServer(): Promise<MockServer> {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const mockPath = resolve(process.cwd(), '..', '..', 'mock', 'mock-server.mjs');
  const child = spawn(process.execPath, [mockPath], {
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });

  await waitForHealth(baseUrl);

  return {
    baseUrl,
    async reset(options): Promise<void> {
      const response = await fetch(`${baseUrl}/__reset`, {
        method: 'POST',
        headers: options === undefined ? undefined : { 'content-type': 'application/json' },
        body: options === undefined ? undefined : JSON.stringify(options),
      });
      if (!response.ok) {
        throw new Error(`Mock reset failed with HTTP ${response.status}.`);
      }
    },
    async offboard(staffId: string): Promise<void> {
      const response = await fetch(`${baseUrl}/__staff/${encodeURIComponent(staffId)}/offboard`, { method: 'POST' });
      if (!response.ok) {
        throw new Error(`Mock staff offboarding failed with HTTP ${response.status}.`);
      }
    },
    async stop(): Promise<void> {
      await stopChild(child);
    },
  };
}
