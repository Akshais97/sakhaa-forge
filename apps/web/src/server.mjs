import http from "node:http";

const port = Number.parseInt(process.env.PORT || "3000", 10);

const server = http.createServer((_request, response) => {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(`<!doctype html>
<html lang="en-IN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Workspace selection · Sakhaa Forge</title>
    <style>
      :root {
        color-scheme: light;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #fafaf8;
        color: #211f1b;
      }
      body {
        margin: 0;
      }
      main {
        max-width: 920px;
        margin: 0 auto;
        padding: 32px 20px;
      }
      section {
        border: 1px solid #d4d1ca;
        border-radius: 8px;
        padding: 20px;
        margin-block: 16px;
        background: #ffffff;
      }
      label {
        display: block;
        font-weight: 650;
        margin-block-end: 6px;
      }
      input, select, button {
        min-height: 40px;
        font: inherit;
      }
      input, select {
        width: min(100%, 420px);
        border: 1px solid #b4b0a7;
        border-radius: 6px;
        padding: 0 10px;
      }
      button {
        border: 0;
        border-radius: 6px;
        padding: 0 14px;
        background: #6557f5;
        color: #ffffff;
        font-weight: 650;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Workspace selection</h1>
      <section aria-labelledby="signin-title">
        <h2 id="signin-title">Sign in</h2>
        <p>Use a Supabase session before creating or selecting a workspace.</p>
        <label for="session-token">Session token</label>
        <input id="session-token" name="session-token" autocomplete="off" placeholder="Supabase JWT">
      </section>
      <section aria-labelledby="create-title">
        <h2 id="create-title">Create workspace</h2>
        <form data-testid="workspace-create-form">
          <label for="workspace-name">Workspace name</label>
          <input id="workspace-name" name="name" required maxlength="120" placeholder="Aster Heights">
          <button type="submit">Create workspace</button>
        </form>
      </section>
      <section aria-labelledby="switcher-title">
        <h2 id="switcher-title">Workspace switcher</h2>
        <label for="workspace-select">Active workspace</label>
        <select id="workspace-select" data-testid="workspace-switcher">
          <option>No workspace selected</option>
        </select>
      </section>
    </main>
  </body>
</html>
`);
});

server.listen(port, () => {
  console.log(`Sakhaa Forge web shell listening on http://localhost:${port}`);
});
