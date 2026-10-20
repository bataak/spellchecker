const params = new URLSearchParams(location.search);
const message = {
  type: "git-oauth",
  code: params.get("code"),
  state: params.get("state"),
  error: params.get("error"),
};
window.opener?.postMessage(message, location.origin);
const channel = new BroadcastChannel("git-oauth");
channel.postMessage(message);
channel.close();
window.close();
