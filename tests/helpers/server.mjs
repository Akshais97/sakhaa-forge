import { createApiServer } from "../../apps/api/src/server.mjs";

export async function withApiServer(env, testFn) {
  const app = await createApiServer(env);
  await app.listen(0, "127.0.0.1");
  const baseUrl = `${await app.getUrl()}/api/v0`;

  try {
    await testFn({ baseUrl });
  } finally {
    await app.close();
  }
}
