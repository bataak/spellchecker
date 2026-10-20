import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canSignIn,
  challengeOf,
  githubDevice,
  refreshed,
  type AuthConfig,
} from "../src/project/git/gitauth.ts";
import { ProjectError } from "../src/project/projecterror.ts";

const config: AuthConfig = {
  proxy: "https://auth.test",
  githubClient: "gh-client",
  gitlabClient: "gl-client",
  redirect: "https://app.test/oauth.html",
};

test("challengeOf: RFC 7636-ийн жишээ утгатай таарна", async () => {
  assert.equal(
    await challengeOf("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
});

test("canSignIn: тохиргоо бүрэн үед л нэвтрэх товч гаргана", () => {
  assert.equal(canSignIn("github", config), true);
  assert.equal(canSignIn("gitlab", config), true);
  assert.equal(canSignIn("github", { ...config, proxy: "" }), false);
  assert.equal(canSignIn("gitlab", { ...config, gitlabClient: "" }), false);
});

const device = (replies: Record<string, unknown>[]) => {
  const calls: { url: string; body: Record<string, string> }[] = [];
  let clock = 0;
  const fetcher = (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, body: JSON.parse(String(init?.body)) });
    if (url.endsWith("/code"))
      return Promise.resolve(
        Response.json({
          device_code: "dev",
          user_code: "ABCD-1234",
          verification_uri: "https://github.com/login/device",
          interval: 0,
          expires_in: 3,
        }),
      );
    clock += 1000;
    return Promise.resolve(Response.json(replies.shift() ?? {}));
  };
  return { calls, fetcher, now: () => clock };
};

test("githubDevice: кодыг харуулж, зөвшөөрөх хүртэл хүлээгээд token авна", async () => {
  const { calls, fetcher, now } = device([
    { error: "authorization_pending" },
    { error: "slow_down", interval: 0 },
    { access_token: "gho_x" },
  ]);
  const shown: string[] = [];
  const token = await githubDevice(
    (code, url) => shown.push(code + " " + url),
    undefined,
    config,
    fetcher,
    now,
  );
  assert.deepEqual(token, { access: "gho_x" });
  assert.deepEqual(shown, ["ABCD-1234 https://github.com/login/device"]);
  assert.equal(calls[0]!.url, "https://auth.test/github/device/code");
  assert.equal(calls[0]!.body.client_id, "gh-client");
  assert.equal(calls.at(-1)!.body.device_code, "dev");
});

test("githubDevice: цуцалсан эсвэл хугацаа дууссан бол ойлгомжтой алдаа өгнө", async () => {
  const denied = device([{ error: "access_denied" }]);
  await assert.rejects(
    githubDevice(() => {}, undefined, config, denied.fetcher, denied.now),
    /цуцаллаа/,
  );
  const late = device([
    { error: "authorization_pending" },
    { error: "authorization_pending" },
    { error: "authorization_pending" },
    { error: "authorization_pending" },
  ]);
  await assert.rejects(
    githubDevice(() => {}, undefined, config, late.fetcher, late.now),
    /хугацаа дууслаа/,
  );
});

test("githubDevice: хүсэлт явж байхад цуцалбал token буцаахгүй", async () => {
  const controller = new AbortController();
  let polls = 0;
  const fetcher = (url: string): Promise<Response> => {
    if (url.endsWith("/code"))
      return Promise.resolve(
        Response.json({
          device_code: "dev",
          user_code: "X",
          verification_uri: "u",
          interval: 0,
        }),
      );
    polls++;
    controller.abort();
    return Promise.resolve(Response.json({ access_token: "late" }));
  };
  await assert.rejects(
    githubDevice(() => {}, controller.signal, config, fetcher),
    (error: unknown) => error instanceof DOMException,
  );
  assert.equal(polls, 1);
});

test("refreshed: хугацаа дуусаагүй бол хэвээр, дууссан бол refresh token-оор шинэчилнэ", async () => {
  const bodies: string[] = [];
  const fetcher = (url: string, init?: RequestInit): Promise<Response> => {
    bodies.push(url + "?" + String(init?.body));
    return Promise.resolve(
      Response.json({
        access_token: "new",
        refresh_token: "r2",
        expires_in: 7200,
      }),
    );
  };
  const fresh = {
    access: "a",
    refresh: "r",
    expires: 10_000_000,
    verifier: "v",
  };
  assert.equal(
    await refreshed("https://gitlab.com", fresh, config, fetcher, () => 0),
    fresh,
  );
  const next = await refreshed(
    "https://gitlab.com",
    { ...fresh, expires: 1000 },
    config,
    fetcher,
    () => 5000,
  );
  assert.deepEqual(next, {
    access: "new",
    refresh: "r2",
    expires: 5000 + 7200 * 1000,
    verifier: "v",
  });
  const sent = new URLSearchParams(bodies[0]!.split("?")[1]);
  assert.equal(bodies[0]!.split("?")[0], "https://gitlab.com/oauth/token");
  assert.equal(sent.get("grant_type"), "refresh_token");
  assert.equal(sent.get("refresh_token"), "r");
  assert.equal(sent.get("client_id"), "gl-client");
  await assert.rejects(
    refreshed(
      "https://gitlab.com",
      { access: "a", expires: 1 },
      config,
      fetcher,
      () => 5000,
    ),
    ProjectError,
  );
});
