import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/gitauth/src/index.ts";

const ORIGIN = "https://app.test";
const env = { ALLOWED_ORIGINS: ORIGIN, GITHUB_CLIENT_ID: "client" };

const post = (body: string): Promise<Response> =>
  worker.fetch(
    new Request("https://auth.test/github/device/code", {
      method: "POST",
      headers: { Origin: ORIGIN },
      body,
    }),
    env,
  );

for (const body of ["null", "1", '"x"', "{"])
  test(
    "gitauth worker: объект биш body-г 400-аар буцаана: " + body,
    async () => {
      const response = await post(body);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "body" });
    },
  );

test("gitauth worker: өөр client_id-г 403-аар буцаана", async () => {
  assert.equal((await post('{"client_id":"other"}')).status, 403);
});
