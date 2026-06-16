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
    <title>Service status · Sakhaa Forge</title>
  </head>
  <body>
    <main>
      <h1>Sakhaa Forge service status</h1>
      <p>V0-F0 web shell. The generated client smoke path verifies the API readiness endpoint.</p>
    </main>
  </body>
</html>
`);
});

server.listen(port, () => {
  console.log(`Sakhaa Forge web shell listening on http://localhost:${port}`);
});
