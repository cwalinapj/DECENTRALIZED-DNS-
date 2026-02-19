# @ddns/sdk (MVP skeleton)

Minimal TypeScript SDK for gateway resolution.

## API

- `resolve({ baseUrl, name, type })`

## Node example

```ts
import { resolve } from "@ddns/sdk";

const out = await resolve({
  baseUrl: "http://localhost:8054",
  name: "netflix.com",
  type: "A"
});
console.log(out.confidence, out.answers);
```

## Worker example

```ts
import { resolve } from "@ddns/sdk";

export default {
  async fetch(): Promise<Response> {
    const out = await resolve({
      baseUrl: "https://gateway.example.com",
      name: "example.dns",
      type: "A"
    });
    return new Response(JSON.stringify(out), {
      headers: { "content-type": "application/json" }
    });
  }
};
```
