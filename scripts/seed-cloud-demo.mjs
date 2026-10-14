import readline from "node:readline";
import { execFileSync } from "node:child_process";

// Pass the Site service credential through hidden stdin only.
if (process.stdin.isTTY) execFileSync("stty", ["-echo"], { stdio: "inherit" });
console.log("Ready for cloud demo JSON on stdin (input is hidden).");
const lines = readline.createInterface({
  input: process.stdin,
  terminal: false,
});
const raw = await new Promise((resolve) => lines.once("line", resolve));
lines.close();
if (process.stdin.isTTY) execFileSync("stty", ["echo"], { stdio: "inherit" });
const { baseUrl, serviceToken } = JSON.parse(raw);
const origin = new URL(baseUrl);
if (
  origin.protocol !== "https:" ||
  origin.username ||
  origin.password ||
  origin.pathname !== "/"
)
  throw new Error("站点地址无效");
const response = await fetch(new URL("/guest/create", origin), {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(serviceToken
      ? { "OAI-Sites-Authorization": `Bearer ${serviceToken}` }
      : {}),
  },
  body: JSON.stringify({
    name: "6-402",
    nickname: "张同学",
    members: ["李同学", "王同学", "陈同学", "刘同学", "赵同学"],
  }),
  redirect: "manual",
  signal: AbortSignal.timeout(30000),
});
if (response.status !== 201)
  throw new Error(`云端演示初始化失败：HTTP ${response.status}`);
const result = await response.json();
console.log(
  JSON.stringify({
    id: result.dorm.id,
    name: result.dorm.name,
    invite_code: result.invite_code,
    member_count: result.dorm.members.length,
  }),
);
