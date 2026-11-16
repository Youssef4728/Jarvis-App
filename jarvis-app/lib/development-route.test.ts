import assert from "node:assert/strict";
import test from "node:test";
import { GET, PATCH, POST } from "../app/api/development/route";

test("development snapshot requires app authorization before database access", async () => {
  const response = await GET(new Request("https://jarvis.invalid/api/development"));
  assert.equal(response.status, 401);
});

test("development mutations reject unauthenticated requests", async () => {
  const postResponse = await POST(new Request("https://jarvis.invalid/api/development", {
    method: "POST",
    body: JSON.stringify({ action: "create_vision" }),
  }));
  const patchResponse = await PATCH(new Request("https://jarvis.invalid/api/development", {
    method: "PATCH",
    body: JSON.stringify({}),
  }));
  assert.equal(postResponse.status, 401);
  assert.equal(patchResponse.status, 401);
});

test("development API validates malformed input before constructing the database client", async () => {
  const originalPassword = process.env.APP_PASSWORD;
  process.env.APP_PASSWORD = "development-test-password";
  try {
    const malformed = await POST(new Request("https://jarvis.invalid/api/development", {
      method: "POST",
      headers: { "x-app-password": "development-test-password" },
      body: "{",
    }));
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { error: "invalid_json" });

    const unknownAction = await POST(new Request("https://jarvis.invalid/api/development", {
      method: "POST",
      headers: { "x-app-password": "development-test-password", "content-type": "application/json" },
      body: JSON.stringify({ action: "unknown" }),
    }));
    assert.equal(unknownAction.status, 400);
    assert.deepEqual(await unknownAction.json(), { error: "action_invalid" });
  } finally {
    if (originalPassword === undefined) delete process.env.APP_PASSWORD;
    else process.env.APP_PASSWORD = originalPassword;
  }
});
