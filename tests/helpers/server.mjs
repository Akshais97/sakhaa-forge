import { createApiServer, getTestStore } from "../../apps/api/src/server.mjs";

export async function withApiServer(env, testFn) {
  const app = await createApiServer(env);
  await app.listen(0, "127.0.0.1");
  const baseUrl = `${await app.getUrl()}/api/v0`;
  // In test env the server exposes the store (apps/api/src/server.mjs holds it in a WeakMap side
  // channel) so fault-injection hooks can mutate retained state for proof paths that no public
  // happy-path behaviour can produce. Absent in non-test runs.
  const store = getTestStore(app);

  try {
    await testFn({ baseUrl, store });
  } finally {
    await app.close();
  }
}
