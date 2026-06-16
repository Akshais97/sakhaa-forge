import { once } from "node:events";
import { createApiServer } from "../../apps/api/src/server.mjs";

export async function withApiServer(env, testFn) {
  const server = createApiServer(env);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api/v0`;

  try {
    await testFn({ baseUrl });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}
