const { parentPort, workerData } = require("node:worker_threads");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const EXT = {
  3: ".tfm",
  10: ".fmt",
  11: ".map",
  26: ".tex",
  32: ".pfb",
  33: ".vf",
  44: ".enc",
};
const served = new Map();

function kpsewhich(name) {
  try {
    return execFileSync("kpsewhich", ["-engine=pdftex", name], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

function locate(format, name) {
  const override = workerData.overrides[name];
  if (override) return override;
  const tries = [name];
  if (!path.extname(name) && EXT[format]) tries.push(name + EXT[format]);
  for (const candidate of tries) {
    const found = kpsewhich(candidate);
    if (found) return found;
  }
  return null;
}

class XMLHttpRequest {
  open(_method, url, async) {
    this.url = url;
    this.async = async !== false;
    this.headers = {};
  }

  send() {
    let body = null;
    const tex = /pdftex\/(\d+)\/(.+)$/.exec(this.url);
    if (tex) {
      const found = locate(tex[1], tex[2]);
      if (found) {
        body = fs.readFileSync(found);
        this.status = 200;
        this.headers.fileid = path.basename(found);
        served.set(path.basename(found), found);
      } else {
        this.status = 301;
      }
    } else if (/pdftex\/pk\//.test(this.url)) {
      this.status = 301;
    } else {
      body = fs.readFileSync(
        path.join(workerData.engine, path.basename(this.url)),
      );
      this.status = 200;
    }
    this.response = body
      ? body.buffer.slice(body.byteOffset, body.byteOffset + body.length)
      : null;
    this.responseText = body ? body.toString("utf8") : "";
    if (this.async) setTimeout(() => this.onload && this.onload(), 0);
  }

  getResponseHeader(name) {
    return this.headers[name] ?? null;
  }
}

globalThis.self = globalThis;
globalThis.XMLHttpRequest = XMLHttpRequest;
globalThis.importScripts = () => {};
globalThis.location = {
  href: "file://" + path.join(workerData.engine, "swiftlatexpdftex.js"),
};
globalThis.postMessage = (message) => {
  if (message.cmd === "compile") message.served = [...served];
  parentPort.postMessage(message);
};
globalThis.close = () => process.exit(0);
parentPort.on("message", (data) => globalThis.onmessage({ data }));

new Function(
  "process",
  "require",
  "module",
  fs.readFileSync(path.join(workerData.engine, "swiftlatexpdftex.js"), "utf8"),
)(undefined, undefined, undefined);
