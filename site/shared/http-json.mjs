// HTTP mechanics only. Domains retain their own errors, policy and field lists.
export function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function createJsonInput({ invalid, fail }) {
  function object(value, allowed, required = []) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => !allowed.includes(key)) ||
      required.some((key) => value[key] === undefined || value[key] === null)
    )
      invalid();
    return value;
  }

  async function body(request, allowed, required = []) {
    // Preserve the existing decoded string limit (UTF-16 length), not a new
    // byte/Content-Length policy. Read errors remain distinguishable from JSON.
    const text = await request.text();
    if (text.length > 65_536) fail(413, "body_too_large", "提交内容过长");
    let value;
    try {
      value = JSON.parse(text || "{}");
    } catch {
      invalid();
    }
    return object(value, allowed, required);
  }

  return { object, body };
}
