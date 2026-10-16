var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// local/email-runtime.mjs
var email_runtime_exports = {};
__export(email_runtime_exports, {
  createEmailRuntime: () => createEmailRuntime,
  createSmtpSender: () => createSmtpSender,
  loadEmailConfig: () => loadEmailConfig,
  validateEmailConfig: () => validateEmailConfig
});
module.exports = __toCommonJS(email_runtime_exports);
var import_promises = __toESM(require("node:fs/promises"), 1);
var import_node_path3 = __toESM(require("node:path"), 1);
var import_node_crypto8 = require("node:crypto");

// node_modules/nodemailer/dist/esm/mailer/index.js
var import_node_events = require("node:events");

// node_modules/nodemailer/dist/esm/shared/url.js
var import_node_net = __toESM(require("node:net"), 1);
var import_node_url = __toESM(require("node:url"), 1);

// node_modules/nodemailer/dist/esm/punycode/index.js
var maxInt = 2147483647;
var base = 36;
var tMin = 1;
var tMax = 26;
var skew = 38;
var damp = 700;
var initialBias = 72;
var initialN = 128;
var delimiter = "-";
var regexPunycode = /^xn--/;
var regexNonASCII = /[^\0-\x7F]/;
var regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g;
var errors = {
  overflow: "Overflow: input needs wider integers to process",
  "not-basic": "Illegal input >= 0x80 (not a basic code point)",
  "invalid-input": "Invalid input"
};
var baseMinusTMin = base - tMin;
var floor = Math.floor;
var stringFromCharCode = String.fromCharCode;
function error(type) {
  throw new RangeError(errors[type]);
}
function map(array, callback) {
  const result = [];
  let length = array.length;
  while (length--) {
    result[length] = callback(array[length]);
  }
  return result;
}
function mapDomain(domain, callback) {
  const parts = domain.split("@");
  let result = "";
  if (parts.length > 1) {
    result = parts[0] + "@";
    domain = parts[1];
  }
  domain = domain.replace(regexSeparators, ".");
  const labels = domain.split(".");
  const encoded = map(labels, callback).join(".");
  return result + encoded;
}
function ucs2decode(string) {
  const output = [];
  let counter = 0;
  const length = string.length;
  while (counter < length) {
    const value = string.charCodeAt(counter++);
    if (value >= 55296 && value <= 56319 && counter < length) {
      const extra = string.charCodeAt(counter++);
      if ((extra & 64512) == 56320) {
        output.push(((value & 1023) << 10) + (extra & 1023) + 65536);
      } else {
        output.push(value);
        counter--;
      }
    } else {
      output.push(value);
    }
  }
  return output;
}
var basicToDigit = function(codePoint) {
  if (codePoint >= 48 && codePoint < 58) {
    return 26 + (codePoint - 48);
  }
  if (codePoint >= 65 && codePoint < 91) {
    return codePoint - 65;
  }
  if (codePoint >= 97 && codePoint < 123) {
    return codePoint - 97;
  }
  return base;
};
var digitToBasic = function(digit, flag) {
  return digit + 22 + 75 * Number(digit < 26) - (Number(flag != 0) << 5);
};
var adapt = function(delta, numPoints, firstTime) {
  let k = 0;
  delta = firstTime ? floor(delta / damp) : delta >> 1;
  delta += floor(delta / numPoints);
  for (
    ;
    /* no initialization */
    delta > baseMinusTMin * tMax >> 1;
    k += base
  ) {
    delta = floor(delta / baseMinusTMin);
  }
  return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
};
var decode = function(input) {
  const output = [];
  const inputLength = input.length;
  let i = 0;
  let n = initialN;
  let bias = initialBias;
  let basic = input.lastIndexOf(delimiter);
  if (basic < 0) {
    basic = 0;
  }
  for (let j = 0; j < basic; ++j) {
    if (input.charCodeAt(j) >= 128) {
      error("not-basic");
    }
    output.push(input.charCodeAt(j));
  }
  for (let index = basic > 0 ? basic + 1 : 0; index < inputLength; ) {
    const oldi = i;
    for (let w = 1, k = base; ; k += base) {
      if (index >= inputLength) {
        error("invalid-input");
      }
      const digit = basicToDigit(input.charCodeAt(index++));
      if (digit >= base) {
        error("invalid-input");
      }
      if (digit > floor((maxInt - i) / w)) {
        error("overflow");
      }
      i += digit * w;
      const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
      if (digit < t) {
        break;
      }
      const baseMinusT = base - t;
      if (w > floor(maxInt / baseMinusT)) {
        error("overflow");
      }
      w *= baseMinusT;
    }
    const out = output.length + 1;
    bias = adapt(i - oldi, out, oldi == 0);
    if (floor(i / out) > maxInt - n) {
      error("overflow");
    }
    n += floor(i / out);
    i %= out;
    output.splice(i++, 0, n);
  }
  return String.fromCodePoint(...output);
};
var encode = function(input) {
  const output = [];
  const codePoints = ucs2decode(input);
  const inputLength = codePoints.length;
  let n = initialN;
  let delta = 0;
  let bias = initialBias;
  for (const currentValue of codePoints) {
    if (currentValue < 128) {
      output.push(stringFromCharCode(currentValue));
    }
  }
  const basicLength = output.length;
  let handledCPCount = basicLength;
  if (basicLength) {
    output.push(delimiter);
  }
  while (handledCPCount < inputLength) {
    let m = maxInt;
    for (const currentValue of codePoints) {
      if (currentValue >= n && currentValue < m) {
        m = currentValue;
      }
    }
    const handledCPCountPlusOne = handledCPCount + 1;
    if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
      error("overflow");
    }
    delta += (m - n) * handledCPCountPlusOne;
    n = m;
    for (const currentValue of codePoints) {
      if (currentValue < n && ++delta > maxInt) {
        error("overflow");
      }
      if (currentValue === n) {
        let q = delta;
        for (let k = base; ; k += base) {
          const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
          if (q < t) {
            break;
          }
          const qMinusT = q - t;
          const baseMinusT = base - t;
          output.push(stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0)));
          q = floor(qMinusT / baseMinusT);
        }
        output.push(stringFromCharCode(digitToBasic(q, 0)));
        bias = adapt(delta, handledCPCountPlusOne, handledCPCount === basicLength);
        delta = 0;
        ++handledCPCount;
      }
    }
    ++delta;
    ++n;
  }
  return output.join("");
};
var toUnicode = function(input) {
  return mapDomain(input, function(string) {
    return regexPunycode.test(string) ? decode(string.slice(4).toLowerCase()) : string;
  });
};
var toASCII = function(input) {
  return mapDomain(input, function(string) {
    return regexNonASCII.test(string) ? "xn--" + encode(string) : string;
  });
};

// node_modules/nodemailer/dist/esm/shared/url.js
var SLASHLESS_AUTHORITY = /^([a-zA-Z][a-zA-Z0-9+.-]*:)(?!\/\/)([\s\S]+)$/;
var SURROUNDING_WHITESPACE = /^[\x00-\x20]+|[\x00-\x20]+$/g;
var LEGACY_TRIM = /^[\x00-\x20\u00a0\ufeff]+/;
var AUTHORITY = /^([a-zA-Z0-9+.-]+:)?[\\/]{2}([^\\/?#]*)/;
var FORBIDDEN_HOST_CHARS = /[\x00-\x20#/:<>?@[\\\]^|\x7f]/;
var CONTROL_CHARS = /[\x00-\x1f\x7f]/;
function invalidUrl(input) {
  const err = new TypeError("Invalid URL");
  err.code = "ERR_INVALID_URL";
  err.input = input;
  return err;
}
function legacyParse(input, parseQueryString, whatwgError, slashesDenoteHost) {
  const parsed = import_node_url.default.parse(input, parseQueryString, slashesDenoteHost);
  const authority = AUTHORITY.exec(input.replace(LEGACY_TRIM, ""));
  if (authority && (authority[1] || parsed.hostname !== null)) {
    const written = authority[2].slice(authority[2].lastIndexOf("@") + 1);
    if (!written || CONTROL_CHARS.test(written) || (parsed.host || "").toLowerCase() !== toASCII(written.toLowerCase())) {
      throw whatwgError;
    }
    if (written.charAt(0) === "[" && !import_node_net.default.isIPv6(written.slice(1, written.indexOf("]")))) {
      throw whatwgError;
    }
  } else if (parsed.hostname !== null) {
    throw whatwgError;
  }
  const legacyAuth = parsed.auth === null || parsed.auth === void 0 ? null : parsed.auth.split(":");
  const result = parsed;
  result.username = legacyAuth ? legacyAuth.shift() : null;
  result.password = legacyAuth && legacyAuth.length ? legacyAuth.join(":") : null;
  return result;
}
function safeDecode(str) {
  try {
    return decodeURIComponent(str);
  } catch (_err) {
    return str;
  }
}
function normalizeHostname(raw, href) {
  const hostname = raw || "";
  if (!hostname) {
    return "";
  }
  if (hostname.charAt(0) === "[" && hostname.charAt(hostname.length - 1) === "]") {
    return hostname.slice(1, -1);
  }
  const decoded = safeDecode(hostname);
  const mapped = FORBIDDEN_HOST_CHARS.test(decoded) ? "" : import_node_url.default.domainToASCII(decoded);
  if (!mapped) {
    throw invalidUrl(href);
  }
  return mapped;
}
var parse = (input, parseQueryString) => {
  input = (input || "").replace(SURROUNDING_WHITESPACE, "");
  const slashless = SLASHLESS_AUTHORITY.exec(input);
  const normalized2 = slashless ? slashless[1] + "//" + slashless[2] : input;
  let u;
  try {
    u = new URL(normalized2);
  } catch (err) {
    return legacyParse(normalized2, parseQueryString, err);
  }
  const hostname = normalizeHostname(u.hostname, u.href);
  const port = u.port || null;
  const pathname = u.pathname || null;
  const search = u.search || null;
  let auth = null;
  let username = null;
  let password = null;
  if (u.username || u.password) {
    username = safeDecode(u.username);
    password = u.password ? safeDecode(u.password) : null;
    auth = username + (password !== null ? ":" + password : "");
  }
  let query;
  if (parseQueryString) {
    const parsed = /* @__PURE__ */ Object.create(null);
    u.searchParams.forEach((value, key) => {
      if (Object.prototype.hasOwnProperty.call(parsed, key)) {
        const existing = parsed[key];
        if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          parsed[key] = [existing, value];
        }
      } else {
        parsed[key] = value;
      }
    });
    query = parsed;
  } else {
    query = search ? search.slice(1) : null;
  }
  return {
    protocol: u.protocol || null,
    host: u.host || null,
    hostname,
    port,
    pathname,
    search,
    path: (pathname || "") + (search || "") || null,
    href: u.href,
    auth,
    username,
    password,
    query
  };
};
var resolve = (from, to) => {
  try {
    return new URL(to, from).href;
  } catch (err) {
    legacyParse(from, false, err, true);
    legacyParse(to, false, err, true);
    return import_node_url.default.resolve(from, to);
  }
};

// node_modules/nodemailer/dist/esm/shared/index.js
var import_node_util = __toESM(require("node:util"), 1);
var import_node_fs = __toESM(require("node:fs"), 1);

// node_modules/nodemailer/dist/esm/fetch/index.js
var import_node_http = __toESM(require("node:http"), 1);
var import_node_https = __toESM(require("node:https"), 1);
var import_node_zlib = __toESM(require("node:zlib"), 1);
var import_node_stream = require("node:stream");

// node_modules/nodemailer/dist/esm/fetch/cookies.js
var import_node_net2 = __toESM(require("node:net"), 1);
var SESSION_TIMEOUT = 1800;
var Cookies = class {
  constructor(options) {
    this.options = options || {};
    this.cookies = [];
  }
  /**
   * Stores a cookie string to the cookie storage
   *
   * @param cookieStr Value from the 'Set-Cookie:' header
   * @param url Current URL
   */
  set(cookieStr, url) {
    const urlparts = parse(url || "");
    const cookie = this.parse(cookieStr);
    let domain;
    if (cookie.domain) {
      domain = cookie.domain.replace(/^\./, "");
      if (
        // can't be valid if the requested domain is shorter than current hostname
        urlparts.hostname.length < domain.length || // a top level domain is not a valid scope, 'Domain=com' would otherwise be
        // sent to every .com host. A trailing dot does not make 'com.' any better
        domain.indexOf(".") < 0 || domain.endsWith(".") || // an IP address has no subdomains, so cookies set on it stay host-only
        import_node_net2.default.isIP(urlparts.hostname) || // prefix domains with dot to be sure that partial matches are not used
        !("." + urlparts.hostname).endsWith("." + domain)
      ) {
        cookie.domain = urlparts.hostname;
      }
    } else {
      cookie.domain = urlparts.hostname;
    }
    if (!cookie.path) {
      cookie.path = this.getPath(urlparts.pathname);
    }
    if (!cookie.expires) {
      cookie.expires = new Date(Date.now() + (Number(this.options.sessionTimeout || SESSION_TIMEOUT) || SESSION_TIMEOUT) * 1e3);
    }
    return this.add(cookie);
  }
  /**
   * Returns cookie string for the 'Cookie:' header.
   *
   * @param url URL to check for
   * @returns Cookie header or empty string if no matches were found
   */
  get(url) {
    return this.list(url).map((cookie) => cookie.name + "=" + cookie.value).join("; ");
  }
  /**
   * Lists all valied cookie objects for the specified URL
   *
   * @param url URL to check for
   * @returns An array of cookie objects
   */
  list(url) {
    const result = [];
    for (let i = this.cookies.length - 1; i >= 0; i--) {
      const cookie = this.cookies[i];
      if (this.isExpired(cookie)) {
        this.cookies.splice(i, 1);
        continue;
      }
      if (this.match(cookie, url)) {
        result.unshift(cookie);
      }
    }
    return result;
  }
  /**
   * Parses cookie string from the 'Set-Cookie:' header
   *
   * @param cookieStr String from the 'Set-Cookie:' header
   * @returns Cookie object
   */
  parse(cookieStr) {
    const cookie = {};
    let hasNameValue = false;
    (cookieStr || "").toString().split(";").forEach((cookiePart) => {
      if (!cookiePart.trim()) {
        return;
      }
      const valueParts = cookiePart.split("=");
      const name2 = valueParts.shift().trim();
      let value = valueParts.join("=").trim();
      let domain;
      if (!hasNameValue) {
        hasNameValue = true;
        if (name2) {
          cookie.name = name2;
          cookie.value = value;
        }
        return;
      }
      switch (name2.toLowerCase()) {
        case "expires": {
          const expires = new Date(value);
          if (expires.toString() !== "Invalid Date") {
            cookie.expires = expires;
          }
          break;
        }
        case "path":
          cookie.path = value;
          break;
        case "domain":
          domain = value.toLowerCase();
          if (domain.length && domain.charAt(0) !== ".") {
            domain = "." + domain;
          }
          cookie.domain = domain;
          break;
        case "max-age":
          cookie.expires = new Date(Date.now() + (Number(value) || 0) * 1e3);
          break;
        case "secure":
          cookie.secure = true;
          break;
        case "httponly":
          cookie.httponly = true;
          break;
      }
    });
    return cookie;
  }
  /**
   * Checks if a cookie object is valid for a specified URL
   *
   * @param cookie Cookie object
   * @param url URL to check for
   * @returns true if cookie is valid for specifiec URL
   */
  match(cookie, url) {
    const urlparts = parse(url || "");
    if (urlparts.hostname !== cookie.domain && (cookie.domain.charAt(0) !== "." || ("." + urlparts.hostname).substr(-cookie.domain.length) !== cookie.domain)) {
      return false;
    }
    const pathname = urlparts.pathname || "/";
    const cookiePath = cookie.path;
    const pathMatches = pathname === cookiePath || pathname.startsWith(cookiePath) && (cookiePath.endsWith("/") || pathname.charAt(cookiePath.length) === "/");
    if (!pathMatches) {
      return false;
    }
    if (cookie.secure && urlparts.protocol !== "https:") {
      return false;
    }
    return true;
  }
  /**
   * Adds (or updates/removes if needed) a cookie object to the cookie storage
   *
   * @param cookie Cookie value to be stored
   */
  add(cookie) {
    if (!cookie || !cookie.name) {
      return false;
    }
    for (let i = 0, len = this.cookies.length; i < len; i++) {
      if (this.compare(this.cookies[i], cookie)) {
        if (this.isExpired(cookie)) {
          this.cookies.splice(i, 1);
          return false;
        }
        this.cookies[i] = cookie;
        return true;
      }
    }
    if (!this.isExpired(cookie)) {
      this.cookies.push(cookie);
    }
    return true;
  }
  /**
   * Checks if two cookie objects are the same
   *
   * @param a Cookie to check against
   * @param b Cookie to check against
   * @returns True, if the cookies are the same
   */
  compare(a, b) {
    return a.name === b.name && a.path === b.path && a.domain === b.domain && a.secure === b.secure && a.httponly === b.httponly;
  }
  /**
   * Checks if a cookie is expired
   *
   * @param cookie Cookie object to check against
   * @returns True, if the cookie is expired
   */
  isExpired(cookie) {
    return cookie.expires && cookie.expires < /* @__PURE__ */ new Date() || !cookie.value;
  }
  /**
   * Returns the default path for an URL path argument, the default-path of
   * RFC 6265 section 5.1.4. A cookie that carries no Path attribute is scoped
   * to the directory of the URL it was set from
   *
   * @param pathname
   * @returns Default path
   */
  getPath(pathname) {
    const pathParts = (pathname || "/").split("/");
    pathParts.pop();
    const path4 = pathParts.join("/").trim();
    if (path4.charAt(0) !== "/") {
      return "/";
    }
    return path4;
  }
};
var cookies_default = Cookies;

// node_modules/nodemailer/dist/esm/package-info.js
var name = "nodemailer";
var version = "10.1.2";
var homepage = "https://nodemailer.com/";

// node_modules/nodemailer/dist/esm/fetch/index.js
var import_node_net3 = __toESM(require("node:net"), 1);

// node_modules/nodemailer/dist/esm/errors.js
var ECONNECTION = "ECONNECTION";
var ETIMEDOUT = "ETIMEDOUT";
var ESOCKET = "ESOCKET";
var EENVELOPE = "EENVELOPE";
var EMESSAGE = "EMESSAGE";
var ESTREAM = "ESTREAM";
var ENOAUTH = "ENOAUTH";
var EOAUTH2 = "EOAUTH2";
var EMAXLIMIT = "EMAXLIMIT";
var EMAXRECIPIENTS = "EMAXRECIPIENTS";
var ESENDMAIL = "ESENDMAIL";
var ESES = "ESES";
var ECONFIG = "ECONFIG";
var EPROXY = "EPROXY";
var EFILEACCESS = "EFILEACCESS";
var EURLACCESS = "EURLACCESS";
var EFETCH = "EFETCH";
var isTransientError = (err) => err.responseCode === 421 || err.code === ECONNECTION || err.code === ESOCKET || err.code === ETIMEDOUT;
var ERR_ACCESS_DENIED = "ERR_ACCESS_DENIED";

// node_modules/nodemailer/dist/esm/shared/objects.js
var isProtoKey = (key) => key === "__proto__";
var copyOwnKeys = (target, source, skip) => {
  Object.keys(source || {}).forEach((key) => {
    if (isProtoKey(key) || skip && skip(key)) {
      return;
    }
    target[key] = source[key];
  });
  return target;
};

// node_modules/nodemailer/dist/esm/fetch/index.js
var MAX_REDIRECTS = 5;
var DEFAULT_TIMEOUT = 60 * 1e3;
var DEFAULT_MAX_TIME = 2 * 60 * 1e3;
var DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
var TLS_OPTION_KEYS = [
  "ALPNProtocols",
  "ca",
  "cert",
  "checkServerIdentity",
  "ciphers",
  "crl",
  "dhparam",
  "ecdhCurve",
  "honorCipherOrder",
  "key",
  "maxVersion",
  "minVersion",
  "passphrase",
  "pfx",
  "rejectUnauthorized",
  "secureContext",
  "secureOptions",
  "secureProtocol",
  "servername",
  "sessionIdContext",
  "sigalgs"
];
function setFetchCode(err) {
  if (err.code !== ERR_ACCESS_DENIED) {
    err.code = EFETCH;
  }
}
function parseFetchUrl(url) {
  let parsed;
  try {
    parsed = parse(url);
  } catch (_err) {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }
  return parsed;
}
function fetchPort(parsed) {
  return parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
}
function nmfetch(url, options) {
  options = options || {};
  options.fetchRes = options.fetchRes || new import_node_stream.PassThrough();
  options.cookies = options.cookies || new cookies_default();
  options.redirects = options.redirects || 0;
  options.maxRedirects = isNaN(options.maxRedirects) ? MAX_REDIRECTS : options.maxRedirects;
  if (!options.deadline) {
    options.maxTime = typeof options.maxTime === "number" && options.maxTime >= 0 ? options.maxTime : DEFAULT_MAX_TIME;
    options.deadline = options.maxTime ? Date.now() + options.maxTime : 0;
  }
  const fetchRes = options.fetchRes;
  const parsed = parseFetchUrl(url);
  if (!parsed) {
    if (options.body && typeof options.body.destroy === "function") {
      options.body.on("error", () => false);
      options.body.destroy();
    }
    setImmediate(() => {
      const err = new Error("Unsupported protocol for URL " + url);
      err.code = EFETCH;
      err.sourceUrl = url;
      fetchRes.emit("error", err);
    });
    return fetchRes;
  }
  if (options.cookie) {
    [].concat(options.cookie || []).forEach((cookie) => {
      options.cookies.set(cookie, url);
    });
    options.cookie = false;
  }
  let method = (options.method || "").toString().trim().toUpperCase() || "GET";
  let finished3 = false;
  let cookies;
  let body;
  const handler = parsed.protocol === "https:" ? import_node_https.default : import_node_http.default;
  const headers = {
    "accept-encoding": "gzip,deflate",
    "user-agent": "nodemailer/" + version
  };
  Object.keys(options.headers || {}).forEach((key) => {
    if (isProtoKey(key.toLowerCase().trim())) {
      return;
    }
    headers[key.toLowerCase().trim()] = options.headers[key];
  });
  if (options.userAgent) {
    headers["user-agent"] = options.userAgent;
  }
  if (parsed.auth) {
    headers.Authorization = "Basic " + Buffer.from(parsed.auth).toString("base64");
  }
  if (cookies = options.cookies.get(url)) {
    headers.cookie = cookies;
  }
  if (options.body) {
    if (options.contentType !== false) {
      headers["Content-Type"] = options.contentType || "application/x-www-form-urlencoded";
    }
    if (typeof options.body.pipe === "function") {
      headers["Transfer-Encoding"] = "chunked";
      body = options.body;
      body.on("error", (err) => {
        if (finished3) {
          return;
        }
        finished3 = true;
        setFetchCode(err);
        err.sourceUrl = url;
        fetchRes.emit("error", err);
      });
    } else {
      if (options.body instanceof Buffer) {
        body = options.body;
      } else if (typeof options.body === "object") {
        try {
          body = Buffer.from(Object.keys(options.body).map((key) => {
            const value = options.body[key].toString().trim();
            return encodeURIComponent(key) + "=" + encodeURIComponent(value);
          }).join("&"));
        } catch (E) {
          finished3 = true;
          E.code = EFETCH;
          E.sourceUrl = url;
          setImmediate(() => fetchRes.emit("error", E));
          return fetchRes;
        }
      } else {
        body = Buffer.from(options.body.toString().trim());
      }
      headers["Content-Type"] = options.contentType || "application/x-www-form-urlencoded";
      headers["Content-Length"] = body.length;
    }
    method = (options.method || "").toString().trim().toUpperCase() || "POST";
  }
  let req;
  const reqOptions = {
    method,
    host: parsed.hostname,
    path: parsed.path,
    port: fetchPort(parsed),
    headers,
    // Validate TLS certificates by default. Callers that genuinely need to
    // reach a self-signed/internal host opt out explicitly with
    // options.tls = { rejectUnauthorized: false }.
    rejectUnauthorized: true,
    agent: false
  };
  if (options.tls) {
    Object.keys(options.tls).forEach((key) => {
      if (TLS_OPTION_KEYS.includes(key)) {
        reqOptions[key] = options.tls[key];
      }
    });
  }
  if (parsed.protocol === "https:" && parsed.hostname && parsed.hostname !== reqOptions.host && !import_node_net3.default.isIP(parsed.hostname) && !reqOptions.servername) {
    reqOptions.servername = parsed.hostname;
  }
  try {
    req = handler.request(reqOptions);
  } catch (E) {
    finished3 = true;
    setImmediate(() => {
      setFetchCode(E);
      E.sourceUrl = url;
      fetchRes.emit("error", E);
    });
    return fetchRes;
  }
  let deadlineTimer;
  const clearDeadline = () => {
    if (deadlineTimer) {
      clearTimeout(deadlineTimer);
      deadlineTimer = void 0;
    }
  };
  const fail2 = (err, sourceUrl = url) => {
    if (finished3) {
      return;
    }
    finished3 = true;
    clearDeadline();
    setFetchCode(err);
    err.sourceUrl = sourceUrl;
    fetchRes.emit("error", err);
    req.abort();
  };
  const timeout = typeof options.timeout === "number" && options.timeout >= 0 ? options.timeout : DEFAULT_TIMEOUT;
  if (timeout) {
    req.setTimeout(timeout, () => fail2(new Error("Request Timeout")));
  }
  if (options.deadline) {
    deadlineTimer = setTimeout(() => fail2(new Error("Request exceeded the allowed " + options.maxTime + " ms")), Math.max(options.deadline - Date.now(), 1));
    deadlineTimer.unref();
  }
  req.on("error", (err) => fail2(err));
  fetchRes.once("close", () => {
    clearDeadline();
    if (finished3 || fetchRes.readableEnded) {
      return;
    }
    finished3 = true;
    req.destroy();
  });
  req.on("response", (res) => {
    let inflate;
    if (finished3) {
      return;
    }
    switch (res.headers["content-encoding"]) {
      case "gzip":
      case "deflate":
        inflate = import_node_zlib.default.createUnzip();
        break;
    }
    if (res.headers["set-cookie"]) {
      [].concat(res.headers["set-cookie"] || []).forEach((cookie) => {
        options.cookies.set(cookie, url);
      });
    }
    if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
      options.redirects++;
      if (options.redirects > options.maxRedirects) {
        return fail2(new Error("Maximum redirect count exceeded"));
      }
      options.method = "GET";
      options.body = false;
      let redirectUrl;
      try {
        redirectUrl = resolve(url, res.headers.location);
      } catch (_err) {
        redirectUrl = res.headers.location;
      }
      const redirectParsed = parseFetchUrl(redirectUrl);
      if (!redirectParsed) {
        return fail2(new Error("Unsupported protocol for URL " + redirectUrl), redirectUrl);
      }
      const crossOrigin = redirectParsed.protocol !== parsed.protocol || redirectParsed.hostname !== parsed.hostname || fetchPort(redirectParsed) !== fetchPort(parsed);
      if (options.headers && crossOrigin) {
        const sensitive = ["authorization", "cookie", "proxy-authorization"];
        Object.keys(options.headers).forEach((key) => {
          if (sensitive.includes(key.toLowerCase().trim())) {
            delete options.headers[key];
          }
        });
      }
      finished3 = true;
      clearDeadline();
      res.resume();
      req.abort();
      return nmfetch(redirectUrl, options);
    }
    fetchRes.statusCode = res.statusCode;
    fetchRes.headers = res.headers;
    if (res.statusCode >= 300 && !options.allowErrorResponse) {
      return fail2(new Error("Invalid status code " + res.statusCode));
    }
    res.on("error", (err) => fail2(err));
    res.once("end", () => clearDeadline());
    const maxBytes = typeof options.maxBytes === "number" && options.maxBytes > 0 ? options.maxBytes : DEFAULT_MAX_BYTES;
    const source = inflate || res;
    let received = 0;
    source.on("data", (chunk) => {
      received += chunk.length;
      if (received <= maxBytes || finished3) {
        return;
      }
      source.unpipe(fetchRes);
      fail2(new Error("Response size exceeds the allowed " + maxBytes + " bytes"));
    });
    if (inflate) {
      res.pipe(inflate).pipe(fetchRes);
      inflate.on("error", (err) => fail2(err));
    } else {
      res.pipe(fetchRes);
    }
  });
  setImmediate(() => {
    if (body) {
      try {
        if (typeof body.pipe === "function") {
          return body.pipe(req);
        }
        req.write(body);
      } catch (err) {
        return fail2(err);
      }
    }
    req.end();
  });
  return fetchRes;
}
nmfetch.Cookies = cookies_default;
nmfetch.DEFAULT_TIMEOUT = DEFAULT_TIMEOUT;
nmfetch.DEFAULT_MAX_TIME = DEFAULT_MAX_TIME;
var fetch_default = nmfetch;

// node_modules/nodemailer/dist/esm/shared/index.js
var import_node_dns = __toESM(require("node:dns"), 1);
var import_node_net4 = __toESM(require("node:net"), 1);
var import_node_os = __toESM(require("node:os"), 1);
var import_node_stream2 = require("node:stream");
var DNS_TTL = 5 * 60 * 1e3;
var CACHE_CLEANUP_INTERVAL = 30 * 1e3;
var MAX_CACHE_SIZE = 1e3;
var lastCacheCleanup = 0;
var networkInterfaces;
var networkInterfacesRead = false;
var _readNetworkInterfaces = () => {
  if (!networkInterfacesRead) {
    networkInterfacesRead = true;
    try {
      networkInterfaces = import_node_os.default.networkInterfaces();
    } catch (_err) {
    }
  }
  return networkInterfaces;
};
var isFamilySupported = (family, allowInternal) => {
  const addresses = Object.values(_readNetworkInterfaces() || {}).flat();
  if (!addresses.length) {
    return true;
  }
  return addresses.filter((i) => !i.internal || allowInternal).some((i) => i.family === "IPv" + family || i.family === family);
};
var resolve2 = (family, hostname, options, callback) => {
  options = options || {};
  if (!isFamilySupported(family, options.allowInternalNetworkInterfaces)) {
    callback(null, []);
    return null;
  }
  const dnsResolver = import_node_dns.default.Resolver ? new import_node_dns.default.Resolver(options) : import_node_dns.default;
  dnsResolver["resolve" + family](hostname, (err, addresses) => {
    if (err) {
      switch (err.code) {
        case import_node_dns.default.NODATA:
        case import_node_dns.default.NOTFOUND:
        case import_node_dns.default.NOTIMP:
        case import_node_dns.default.SERVFAIL:
        case import_node_dns.default.CONNREFUSED:
        case import_node_dns.default.REFUSED:
        case "EAI_AGAIN":
          return callback(null, []);
      }
      return callback(err);
    }
    return callback(null, Array.isArray(addresses) ? addresses : [].concat(addresses || []));
  });
  return import_node_dns.default.Resolver ? dnsResolver : null;
};
var dnsCache = /* @__PURE__ */ new Map();
var formatDNSValue = (value, extra) => {
  if (!value) {
    return Object.assign({}, extra || {});
  }
  const addresses = value.addresses || [];
  const host = addresses.length > 0 ? addresses[Math.floor(Math.random() * addresses.length)] : null;
  return Object.assign({
    host,
    // Include all addresses for connection fallback support
    _addresses: addresses
  }, extra || {});
};
var resolveHostname = (options, callback) => {
  options = options || {};
  if (!options.host && options.servername) {
    options.host = options.servername;
  }
  if (!options.host || import_node_net4.default.isIP(options.host)) {
    const value = {
      addresses: [options.host]
    };
    return callback(null, formatDNSValue(value, {
      servername: options.servername || false,
      cached: false
    }));
  }
  const host = options.host;
  const servername = options.servername || host;
  let cached;
  if (dnsCache.has(options.host)) {
    cached = dnsCache.get(options.host);
    const now = Date.now();
    if (now - lastCacheCleanup > CACHE_CLEANUP_INTERVAL) {
      lastCacheCleanup = now;
      for (const [host2, entry] of dnsCache.entries()) {
        if (entry.expires && entry.expires < now) {
          dnsCache.delete(host2);
        }
      }
      if (dnsCache.size > MAX_CACHE_SIZE) {
        const toDelete = Math.floor(MAX_CACHE_SIZE * 0.1);
        const keys = Array.from(dnsCache.keys()).slice(0, toDelete);
        keys.forEach((key) => dnsCache.delete(key));
      }
    }
    if (!cached.expires || cached.expires >= now) {
      return callback(null, formatDNSValue(cached.value, {
        servername,
        cached: true
      }));
    }
  }
  let responded = false;
  let deadline;
  const respond = (err, result) => {
    if (responded) {
      return;
    }
    responded = true;
    clearTimeout(deadline);
    callback(err, result);
  };
  const respondCached = (error2) => {
    if (!cached) {
      return false;
    }
    dnsCache.set(host, {
      value: cached.value,
      expires: Date.now() + (options.dnsTtl || DNS_TTL)
    });
    respond(null, formatDNSValue(cached.value, {
      servername,
      cached: true,
      error: error2
    }));
    return true;
  };
  const resolvers = [];
  const timeout = Number(options.timeout) || 0;
  if (timeout > 0) {
    deadline = setTimeout(() => {
      for (const resolver of resolvers) {
        if (typeof resolver.cancel === "function") {
          resolver.cancel();
        }
      }
      const err = new Error("DNS lookup for " + host + " timed out");
      err.code = import_node_dns.default.TIMEOUT;
      if (!respondCached(err)) {
        respond(err);
      }
    }, timeout);
  }
  let ipv4Addresses = [];
  let ipv6Addresses = [];
  let ipv4Error = null;
  let ipv6Error = null;
  let pending = 2;
  const onResolved = () => {
    if (--pending || responded) {
      return;
    }
    const allAddresses = ipv4Addresses.concat(ipv6Addresses);
    if (allAddresses.length) {
      const value = {
        addresses: allAddresses
      };
      dnsCache.set(host, {
        value,
        expires: Date.now() + (options.dnsTtl || DNS_TTL)
      });
      return respond(null, formatDNSValue(value, {
        servername,
        cached: false
      }));
    }
    if (ipv4Error && ipv6Error && respondCached(ipv4Error)) {
      return;
    }
    try {
      import_node_dns.default.lookup(host, { all: true }, (err, addresses) => {
        if (err) {
          if (respondCached(err)) {
            return;
          }
          return respond(err);
        }
        const supportedAddresses = addresses ? addresses.filter((addr) => isFamilySupported(addr.family)).map((addr) => addr.address) : [];
        if (addresses && addresses.length && !supportedAddresses.length) {
          console.warn(`Failed to resolve IPv${addresses[0].family} addresses with current network`);
        }
        if (!supportedAddresses.length && cached) {
          return respond(null, formatDNSValue(cached.value, {
            servername,
            cached: true
          }));
        }
        const value = {
          addresses: supportedAddresses.length ? supportedAddresses : [host]
        };
        dnsCache.set(host, {
          value,
          expires: Date.now() + (options.dnsTtl || DNS_TTL)
        });
        return respond(null, formatDNSValue(value, {
          servername,
          cached: false
        }));
      });
    } catch (lookupErr) {
      if (respondCached(lookupErr)) {
        return;
      }
      return respond(ipv4Error || ipv6Error || lookupErr);
    }
  };
  for (const family of [4, 6]) {
    const resolver = resolve2(family, host, options, (err, addresses) => {
      if (family === 4) {
        ipv4Error = err;
        ipv4Addresses = addresses || [];
      } else {
        ipv6Error = err;
        ipv6Addresses = addresses || [];
      }
      onResolved();
    });
    if (resolver) {
      resolvers.push(resolver);
    }
  }
};
var parseConnectionUrl = (str) => {
  str = str || "";
  const options = {};
  const url = parse(str, true);
  switch (url.protocol) {
    case "smtp:":
      options.secure = false;
      break;
    case "smtps:":
      options.secure = true;
      break;
    case "direct:":
      options.direct = true;
      break;
  }
  if (!isNaN(url.port) && Number(url.port)) {
    options.port = Number(url.port);
  }
  if (url.hostname) {
    options.host = url.hostname;
  }
  if (url.username || url.password) {
    options.auth = {
      user: url.username || "",
      pass: url.password || ""
    };
  }
  Object.keys(url.query || {}).forEach((key) => {
    let obj = options;
    let lKey = key;
    let value = url.query[key];
    if (!isNaN(value)) {
      value = Number(value);
    }
    switch (value) {
      case "true":
        value = true;
        break;
      case "false":
        value = false;
        break;
    }
    if (key.indexOf("tls.") === 0) {
      lKey = key.substr(4);
      if (!options.tls) {
        options.tls = {};
      }
      obj = options.tls;
    } else if (key.indexOf(".") >= 0) {
      return;
    }
    if (!isProtoKey(lKey) && !(lKey in obj)) {
      obj[lKey] = value;
    }
  });
  return options;
};
var _logFunc = (logger, level, defaults, data, message, ...args) => {
  const entry = Object.assign({}, defaults || {}, data || {});
  delete entry.level;
  let logLevel = level;
  if (typeof logger[logLevel] !== "function") {
    logLevel = ["info", "debug", "log", "trace", "warn", "error"].find((name2) => typeof logger[name2] === "function");
  }
  if (logLevel) {
    logger[logLevel](entry, message, ...args);
  }
};
var getLogger = (options, defaults) => {
  options = options || {};
  const response = {};
  const levels = ["trace", "debug", "info", "warn", "error", "fatal"];
  if (!options.logger) {
    levels.forEach((level) => {
      response[level] = () => false;
    });
    return response;
  }
  const logger = options.logger === true ? createDefaultLogger(levels) : options.logger;
  levels.forEach((level) => {
    response[level] = (...args) => {
      const data = typeof args[0] === "string" ? void 0 : args.shift();
      _logFunc(logger, level, defaults, data, ...args);
    };
  });
  return response;
};
var callbackPromise = (resolve3, reject) => function(...args) {
  const err = args.shift();
  if (err) {
    reject(err);
  } else {
    resolve3(...args);
  }
};
var parseDataURI = (uri) => {
  if (typeof uri !== "string") {
    return null;
  }
  if (!uri.startsWith("data:")) {
    return null;
  }
  const commaPos = uri.indexOf(",");
  if (commaPos === -1) {
    return null;
  }
  const data = uri.substring(commaPos + 1);
  const metaStr = uri.substring("data:".length, commaPos);
  let encoding;
  const metaEntries = metaStr.split(";");
  if (metaEntries.length > 0) {
    const lastEntry = metaEntries[metaEntries.length - 1].toLowerCase().trim();
    if (["base64", "utf8", "utf-8"].includes(lastEntry) && lastEntry.indexOf("=") === -1) {
      encoding = lastEntry;
      metaEntries.pop();
    }
  }
  const contentType = metaEntries.length > 0 ? metaEntries.shift() : "application/octet-stream";
  const params = {};
  for (let i = 0; i < metaEntries.length; i++) {
    const entry = metaEntries[i];
    const sepPos = entry.indexOf("=");
    if (sepPos > 0) {
      const key = entry.substring(0, sepPos).trim();
      const value = entry.substring(sepPos + 1).trim();
      if (key && !isProtoKey(key)) {
        params[key] = value;
      }
    }
  }
  let bufferData;
  try {
    if (encoding === "base64") {
      bufferData = Buffer.from(data, "base64");
    } else {
      try {
        bufferData = Buffer.from(decodeURIComponent(data));
      } catch (_decodeError) {
        bufferData = Buffer.from(data);
      }
    }
  } catch (_bufferError) {
    bufferData = Buffer.alloc(0);
  }
  return {
    data: bufferData,
    encoding: encoding || null,
    contentType: contentType || "application/octet-stream",
    params
  };
};
function resolveContent(data, key, options, callback) {
  if (!callback && typeof options === "function") {
    callback = options;
    options = false;
  }
  options = options || {};
  let promise;
  if (!callback) {
    promise = new Promise((resolve3, reject) => {
      callback = callbackPromise(resolve3, reject);
    });
  }
  resolveContentValue(data, key, options, callback);
  return promise;
}
function resolveContentValue(data, key, options, callback) {
  let content = data && data[key] && data[key].content || data[key];
  const encoding = (typeof data[key] === "object" && data[key].encoding || "utf8").toString().toLowerCase().replace(/[-_\s]/g, "");
  if (!content) {
    return callback(null, content);
  }
  if (typeof content === "object") {
    if (typeof content.pipe === "function") {
      return resolveStream(content, (err, value) => {
        if (err) {
          return callback(err);
        }
        if (data[key].content) {
          data[key].content = value;
        } else {
          data[key] = value;
        }
        callback(null, value);
      });
    } else if (/^data:/i.test(content.path || content.href)) {
      const parsedDataUri = parseDataURI(content.path || content.href);
      return callback(null, parsedDataUri && parsedDataUri.data ? parsedDataUri.data : Buffer.alloc(0));
    } else if (content.href || /^https?:\/\//i.test(content.path)) {
      const url = content.href || content.path;
      if (options.disableUrlAccess) {
        setImmediate(() => {
          const err = new Error("Url access rejected for " + url);
          err.code = EURLACCESS;
          callback(err);
        });
        return;
      }
      return resolveStream(fetch_default(url, { headers: content.httpHeaders, tls: content.tls }), callback);
    } else if (content.path) {
      if (options.disableFileAccess) {
        setImmediate(() => {
          const err = new Error("File access rejected for " + content.path);
          err.code = EFILEACCESS;
          callback(err);
        });
        return;
      }
      return resolveStream(import_node_fs.default.createReadStream(content.path), callback);
    }
  }
  if (typeof data[key].content === "string" && !["utf8", "usascii", "ascii"].includes(encoding)) {
    content = Buffer.from(data[key].content, encoding);
  }
  setImmediate(() => callback(null, content));
}
var assign = function(...args) {
  const target = args.shift() || {};
  args.forEach((source) => {
    Object.keys(source || {}).forEach((key) => {
      if (isProtoKey(key)) {
        return;
      }
      if (["tls", "auth"].includes(key) && source[key] && typeof source[key] === "object") {
        target[key] = copyOwnKeys(target[key] || {}, source[key]);
      } else {
        target[key] = source[key];
      }
    });
  });
  return target;
};
var encodeXText = (str) => {
  if (!/[^\x21-\x2A\x2C-\x3C\x3E-\x7E]/.test(str)) {
    return str;
  }
  const buf = Buffer.from(str);
  let result = "";
  for (let i = 0, len = buf.length; i < len; i++) {
    const c = buf[i];
    if (c < 33 || c > 126 || c === 43 || c === 61) {
      result += "+" + (c < 16 ? "0" : "") + c.toString(16).toUpperCase();
    } else {
      result += String.fromCharCode(c);
    }
  }
  return result;
};
var streamErrors = /* @__PURE__ */ new WeakMap();
function recordStreamErrors(stream) {
  stream.on("error", (err) => {
    if (!streamErrors.has(stream)) {
      streamErrors.set(stream, err);
    }
  });
}
function destroyStream(value) {
  const stream = value;
  if (stream && typeof stream.pipe === "function" && typeof stream.destroy === "function" && !stream.destroyed) {
    stream.destroy();
  }
}
function unreadableStreamError(stream) {
  const err = streamErrors.get(stream) || stream.errored;
  if (err) {
    return err;
  }
  if (stream.readableEnded || stream.destroyed) {
    const unreadable = new Error("Content stream was already read or destroyed");
    unreadable.code = ESTREAM;
    return unreadable;
  }
  return null;
}
function resolveStream(stream, callback) {
  let responded = false;
  const respond = (err, value) => {
    if (responded) {
      return;
    }
    responded = true;
    callback(err, value);
  };
  const unreadable = unreadableStreamError(stream);
  if (unreadable) {
    stream.on("error", () => false);
    setImmediate(() => respond(unreadable));
    return;
  }
  const chunks = [];
  let chunklen = 0;
  stream.on("data", (chunk) => {
    if (typeof chunk === "string") {
      chunk = Buffer.from(chunk);
    }
    chunks.push(chunk);
    chunklen += chunk.length;
  });
  (0, import_node_stream2.finished)(stream, { writable: false }, (err) => {
    if (err) {
      return respond(err);
    }
    let value;
    try {
      value = Buffer.concat(chunks, chunklen);
    } catch (E) {
      return respond(E);
    }
    respond(null, value);
  });
}
function createDefaultLogger(levels) {
  const levelMaxLen = levels.reduce((max, level) => Math.max(max, level.length), 0);
  const levelNames = /* @__PURE__ */ new Map();
  levels.forEach((level) => {
    let levelName = level.toUpperCase();
    if (levelName.length < levelMaxLen) {
      levelName += " ".repeat(levelMaxLen - levelName.length);
    }
    levelNames.set(level, levelName);
  });
  const print = (level, entry, message, ...args) => {
    let prefix = "";
    if (entry) {
      if (entry.tnx === "server") {
        prefix = "S: ";
      } else if (entry.tnx === "client") {
        prefix = "C: ";
      }
      if (entry.sid) {
        prefix = "[" + entry.sid + "] " + prefix;
      }
      if (entry.cid) {
        prefix = "[#" + entry.cid + "] " + prefix;
      }
    }
    message = import_node_util.default.format(message, ...args);
    message.split(/\r?\n/).forEach((line) => {
      console.log("[%s] %s %s", (/* @__PURE__ */ new Date()).toISOString().substr(0, 19).replace(/T/, " "), levelNames.get(level), prefix + line);
    });
  };
  const logger = {};
  levels.forEach((level) => {
    logger[level] = print.bind(null, level);
  });
  return logger;
}

// node_modules/nodemailer/dist/esm/mime-funcs/mime-types.js
var import_node_path = __toESM(require("node:path"), 1);
var defaultMimeType = "application/octet-stream";
var defaultExtension = "bin";
var mimeTypes = /* @__PURE__ */ new Map([
  ["application/acad", "dwg"],
  ["application/applixware", "aw"],
  ["application/arj", "arj"],
  ["application/atom+xml", "xml"],
  ["application/atomcat+xml", "atomcat"],
  ["application/atomsvc+xml", "atomsvc"],
  ["application/base64", ["mm", "mme"]],
  ["application/binhex", "hqx"],
  ["application/binhex4", "hqx"],
  ["application/book", ["book", "boo"]],
  ["application/ccxml+xml,", "ccxml"],
  ["application/cdf", "cdf"],
  ["application/cdmi-capability", "cdmia"],
  ["application/cdmi-container", "cdmic"],
  ["application/cdmi-domain", "cdmid"],
  ["application/cdmi-object", "cdmio"],
  ["application/cdmi-queue", "cdmiq"],
  ["application/clariscad", "ccad"],
  ["application/commonground", "dp"],
  ["application/cu-seeme", "cu"],
  ["application/davmount+xml", "davmount"],
  ["application/drafting", "drw"],
  ["application/dsptype", "tsp"],
  ["application/dssc+der", "dssc"],
  ["application/dssc+xml", "xdssc"],
  ["application/dxf", "dxf"],
  ["application/ecmascript", ["js", "es"]],
  ["application/emma+xml", "emma"],
  ["application/envoy", "evy"],
  ["application/epub+zip", "epub"],
  ["application/excel", ["xls", "xl", "xla", "xlb", "xlc", "xld", "xlk", "xll", "xlm", "xlt", "xlv", "xlw"]],
  ["application/exi", "exi"],
  ["application/font-tdpfr", "pfr"],
  ["application/fractals", "fif"],
  ["application/freeloader", "frl"],
  ["application/futuresplash", "spl"],
  ["application/geo+json", "geojson"],
  ["application/gnutar", "tgz"],
  ["application/groupwise", "vew"],
  ["application/hlp", "hlp"],
  ["application/hta", "hta"],
  ["application/hyperstudio", "stk"],
  ["application/i-deas", "unv"],
  ["application/iges", ["iges", "igs"]],
  ["application/inf", "inf"],
  ["application/internet-property-stream", "acx"],
  ["application/ipfix", "ipfix"],
  ["application/java", "class"],
  ["application/java-archive", "jar"],
  ["application/java-byte-code", "class"],
  ["application/java-serialized-object", "ser"],
  ["application/java-vm", "class"],
  ["application/javascript", "js"],
  ["application/json", "json"],
  ["application/lha", "lha"],
  ["application/lzx", "lzx"],
  ["application/mac-binary", "bin"],
  ["application/mac-binhex", "hqx"],
  ["application/mac-binhex40", "hqx"],
  ["application/mac-compactpro", "cpt"],
  ["application/macbinary", "bin"],
  ["application/mads+xml", "mads"],
  ["application/marc", "mrc"],
  ["application/marcxml+xml", "mrcx"],
  ["application/mathematica", "ma"],
  ["application/mathml+xml", "mathml"],
  ["application/mbedlet", "mbd"],
  ["application/mbox", "mbox"],
  ["application/mcad", "mcd"],
  ["application/mediaservercontrol+xml", "mscml"],
  ["application/metalink4+xml", "meta4"],
  ["application/mets+xml", "mets"],
  ["application/mime", "aps"],
  ["application/mods+xml", "mods"],
  ["application/mp21", "m21"],
  ["application/mp4", "mp4"],
  ["application/mspowerpoint", ["ppt", "pot", "pps", "ppz"]],
  ["application/msword", ["doc", "dot", "w6w", "wiz", "word"]],
  ["application/mswrite", "wri"],
  ["application/mxf", "mxf"],
  ["application/netmc", "mcp"],
  ["application/octet-stream", ["*"]],
  ["application/oda", "oda"],
  ["application/oebps-package+xml", "opf"],
  ["application/ogg", "ogx"],
  ["application/olescript", "axs"],
  ["application/onenote", "onetoc"],
  ["application/patch-ops-error+xml", "xer"],
  ["application/pdf", "pdf"],
  ["application/pgp-encrypted", "asc"],
  ["application/pgp-signature", "pgp"],
  ["application/pics-rules", "prf"],
  ["application/pkcs-12", "p12"],
  ["application/pkcs-crl", "crl"],
  ["application/pkcs10", "p10"],
  ["application/pkcs7-mime", ["p7c", "p7m"]],
  ["application/pkcs7-signature", "p7s"],
  ["application/pkcs8", "p8"],
  ["application/pkix-attr-cert", "ac"],
  ["application/pkix-cert", ["cer", "crt"]],
  ["application/pkix-crl", "crl"],
  ["application/pkix-pkipath", "pkipath"],
  ["application/pkixcmp", "pki"],
  ["application/plain", "text"],
  ["application/pls+xml", "pls"],
  ["application/postscript", ["ps", "ai", "eps"]],
  ["application/powerpoint", "ppt"],
  ["application/pro_eng", ["part", "prt"]],
  ["application/prs.cww", "cww"],
  ["application/pskc+xml", "pskcxml"],
  ["application/rdf+xml", "rdf"],
  ["application/reginfo+xml", "rif"],
  ["application/relax-ng-compact-syntax", "rnc"],
  ["application/resource-lists+xml", "rl"],
  ["application/resource-lists-diff+xml", "rld"],
  ["application/ringing-tones", "rng"],
  ["application/rls-services+xml", "rs"],
  ["application/rsd+xml", "rsd"],
  ["application/rss+xml", "xml"],
  ["application/rtf", ["rtf", "rtx"]],
  ["application/sbml+xml", "sbml"],
  ["application/scvp-cv-request", "scq"],
  ["application/scvp-cv-response", "scs"],
  ["application/scvp-vp-request", "spq"],
  ["application/scvp-vp-response", "spp"],
  ["application/sdp", "sdp"],
  ["application/sea", "sea"],
  ["application/set", "set"],
  ["application/set-payment-initiation", "setpay"],
  ["application/set-registration-initiation", "setreg"],
  ["application/shf+xml", "shf"],
  ["application/sla", "stl"],
  ["application/smil", ["smi", "smil"]],
  ["application/smil+xml", "smi"],
  ["application/solids", "sol"],
  ["application/sounder", "sdr"],
  ["application/sparql-query", "rq"],
  ["application/sparql-results+xml", "srx"],
  ["application/srgs", "gram"],
  ["application/srgs+xml", "grxml"],
  ["application/sru+xml", "sru"],
  ["application/ssml+xml", "ssml"],
  ["application/step", ["step", "stp"]],
  ["application/streamingmedia", "ssm"],
  ["application/tei+xml", "tei"],
  ["application/thraud+xml", "tfi"],
  ["application/timestamped-data", "tsd"],
  ["application/toolbook", "tbk"],
  ["application/vda", "vda"],
  ["application/vnd.3gpp.pic-bw-large", "plb"],
  ["application/vnd.3gpp.pic-bw-small", "psb"],
  ["application/vnd.3gpp.pic-bw-var", "pvb"],
  ["application/vnd.3gpp2.tcap", "tcap"],
  ["application/vnd.3m.post-it-notes", "pwn"],
  ["application/vnd.accpac.simply.aso", "aso"],
  ["application/vnd.accpac.simply.imp", "imp"],
  ["application/vnd.acucobol", "acu"],
  ["application/vnd.acucorp", "atc"],
  ["application/vnd.adobe.air-application-installer-package+zip", "air"],
  ["application/vnd.adobe.fxp", "fxp"],
  ["application/vnd.adobe.xdp+xml", "xdp"],
  ["application/vnd.adobe.xfdf", "xfdf"],
  ["application/vnd.ahead.space", "ahead"],
  ["application/vnd.airzip.filesecure.azf", "azf"],
  ["application/vnd.airzip.filesecure.azs", "azs"],
  ["application/vnd.amazon.ebook", "azw"],
  ["application/vnd.americandynamics.acc", "acc"],
  ["application/vnd.amiga.ami", "ami"],
  ["application/vnd.android.package-archive", "apk"],
  ["application/vnd.anser-web-certificate-issue-initiation", "cii"],
  ["application/vnd.anser-web-funds-transfer-initiation", "fti"],
  ["application/vnd.antix.game-component", "atx"],
  ["application/vnd.apple.installer+xml", "mpkg"],
  ["application/vnd.apple.mpegurl", "m3u8"],
  ["application/vnd.aristanetworks.swi", "swi"],
  ["application/vnd.audiograph", "aep"],
  ["application/vnd.blueice.multipass", "mpm"],
  ["application/vnd.bmi", "bmi"],
  ["application/vnd.businessobjects", "rep"],
  ["application/vnd.chemdraw+xml", "cdxml"],
  ["application/vnd.chipnuts.karaoke-mmd", "mmd"],
  ["application/vnd.cinderella", "cdy"],
  ["application/vnd.claymore", "cla"],
  ["application/vnd.cloanto.rp9", "rp9"],
  ["application/vnd.clonk.c4group", "c4g"],
  ["application/vnd.cluetrust.cartomobile-config", "c11amc"],
  ["application/vnd.cluetrust.cartomobile-config-pkg", "c11amz"],
  ["application/vnd.commonspace", "csp"],
  ["application/vnd.contact.cmsg", "cdbcmsg"],
  ["application/vnd.cosmocaller", "cmc"],
  ["application/vnd.crick.clicker", "clkx"],
  ["application/vnd.crick.clicker.keyboard", "clkk"],
  ["application/vnd.crick.clicker.palette", "clkp"],
  ["application/vnd.crick.clicker.template", "clkt"],
  ["application/vnd.crick.clicker.wordbank", "clkw"],
  ["application/vnd.criticaltools.wbs+xml", "wbs"],
  ["application/vnd.ctc-posml", "pml"],
  ["application/vnd.cups-ppd", "ppd"],
  ["application/vnd.curl.car", "car"],
  ["application/vnd.curl.pcurl", "pcurl"],
  ["application/vnd.data-vision.rdz", "rdz"],
  ["application/vnd.denovo.fcselayout-link", "fe_launch"],
  ["application/vnd.dna", "dna"],
  ["application/vnd.dolby.mlp", "mlp"],
  ["application/vnd.dpgraph", "dpg"],
  ["application/vnd.dreamfactory", "dfac"],
  ["application/vnd.dvb.ait", "ait"],
  ["application/vnd.dvb.service", "svc"],
  ["application/vnd.dynageo", "geo"],
  ["application/vnd.ecowin.chart", "mag"],
  ["application/vnd.enliven", "nml"],
  ["application/vnd.epson.esf", "esf"],
  ["application/vnd.epson.msf", "msf"],
  ["application/vnd.epson.quickanime", "qam"],
  ["application/vnd.epson.salt", "slt"],
  ["application/vnd.epson.ssf", "ssf"],
  ["application/vnd.eszigno3+xml", "es3"],
  ["application/vnd.ezpix-album", "ez2"],
  ["application/vnd.ezpix-package", "ez3"],
  ["application/vnd.fdf", "fdf"],
  ["application/vnd.fdsn.seed", "seed"],
  ["application/vnd.flographit", "gph"],
  ["application/vnd.fluxtime.clip", "ftc"],
  ["application/vnd.framemaker", "fm"],
  ["application/vnd.frogans.fnc", "fnc"],
  ["application/vnd.frogans.ltf", "ltf"],
  ["application/vnd.fsc.weblaunch", "fsc"],
  ["application/vnd.fujitsu.oasys", "oas"],
  ["application/vnd.fujitsu.oasys2", "oa2"],
  ["application/vnd.fujitsu.oasys3", "oa3"],
  ["application/vnd.fujitsu.oasysgp", "fg5"],
  ["application/vnd.fujitsu.oasysprs", "bh2"],
  ["application/vnd.fujixerox.ddd", "ddd"],
  ["application/vnd.fujixerox.docuworks", "xdw"],
  ["application/vnd.fujixerox.docuworks.binder", "xbd"],
  ["application/vnd.fuzzysheet", "fzs"],
  ["application/vnd.genomatix.tuxedo", "txd"],
  ["application/vnd.geogebra.file", "ggb"],
  ["application/vnd.geogebra.tool", "ggt"],
  ["application/vnd.geometry-explorer", "gex"],
  ["application/vnd.geonext", "gxt"],
  ["application/vnd.geoplan", "g2w"],
  ["application/vnd.geospace", "g3w"],
  ["application/vnd.gmx", "gmx"],
  ["application/vnd.google-earth.kml+xml", "kml"],
  ["application/vnd.google-earth.kmz", "kmz"],
  ["application/vnd.grafeq", "gqf"],
  ["application/vnd.groove-account", "gac"],
  ["application/vnd.groove-help", "ghf"],
  ["application/vnd.groove-identity-message", "gim"],
  ["application/vnd.groove-injector", "grv"],
  ["application/vnd.groove-tool-message", "gtm"],
  ["application/vnd.groove-tool-template", "tpl"],
  ["application/vnd.groove-vcard", "vcg"],
  ["application/vnd.hal+xml", "hal"],
  ["application/vnd.handheld-entertainment+xml", "zmm"],
  ["application/vnd.hbci", "hbci"],
  ["application/vnd.hhe.lesson-player", "les"],
  ["application/vnd.hp-hpgl", ["hgl", "hpg", "hpgl"]],
  ["application/vnd.hp-hpid", "hpid"],
  ["application/vnd.hp-hps", "hps"],
  ["application/vnd.hp-jlyt", "jlt"],
  ["application/vnd.hp-pcl", "pcl"],
  ["application/vnd.hp-pclxl", "pclxl"],
  ["application/vnd.hydrostatix.sof-data", "sfd-hdstx"],
  ["application/vnd.hzn-3d-crossword", "x3d"],
  ["application/vnd.ibm.minipay", "mpy"],
  ["application/vnd.ibm.modcap", "afp"],
  ["application/vnd.ibm.rights-management", "irm"],
  ["application/vnd.ibm.secure-container", "sc"],
  ["application/vnd.iccprofile", "icc"],
  ["application/vnd.igloader", "igl"],
  ["application/vnd.immervision-ivp", "ivp"],
  ["application/vnd.immervision-ivu", "ivu"],
  ["application/vnd.insors.igm", "igm"],
  ["application/vnd.intercon.formnet", "xpw"],
  ["application/vnd.intergeo", "i2g"],
  ["application/vnd.intu.qbo", "qbo"],
  ["application/vnd.intu.qfx", "qfx"],
  ["application/vnd.ipunplugged.rcprofile", "rcprofile"],
  ["application/vnd.irepository.package+xml", "irp"],
  ["application/vnd.is-xpr", "xpr"],
  ["application/vnd.isac.fcs", "fcs"],
  ["application/vnd.jam", "jam"],
  ["application/vnd.jcp.javame.midlet-rms", "rms"],
  ["application/vnd.jisp", "jisp"],
  ["application/vnd.joost.joda-archive", "joda"],
  ["application/vnd.kahootz", "ktz"],
  ["application/vnd.kde.karbon", "karbon"],
  ["application/vnd.kde.kchart", "chrt"],
  ["application/vnd.kde.kformula", "kfo"],
  ["application/vnd.kde.kivio", "flw"],
  ["application/vnd.kde.kontour", "kon"],
  ["application/vnd.kde.kpresenter", "kpr"],
  ["application/vnd.kde.kspread", "ksp"],
  ["application/vnd.kde.kword", "kwd"],
  ["application/vnd.kenameaapp", "htke"],
  ["application/vnd.kidspiration", "kia"],
  ["application/vnd.kinar", "kne"],
  ["application/vnd.koan", "skp"],
  ["application/vnd.kodak-descriptor", "sse"],
  ["application/vnd.las.las+xml", "lasxml"],
  ["application/vnd.llamagraphics.life-balance.desktop", "lbd"],
  ["application/vnd.llamagraphics.life-balance.exchange+xml", "lbe"],
  ["application/vnd.lotus-1-2-3", "123"],
  ["application/vnd.lotus-approach", "apr"],
  ["application/vnd.lotus-freelance", "pre"],
  ["application/vnd.lotus-notes", "nsf"],
  ["application/vnd.lotus-organizer", "org"],
  ["application/vnd.lotus-screencam", "scm"],
  ["application/vnd.lotus-wordpro", "lwp"],
  ["application/vnd.macports.portpkg", "portpkg"],
  ["application/vnd.mcd", "mcd"],
  ["application/vnd.medcalcdata", "mc1"],
  ["application/vnd.mediastation.cdkey", "cdkey"],
  ["application/vnd.mfer", "mwf"],
  ["application/vnd.mfmp", "mfm"],
  ["application/vnd.micrografx.flo", "flo"],
  ["application/vnd.micrografx.igx", "igx"],
  ["application/vnd.mif", "mif"],
  ["application/vnd.mobius.daf", "daf"],
  ["application/vnd.mobius.dis", "dis"],
  ["application/vnd.mobius.mbk", "mbk"],
  ["application/vnd.mobius.mqy", "mqy"],
  ["application/vnd.mobius.msl", "msl"],
  ["application/vnd.mobius.plc", "plc"],
  ["application/vnd.mobius.txf", "txf"],
  ["application/vnd.mophun.application", "mpn"],
  ["application/vnd.mophun.certificate", "mpc"],
  ["application/vnd.mozilla.xul+xml", "xul"],
  ["application/vnd.ms-artgalry", "cil"],
  ["application/vnd.ms-cab-compressed", "cab"],
  ["application/vnd.ms-excel", ["xls", "xla", "xlc", "xlm", "xlt", "xlw", "xlb", "xll"]],
  ["application/vnd.ms-excel.addin.macroenabled.12", "xlam"],
  ["application/vnd.ms-excel.sheet.binary.macroenabled.12", "xlsb"],
  ["application/vnd.ms-excel.sheet.macroenabled.12", "xlsm"],
  ["application/vnd.ms-excel.template.macroenabled.12", "xltm"],
  ["application/vnd.ms-fontobject", "eot"],
  ["application/vnd.ms-htmlhelp", "chm"],
  ["application/vnd.ms-ims", "ims"],
  ["application/vnd.ms-lrm", "lrm"],
  ["application/vnd.ms-officetheme", "thmx"],
  ["application/vnd.ms-outlook", "msg"],
  ["application/vnd.ms-pki.certstore", "sst"],
  ["application/vnd.ms-pki.pko", "pko"],
  ["application/vnd.ms-pki.seccat", "cat"],
  ["application/vnd.ms-pki.stl", "stl"],
  ["application/vnd.ms-pkicertstore", "sst"],
  ["application/vnd.ms-pkiseccat", "cat"],
  ["application/vnd.ms-pkistl", "stl"],
  ["application/vnd.ms-powerpoint", ["ppt", "pot", "pps", "ppa", "pwz"]],
  ["application/vnd.ms-powerpoint.addin.macroenabled.12", "ppam"],
  ["application/vnd.ms-powerpoint.presentation.macroenabled.12", "pptm"],
  ["application/vnd.ms-powerpoint.slide.macroenabled.12", "sldm"],
  ["application/vnd.ms-powerpoint.slideshow.macroenabled.12", "ppsm"],
  ["application/vnd.ms-powerpoint.template.macroenabled.12", "potm"],
  ["application/vnd.ms-project", "mpp"],
  ["application/vnd.ms-word.document.macroenabled.12", "docm"],
  ["application/vnd.ms-word.template.macroenabled.12", "dotm"],
  ["application/vnd.ms-works", ["wks", "wcm", "wdb", "wps"]],
  ["application/vnd.ms-wpl", "wpl"],
  ["application/vnd.ms-xpsdocument", "xps"],
  ["application/vnd.mseq", "mseq"],
  ["application/vnd.musician", "mus"],
  ["application/vnd.muvee.style", "msty"],
  ["application/vnd.neurolanguage.nlu", "nlu"],
  ["application/vnd.noblenet-directory", "nnd"],
  ["application/vnd.noblenet-sealer", "nns"],
  ["application/vnd.noblenet-web", "nnw"],
  ["application/vnd.nokia.configuration-message", "ncm"],
  ["application/vnd.nokia.n-gage.data", "ngdat"],
  ["application/vnd.nokia.n-gage.symbian.install", "n-gage"],
  ["application/vnd.nokia.radio-preset", "rpst"],
  ["application/vnd.nokia.radio-presets", "rpss"],
  ["application/vnd.nokia.ringing-tone", "rng"],
  ["application/vnd.novadigm.edm", "edm"],
  ["application/vnd.novadigm.edx", "edx"],
  ["application/vnd.novadigm.ext", "ext"],
  ["application/vnd.oasis.opendocument.chart", "odc"],
  ["application/vnd.oasis.opendocument.chart-template", "otc"],
  ["application/vnd.oasis.opendocument.database", "odb"],
  ["application/vnd.oasis.opendocument.formula", "odf"],
  ["application/vnd.oasis.opendocument.formula-template", "odft"],
  ["application/vnd.oasis.opendocument.graphics", "odg"],
  ["application/vnd.oasis.opendocument.graphics-template", "otg"],
  ["application/vnd.oasis.opendocument.image", "odi"],
  ["application/vnd.oasis.opendocument.image-template", "oti"],
  ["application/vnd.oasis.opendocument.presentation", "odp"],
  ["application/vnd.oasis.opendocument.presentation-template", "otp"],
  ["application/vnd.oasis.opendocument.spreadsheet", "ods"],
  ["application/vnd.oasis.opendocument.spreadsheet-template", "ots"],
  ["application/vnd.oasis.opendocument.text", "odt"],
  ["application/vnd.oasis.opendocument.text-master", "odm"],
  ["application/vnd.oasis.opendocument.text-template", "ott"],
  ["application/vnd.oasis.opendocument.text-web", "oth"],
  ["application/vnd.olpc-sugar", "xo"],
  ["application/vnd.oma.dd2+xml", "dd2"],
  ["application/vnd.openofficeorg.extension", "oxt"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx"],
  ["application/vnd.openxmlformats-officedocument.presentationml.slide", "sldx"],
  ["application/vnd.openxmlformats-officedocument.presentationml.slideshow", "ppsx"],
  ["application/vnd.openxmlformats-officedocument.presentationml.template", "potx"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.template", "xltx"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.template", "dotx"],
  ["application/vnd.osgeo.mapguide.package", "mgp"],
  ["application/vnd.osgi.dp", "dp"],
  ["application/vnd.palm", "pdb"],
  ["application/vnd.pawaafile", "paw"],
  ["application/vnd.pg.format", "str"],
  ["application/vnd.pg.osasli", "ei6"],
  ["application/vnd.picsel", "efif"],
  ["application/vnd.pmi.widget", "wg"],
  ["application/vnd.pocketlearn", "plf"],
  ["application/vnd.powerbuilder6", "pbd"],
  ["application/vnd.previewsystems.box", "box"],
  ["application/vnd.proteus.magazine", "mgz"],
  ["application/vnd.publishare-delta-tree", "qps"],
  ["application/vnd.pvi.ptid1", "ptid"],
  ["application/vnd.quark.quarkxpress", "qxd"],
  ["application/vnd.realvnc.bed", "bed"],
  ["application/vnd.recordare.musicxml", "mxl"],
  ["application/vnd.recordare.musicxml+xml", "musicxml"],
  ["application/vnd.rig.cryptonote", "cryptonote"],
  ["application/vnd.rim.cod", "cod"],
  ["application/vnd.rn-realmedia", "rm"],
  ["application/vnd.rn-realplayer", "rnx"],
  ["application/vnd.route66.link66+xml", "link66"],
  ["application/vnd.sailingtracker.track", "st"],
  ["application/vnd.seemail", "see"],
  ["application/vnd.sema", "sema"],
  ["application/vnd.semd", "semd"],
  ["application/vnd.semf", "semf"],
  ["application/vnd.shana.informed.formdata", "ifm"],
  ["application/vnd.shana.informed.formtemplate", "itp"],
  ["application/vnd.shana.informed.interchange", "iif"],
  ["application/vnd.shana.informed.package", "ipk"],
  ["application/vnd.simtech-mindmapper", "twd"],
  ["application/vnd.smaf", "mmf"],
  ["application/vnd.smart.teacher", "teacher"],
  ["application/vnd.solent.sdkm+xml", "sdkm"],
  ["application/vnd.spotfire.dxp", "dxp"],
  ["application/vnd.spotfire.sfs", "sfs"],
  ["application/vnd.stardivision.calc", "sdc"],
  ["application/vnd.stardivision.draw", "sda"],
  ["application/vnd.stardivision.impress", "sdd"],
  ["application/vnd.stardivision.math", "smf"],
  ["application/vnd.stardivision.writer", "sdw"],
  ["application/vnd.stardivision.writer-global", "sgl"],
  ["application/vnd.stepmania.stepchart", "sm"],
  ["application/vnd.sun.xml.calc", "sxc"],
  ["application/vnd.sun.xml.calc.template", "stc"],
  ["application/vnd.sun.xml.draw", "sxd"],
  ["application/vnd.sun.xml.draw.template", "std"],
  ["application/vnd.sun.xml.impress", "sxi"],
  ["application/vnd.sun.xml.impress.template", "sti"],
  ["application/vnd.sun.xml.math", "sxm"],
  ["application/vnd.sun.xml.writer", "sxw"],
  ["application/vnd.sun.xml.writer.global", "sxg"],
  ["application/vnd.sun.xml.writer.template", "stw"],
  ["application/vnd.sus-calendar", "sus"],
  ["application/vnd.svd", "svd"],
  ["application/vnd.symbian.install", "sis"],
  ["application/vnd.syncml+xml", "xsm"],
  ["application/vnd.syncml.dm+wbxml", "bdm"],
  ["application/vnd.syncml.dm+xml", "xdm"],
  ["application/vnd.tao.intent-module-archive", "tao"],
  ["application/vnd.tmobile-livetv", "tmo"],
  ["application/vnd.trid.tpt", "tpt"],
  ["application/vnd.triscape.mxs", "mxs"],
  ["application/vnd.trueapp", "tra"],
  ["application/vnd.ufdl", "ufd"],
  ["application/vnd.uiq.theme", "utz"],
  ["application/vnd.umajin", "umj"],
  ["application/vnd.unity", "unityweb"],
  ["application/vnd.uoml+xml", "uoml"],
  ["application/vnd.vcx", "vcx"],
  ["application/vnd.visio", "vsd"],
  ["application/vnd.visionary", "vis"],
  ["application/vnd.vsf", "vsf"],
  ["application/vnd.wap.wbxml", "wbxml"],
  ["application/vnd.wap.wmlc", "wmlc"],
  ["application/vnd.wap.wmlscriptc", "wmlsc"],
  ["application/vnd.webturbo", "wtb"],
  ["application/vnd.wolfram.player", "nbp"],
  ["application/vnd.wordperfect", "wpd"],
  ["application/vnd.wqd", "wqd"],
  ["application/vnd.wt.stf", "stf"],
  ["application/vnd.xara", ["web", "xar"]],
  ["application/vnd.xfdl", "xfdl"],
  ["application/vnd.yamaha.hv-dic", "hvd"],
  ["application/vnd.yamaha.hv-script", "hvs"],
  ["application/vnd.yamaha.hv-voice", "hvp"],
  ["application/vnd.yamaha.openscoreformat", "osf"],
  ["application/vnd.yamaha.openscoreformat.osfpvg+xml", "osfpvg"],
  ["application/vnd.yamaha.smaf-audio", "saf"],
  ["application/vnd.yamaha.smaf-phrase", "spf"],
  ["application/vnd.yellowriver-custom-menu", "cmp"],
  ["application/vnd.zul", "zir"],
  ["application/vnd.zzazz.deck+xml", "zaz"],
  ["application/vocaltec-media-desc", "vmd"],
  ["application/vocaltec-media-file", "vmf"],
  ["application/voicexml+xml", "vxml"],
  ["application/widget", "wgt"],
  ["application/winhlp", "hlp"],
  ["application/wordperfect", ["wp", "wp5", "wp6", "wpd"]],
  ["application/wordperfect6.0", ["w60", "wp5"]],
  ["application/wordperfect6.1", "w61"],
  ["application/wsdl+xml", "wsdl"],
  ["application/wspolicy+xml", "wspolicy"],
  ["application/x-123", "wk1"],
  ["application/x-7z-compressed", "7z"],
  ["application/x-abiword", "abw"],
  ["application/x-ace-compressed", "ace"],
  ["application/x-aim", "aim"],
  ["application/x-authorware-bin", "aab"],
  ["application/x-authorware-map", "aam"],
  ["application/x-authorware-seg", "aas"],
  ["application/x-bcpio", "bcpio"],
  ["application/x-binary", "bin"],
  ["application/x-binhex40", "hqx"],
  ["application/x-bittorrent", "torrent"],
  ["application/x-bsh", ["bsh", "sh", "shar"]],
  ["application/x-bytecode.elisp", "elc"],
  ["application/x-bytecode.python", "pyc"],
  ["application/x-bzip", "bz"],
  ["application/x-bzip2", ["boz", "bz2"]],
  ["application/x-cdf", "cdf"],
  ["application/x-cdlink", "vcd"],
  ["application/x-chat", ["cha", "chat"]],
  ["application/x-chess-pgn", "pgn"],
  ["application/x-cmu-raster", "ras"],
  ["application/x-cocoa", "cco"],
  ["application/x-compactpro", "cpt"],
  ["application/x-compress", "z"],
  ["application/x-compressed", ["tgz", "gz", "z", "zip"]],
  ["application/x-conference", "nsc"],
  ["application/x-cpio", "cpio"],
  ["application/x-cpt", "cpt"],
  ["application/x-csh", "csh"],
  ["application/x-debian-package", "deb"],
  ["application/x-deepv", "deepv"],
  ["application/x-director", ["dir", "dcr", "dxr"]],
  ["application/x-doom", "wad"],
  ["application/x-dtbncx+xml", "ncx"],
  ["application/x-dtbook+xml", "dtb"],
  ["application/x-dtbresource+xml", "res"],
  ["application/x-dvi", "dvi"],
  ["application/x-elc", "elc"],
  ["application/x-envoy", ["env", "evy"]],
  ["application/x-esrehber", "es"],
  ["application/x-excel", ["xls", "xla", "xlb", "xlc", "xld", "xlk", "xll", "xlm", "xlt", "xlv", "xlw"]],
  ["application/x-font-bdf", "bdf"],
  ["application/x-font-ghostscript", "gsf"],
  ["application/x-font-linux-psf", "psf"],
  ["application/x-font-otf", "otf"],
  ["application/x-font-pcf", "pcf"],
  ["application/x-font-snf", "snf"],
  ["application/x-font-ttf", "ttf"],
  ["application/x-font-type1", "pfa"],
  ["application/x-font-woff", "woff"],
  ["application/x-frame", "mif"],
  ["application/x-freelance", "pre"],
  ["application/x-futuresplash", "spl"],
  ["application/x-gnumeric", "gnumeric"],
  ["application/x-gsp", "gsp"],
  ["application/x-gss", "gss"],
  ["application/x-gtar", "gtar"],
  ["application/x-gzip", ["gz", "gzip"]],
  ["application/x-hdf", "hdf"],
  ["application/x-helpfile", ["help", "hlp"]],
  ["application/x-httpd-imap", "imap"],
  ["application/x-ima", "ima"],
  ["application/x-internet-signup", ["ins", "isp"]],
  ["application/x-internett-signup", "ins"],
  ["application/x-inventor", "iv"],
  ["application/x-ip2", "ip"],
  ["application/x-iphone", "iii"],
  ["application/x-java-class", "class"],
  ["application/x-java-commerce", "jcm"],
  ["application/x-java-jnlp-file", "jnlp"],
  ["application/x-javascript", "js"],
  ["application/x-koan", ["skd", "skm", "skp", "skt"]],
  ["application/x-ksh", "ksh"],
  ["application/x-latex", ["latex", "ltx"]],
  ["application/x-lha", "lha"],
  ["application/x-lisp", "lsp"],
  ["application/x-livescreen", "ivy"],
  ["application/x-lotus", "wq1"],
  ["application/x-lotusscreencam", "scm"],
  ["application/x-lzh", "lzh"],
  ["application/x-lzx", "lzx"],
  ["application/x-mac-binhex40", "hqx"],
  ["application/x-macbinary", "bin"],
  ["application/x-magic-cap-package-1.0", "mc$"],
  ["application/x-mathcad", "mcd"],
  ["application/x-meme", "mm"],
  ["application/x-midi", ["mid", "midi"]],
  ["application/x-mif", "mif"],
  ["application/x-mix-transfer", "nix"],
  ["application/x-mobipocket-ebook", "prc"],
  ["application/x-mplayer2", "asx"],
  ["application/x-ms-application", "application"],
  ["application/x-ms-wmd", "wmd"],
  ["application/x-ms-wmz", "wmz"],
  ["application/x-ms-xbap", "xbap"],
  ["application/x-msaccess", "mdb"],
  ["application/x-msbinder", "obd"],
  ["application/x-mscardfile", "crd"],
  ["application/x-msclip", "clp"],
  ["application/x-msdownload", ["exe", "dll"]],
  ["application/x-msexcel", ["xls", "xla", "xlw"]],
  ["application/x-msmediaview", ["mvb", "m13", "m14"]],
  ["application/x-msmetafile", "wmf"],
  ["application/x-msmoney", "mny"],
  ["application/x-mspowerpoint", "ppt"],
  ["application/x-mspublisher", "pub"],
  ["application/x-msschedule", "scd"],
  ["application/x-msterminal", "trm"],
  ["application/x-mswrite", "wri"],
  ["application/x-navi-animation", "ani"],
  ["application/x-navidoc", "nvd"],
  ["application/x-navimap", "map"],
  ["application/x-navistyle", "stl"],
  ["application/x-netcdf", ["cdf", "nc"]],
  ["application/x-newton-compatible-pkg", "pkg"],
  ["application/x-nokia-9000-communicator-add-on-software", "aos"],
  ["application/x-omc", "omc"],
  ["application/x-omcdatamaker", "omcd"],
  ["application/x-omcregerator", "omcr"],
  ["application/x-pagemaker", ["pm4", "pm5"]],
  ["application/x-pcl", "pcl"],
  ["application/x-perfmon", ["pma", "pmc", "pml", "pmr", "pmw"]],
  ["application/x-pixclscript", "plx"],
  ["application/x-pkcs10", "p10"],
  ["application/x-pkcs12", ["p12", "pfx"]],
  ["application/x-pkcs7-certificates", ["p7b", "spc"]],
  ["application/x-pkcs7-certreqresp", "p7r"],
  ["application/x-pkcs7-mime", ["p7m", "p7c"]],
  ["application/x-pkcs7-signature", ["p7s", "p7a"]],
  ["application/x-pointplus", "css"],
  ["application/x-portable-anymap", "pnm"],
  ["application/x-project", ["mpc", "mpt", "mpv", "mpx"]],
  ["application/x-qpro", "wb1"],
  ["application/x-rar-compressed", "rar"],
  ["application/x-rtf", "rtf"],
  ["application/x-sdp", "sdp"],
  ["application/x-sea", "sea"],
  ["application/x-seelogo", "sl"],
  ["application/x-sh", "sh"],
  ["application/x-shar", ["shar", "sh"]],
  ["application/x-shockwave-flash", "swf"],
  ["application/x-silverlight-app", "xap"],
  ["application/x-sit", "sit"],
  ["application/x-sprite", ["spr", "sprite"]],
  ["application/x-stuffit", "sit"],
  ["application/x-stuffitx", "sitx"],
  ["application/x-sv4cpio", "sv4cpio"],
  ["application/x-sv4crc", "sv4crc"],
  ["application/x-tar", "tar"],
  ["application/x-tbook", ["sbk", "tbk"]],
  ["application/x-tcl", "tcl"],
  ["application/x-tex", "tex"],
  ["application/x-tex-tfm", "tfm"],
  ["application/x-texinfo", ["texi", "texinfo"]],
  ["application/x-troff", ["roff", "t", "tr"]],
  ["application/x-troff-man", "man"],
  ["application/x-troff-me", "me"],
  ["application/x-troff-ms", "ms"],
  ["application/x-troff-msvideo", "avi"],
  ["application/x-ustar", "ustar"],
  ["application/x-visio", ["vsd", "vst", "vsw"]],
  ["application/x-vnd.audioexplosion.mzz", "mzz"],
  ["application/x-vnd.ls-xpix", "xpix"],
  ["application/x-vrml", "vrml"],
  ["application/x-wais-source", ["src", "wsrc"]],
  ["application/x-winhelp", "hlp"],
  ["application/x-wintalk", "wtk"],
  ["application/x-world", ["wrl", "svr"]],
  ["application/x-wpwin", "wpd"],
  ["application/x-wri", "wri"],
  ["application/x-x509-ca-cert", ["cer", "crt", "der"]],
  ["application/x-x509-user-cert", "crt"],
  ["application/x-xfig", "fig"],
  ["application/x-xpinstall", "xpi"],
  ["application/x-zip-compressed", "zip"],
  ["application/xcap-diff+xml", "xdf"],
  ["application/xenc+xml", "xenc"],
  ["application/xhtml+xml", "xhtml"],
  ["application/xml", "xml"],
  ["application/xml-dtd", "dtd"],
  ["application/xop+xml", "xop"],
  ["application/xslt+xml", "xslt"],
  ["application/xspf+xml", "xspf"],
  ["application/xv+xml", "mxml"],
  ["application/yang", "yang"],
  ["application/yin+xml", "yin"],
  ["application/ynd.ms-pkipko", "pko"],
  ["application/zip", "zip"],
  ["audio/adpcm", "adp"],
  ["audio/aiff", ["aiff", "aif", "aifc"]],
  ["audio/basic", ["snd", "au"]],
  ["audio/it", "it"],
  ["audio/make", ["funk", "my", "pfunk"]],
  ["audio/make.my.funk", "pfunk"],
  ["audio/mid", ["mid", "rmi"]],
  ["audio/midi", ["midi", "kar", "mid"]],
  ["audio/mod", "mod"],
  ["audio/mp4", "mp4a"],
  ["audio/mpeg", ["mpga", "mp3", "m2a", "mp2", "mpa", "mpg"]],
  ["audio/mpeg3", "mp3"],
  ["audio/nspaudio", ["la", "lma"]],
  ["audio/ogg", "oga"],
  ["audio/s3m", "s3m"],
  ["audio/tsp-audio", "tsi"],
  ["audio/tsplayer", "tsp"],
  ["audio/vnd.dece.audio", "uva"],
  ["audio/vnd.digital-winds", "eol"],
  ["audio/vnd.dra", "dra"],
  ["audio/vnd.dts", "dts"],
  ["audio/vnd.dts.hd", "dtshd"],
  ["audio/vnd.lucent.voice", "lvp"],
  ["audio/vnd.ms-playready.media.pya", "pya"],
  ["audio/vnd.nuera.ecelp4800", "ecelp4800"],
  ["audio/vnd.nuera.ecelp7470", "ecelp7470"],
  ["audio/vnd.nuera.ecelp9600", "ecelp9600"],
  ["audio/vnd.qcelp", "qcp"],
  ["audio/vnd.rip", "rip"],
  ["audio/voc", "voc"],
  ["audio/voxware", "vox"],
  ["audio/wav", "wav"],
  ["audio/webm", "weba"],
  ["audio/x-aac", "aac"],
  ["audio/x-adpcm", "snd"],
  ["audio/x-aiff", ["aiff", "aif", "aifc"]],
  ["audio/x-au", "au"],
  ["audio/x-gsm", ["gsd", "gsm"]],
  ["audio/x-jam", "jam"],
  ["audio/x-liveaudio", "lam"],
  ["audio/x-mid", ["mid", "midi"]],
  ["audio/x-midi", ["midi", "mid"]],
  ["audio/x-mod", "mod"],
  ["audio/x-mpeg", "mp2"],
  ["audio/x-mpeg-3", "mp3"],
  ["audio/x-mpegurl", "m3u"],
  ["audio/x-mpequrl", "m3u"],
  ["audio/x-ms-wax", "wax"],
  ["audio/x-ms-wma", "wma"],
  ["audio/x-nspaudio", ["la", "lma"]],
  ["audio/x-pn-realaudio", ["ra", "ram", "rm", "rmm", "rmp"]],
  ["audio/x-pn-realaudio-plugin", ["ra", "rmp", "rpm"]],
  ["audio/x-psid", "sid"],
  ["audio/x-realaudio", "ra"],
  ["audio/x-twinvq", "vqf"],
  ["audio/x-twinvq-plugin", ["vqe", "vql"]],
  ["audio/x-vnd.audioexplosion.mjuicemediafile", "mjf"],
  ["audio/x-voc", "voc"],
  ["audio/x-wav", "wav"],
  ["audio/xm", "xm"],
  ["chemical/x-cdx", "cdx"],
  ["chemical/x-cif", "cif"],
  ["chemical/x-cmdf", "cmdf"],
  ["chemical/x-cml", "cml"],
  ["chemical/x-csml", "csml"],
  ["chemical/x-pdb", ["pdb", "xyz"]],
  ["chemical/x-xyz", "xyz"],
  ["drawing/x-dwf", "dwf"],
  ["i-world/i-vrml", "ivr"],
  ["image/bmp", ["bmp", "bm"]],
  ["image/cgm", "cgm"],
  ["image/cis-cod", "cod"],
  ["image/cmu-raster", ["ras", "rast"]],
  ["image/fif", "fif"],
  ["image/florian", ["flo", "turbot"]],
  ["image/g3fax", "g3"],
  ["image/gif", "gif"],
  ["image/ief", ["ief", "iefs"]],
  ["image/jpeg", ["jpeg", "jpe", "jpg", "jfif", "jfif-tbnl"]],
  ["image/jutvision", "jut"],
  ["image/ktx", "ktx"],
  ["image/naplps", ["nap", "naplps"]],
  ["image/pict", ["pic", "pict"]],
  ["image/pipeg", "jfif"],
  ["image/pjpeg", ["jfif", "jpe", "jpeg", "jpg"]],
  ["image/png", ["png", "x-png"]],
  ["image/prs.btif", "btif"],
  ["image/svg+xml", "svg"],
  ["image/tiff", ["tif", "tiff"]],
  ["image/vasa", "mcf"],
  ["image/vnd.adobe.photoshop", "psd"],
  ["image/vnd.dece.graphic", "uvi"],
  ["image/vnd.djvu", "djvu"],
  ["image/vnd.dvb.subtitle", "sub"],
  ["image/vnd.dwg", ["dwg", "dxf", "svf"]],
  ["image/vnd.dxf", "dxf"],
  ["image/vnd.fastbidsheet", "fbs"],
  ["image/vnd.fpx", "fpx"],
  ["image/vnd.fst", "fst"],
  ["image/vnd.fujixerox.edmics-mmr", "mmr"],
  ["image/vnd.fujixerox.edmics-rlc", "rlc"],
  ["image/vnd.ms-modi", "mdi"],
  ["image/vnd.net-fpx", ["fpx", "npx"]],
  ["image/vnd.rn-realflash", "rf"],
  ["image/vnd.rn-realpix", "rp"],
  ["image/vnd.wap.wbmp", "wbmp"],
  ["image/vnd.xiff", "xif"],
  ["image/webp", "webp"],
  ["image/x-cmu-raster", "ras"],
  ["image/x-cmx", "cmx"],
  ["image/x-dwg", ["dwg", "dxf", "svf"]],
  ["image/x-freehand", "fh"],
  ["image/x-icon", "ico"],
  ["image/x-jg", "art"],
  ["image/x-jps", "jps"],
  ["image/x-niff", ["niff", "nif"]],
  ["image/x-pcx", "pcx"],
  ["image/x-pict", ["pct", "pic"]],
  ["image/x-portable-anymap", "pnm"],
  ["image/x-portable-bitmap", "pbm"],
  ["image/x-portable-graymap", "pgm"],
  ["image/x-portable-greymap", "pgm"],
  ["image/x-portable-pixmap", "ppm"],
  ["image/x-quicktime", ["qif", "qti", "qtif"]],
  ["image/x-rgb", "rgb"],
  ["image/x-tiff", ["tif", "tiff"]],
  ["image/x-windows-bmp", "bmp"],
  ["image/x-xbitmap", "xbm"],
  ["image/x-xbm", "xbm"],
  ["image/x-xpixmap", ["xpm", "pm"]],
  ["image/x-xwd", "xwd"],
  ["image/x-xwindowdump", "xwd"],
  ["image/xbm", "xbm"],
  ["image/xpm", "xpm"],
  ["message/rfc822", ["eml", "mht", "mhtml", "nws", "mime"]],
  ["model/iges", ["iges", "igs"]],
  ["model/mesh", "msh"],
  ["model/vnd.collada+xml", "dae"],
  ["model/vnd.dwf", "dwf"],
  ["model/vnd.gdl", "gdl"],
  ["model/vnd.gtw", "gtw"],
  ["model/vnd.mts", "mts"],
  ["model/vnd.vtu", "vtu"],
  ["model/vrml", ["vrml", "wrl", "wrz"]],
  ["model/x-pov", "pov"],
  ["multipart/x-gzip", "gzip"],
  ["multipart/x-ustar", "ustar"],
  ["multipart/x-zip", "zip"],
  ["music/crescendo", ["mid", "midi"]],
  ["music/x-karaoke", "kar"],
  ["paleovu/x-pv", "pvu"],
  ["text/asp", "asp"],
  ["text/calendar", "ics"],
  ["text/css", "css"],
  ["text/csv", "csv"],
  ["text/ecmascript", "js"],
  ["text/h323", "323"],
  ["text/html", ["html", "htm", "stm", "acgi", "htmls", "htx", "shtml"]],
  ["text/iuls", "uls"],
  ["text/javascript", "js"],
  ["text/mcf", "mcf"],
  ["text/n3", "n3"],
  ["text/pascal", "pas"],
  [
    "text/plain",
    [
      "txt",
      "bas",
      "c",
      "h",
      "c++",
      "cc",
      "com",
      "conf",
      "cxx",
      "def",
      "f",
      "f90",
      "for",
      "g",
      "hh",
      "idc",
      "jav",
      "java",
      "list",
      "log",
      "lst",
      "m",
      "mar",
      "pl",
      "sdml",
      "text"
    ]
  ],
  ["text/plain-bas", "par"],
  ["text/prs.lines.tag", "dsc"],
  ["text/richtext", ["rtx", "rt", "rtf"]],
  ["text/scriplet", "wsc"],
  ["text/scriptlet", "sct"],
  ["text/sgml", ["sgm", "sgml"]],
  ["text/tab-separated-values", "tsv"],
  ["text/troff", "t"],
  ["text/turtle", "ttl"],
  ["text/uri-list", ["uni", "unis", "uri", "uris"]],
  ["text/vnd.abc", "abc"],
  ["text/vnd.curl", "curl"],
  ["text/vnd.curl.dcurl", "dcurl"],
  ["text/vnd.curl.mcurl", "mcurl"],
  ["text/vnd.curl.scurl", "scurl"],
  ["text/vnd.fly", "fly"],
  ["text/vnd.fmi.flexstor", "flx"],
  ["text/vnd.graphviz", "gv"],
  ["text/vnd.in3d.3dml", "3dml"],
  ["text/vnd.in3d.spot", "spot"],
  ["text/vnd.rn-realtext", "rt"],
  ["text/vnd.sun.j2me.app-descriptor", "jad"],
  ["text/vnd.wap.wml", "wml"],
  ["text/vnd.wap.wmlscript", "wmls"],
  ["text/webviewhtml", "htt"],
  ["text/x-asm", ["asm", "s"]],
  ["text/x-audiosoft-intra", "aip"],
  ["text/x-c", ["c", "cc", "cpp"]],
  ["text/x-component", "htc"],
  ["text/x-fortran", ["for", "f", "f77", "f90"]],
  ["text/x-h", ["h", "hh"]],
  ["text/x-java-source", ["java", "jav"]],
  ["text/x-java-source,java", "java"],
  ["text/x-la-asf", "lsx"],
  ["text/x-m", "m"],
  ["text/x-pascal", "p"],
  ["text/x-script", "hlb"],
  ["text/x-script.csh", "csh"],
  ["text/x-script.elisp", "el"],
  ["text/x-script.guile", "scm"],
  ["text/x-script.ksh", "ksh"],
  ["text/x-script.lisp", "lsp"],
  ["text/x-script.perl", "pl"],
  ["text/x-script.perl-module", "pm"],
  ["text/x-script.phyton", "py"],
  ["text/x-script.rexx", "rexx"],
  ["text/x-script.scheme", "scm"],
  ["text/x-script.sh", "sh"],
  ["text/x-script.tcl", "tcl"],
  ["text/x-script.tcsh", "tcsh"],
  ["text/x-script.zsh", "zsh"],
  ["text/x-server-parsed-html", ["shtml", "ssi"]],
  ["text/x-setext", "etx"],
  ["text/x-sgml", ["sgm", "sgml"]],
  ["text/x-speech", ["spc", "talk"]],
  ["text/x-uil", "uil"],
  ["text/x-uuencode", ["uu", "uue"]],
  ["text/x-vcalendar", "vcs"],
  ["text/x-vcard", "vcf"],
  ["text/xml", "xml"],
  ["video/3gpp", "3gp"],
  ["video/3gpp2", "3g2"],
  ["video/animaflex", "afl"],
  ["video/avi", "avi"],
  ["video/avs-video", "avs"],
  ["video/dl", "dl"],
  ["video/fli", "fli"],
  ["video/gl", "gl"],
  ["video/h261", "h261"],
  ["video/h263", "h263"],
  ["video/h264", "h264"],
  ["video/jpeg", "jpgv"],
  ["video/jpm", "jpm"],
  ["video/mj2", "mj2"],
  ["video/mp4", "mp4"],
  ["video/mpeg", ["mpeg", "mp2", "mpa", "mpe", "mpg", "mpv2", "m1v", "m2v", "mp3"]],
  ["video/msvideo", "avi"],
  ["video/ogg", "ogv"],
  ["video/quicktime", ["mov", "qt", "moov"]],
  ["video/vdo", "vdo"],
  ["video/vivo", ["viv", "vivo"]],
  ["video/vnd.dece.hd", "uvh"],
  ["video/vnd.dece.mobile", "uvm"],
  ["video/vnd.dece.pd", "uvp"],
  ["video/vnd.dece.sd", "uvs"],
  ["video/vnd.dece.video", "uvv"],
  ["video/vnd.fvt", "fvt"],
  ["video/vnd.mpegurl", "mxu"],
  ["video/vnd.ms-playready.media.pyv", "pyv"],
  ["video/vnd.rn-realvideo", "rv"],
  ["video/vnd.uvvu.mp4", "uvu"],
  ["video/vnd.vivo", ["viv", "vivo"]],
  ["video/vosaic", "vos"],
  ["video/webm", "webm"],
  ["video/x-amt-demorun", "xdr"],
  ["video/x-amt-showrun", "xsr"],
  ["video/x-atomic3d-feature", "fmf"],
  ["video/x-dl", "dl"],
  ["video/x-dv", ["dif", "dv"]],
  ["video/x-f4v", "f4v"],
  ["video/x-fli", "fli"],
  ["video/x-flv", "flv"],
  ["video/x-gl", "gl"],
  ["video/x-isvideo", "isu"],
  ["video/x-la-asf", ["lsf", "lsx"]],
  ["video/x-m4v", "m4v"],
  ["video/x-motion-jpeg", "mjpg"],
  ["video/x-mpeg", ["mp3", "mp2"]],
  ["video/x-mpeq2a", "mp2"],
  ["video/x-ms-asf", ["asf", "asr", "asx"]],
  ["video/x-ms-asf-plugin", "asx"],
  ["video/x-ms-wm", "wm"],
  ["video/x-ms-wmv", "wmv"],
  ["video/x-ms-wmx", "wmx"],
  ["video/x-ms-wvx", "wvx"],
  ["video/x-msvideo", "avi"],
  ["video/x-qtc", "qtc"],
  ["video/x-scm", "scm"],
  ["video/x-sgi-movie", ["movie", "mv"]],
  ["windows/metafile", "wmf"],
  ["www/mime", "mime"],
  ["x-conference/x-cooltalk", "ice"],
  ["x-music/x-midi", ["mid", "midi"]],
  ["x-world/x-3dmf", ["3dm", "3dmf", "qd3", "qd3d"]],
  ["x-world/x-svr", "svr"],
  ["x-world/x-vrml", ["flr", "vrml", "wrl", "wrz", "xaf", "xof"]],
  ["x-world/x-vrt", "vrt"],
  ["xgl/drawing", "xgz"],
  ["xgl/movie", "xmz"]
]);
var extensions = /* @__PURE__ */ new Map([
  ["123", "application/vnd.lotus-1-2-3"],
  ["323", "text/h323"],
  ["*", "application/octet-stream"],
  ["3dm", "x-world/x-3dmf"],
  ["3dmf", "x-world/x-3dmf"],
  ["3dml", "text/vnd.in3d.3dml"],
  ["3g2", "video/3gpp2"],
  ["3gp", "video/3gpp"],
  ["7z", "application/x-7z-compressed"],
  ["a", "application/octet-stream"],
  ["aab", "application/x-authorware-bin"],
  ["aac", "audio/x-aac"],
  ["aam", "application/x-authorware-map"],
  ["aas", "application/x-authorware-seg"],
  ["abc", "text/vnd.abc"],
  ["abw", "application/x-abiword"],
  ["ac", "application/pkix-attr-cert"],
  ["acc", "application/vnd.americandynamics.acc"],
  ["ace", "application/x-ace-compressed"],
  ["acgi", "text/html"],
  ["acu", "application/vnd.acucobol"],
  ["acx", "application/internet-property-stream"],
  ["adp", "audio/adpcm"],
  ["aep", "application/vnd.audiograph"],
  ["afl", "video/animaflex"],
  ["afp", "application/vnd.ibm.modcap"],
  ["ahead", "application/vnd.ahead.space"],
  ["ai", "application/postscript"],
  ["aif", ["audio/aiff", "audio/x-aiff"]],
  ["aifc", ["audio/aiff", "audio/x-aiff"]],
  ["aiff", ["audio/aiff", "audio/x-aiff"]],
  ["aim", "application/x-aim"],
  ["aip", "text/x-audiosoft-intra"],
  ["air", "application/vnd.adobe.air-application-installer-package+zip"],
  ["ait", "application/vnd.dvb.ait"],
  ["ami", "application/vnd.amiga.ami"],
  ["ani", "application/x-navi-animation"],
  ["aos", "application/x-nokia-9000-communicator-add-on-software"],
  ["apk", "application/vnd.android.package-archive"],
  ["application", "application/x-ms-application"],
  ["apr", "application/vnd.lotus-approach"],
  ["aps", "application/mime"],
  ["arc", "application/octet-stream"],
  ["arj", ["application/arj", "application/octet-stream"]],
  ["art", "image/x-jg"],
  ["asf", "video/x-ms-asf"],
  ["asm", "text/x-asm"],
  ["aso", "application/vnd.accpac.simply.aso"],
  ["asp", "text/asp"],
  ["asr", "video/x-ms-asf"],
  ["asx", ["video/x-ms-asf", "application/x-mplayer2", "video/x-ms-asf-plugin"]],
  ["atc", "application/vnd.acucorp"],
  ["atomcat", "application/atomcat+xml"],
  ["atomsvc", "application/atomsvc+xml"],
  ["atx", "application/vnd.antix.game-component"],
  ["au", ["audio/basic", "audio/x-au"]],
  ["avi", ["video/avi", "video/msvideo", "application/x-troff-msvideo", "video/x-msvideo"]],
  ["avs", "video/avs-video"],
  ["aw", "application/applixware"],
  ["axs", "application/olescript"],
  ["azf", "application/vnd.airzip.filesecure.azf"],
  ["azs", "application/vnd.airzip.filesecure.azs"],
  ["azw", "application/vnd.amazon.ebook"],
  ["bas", "text/plain"],
  ["bcpio", "application/x-bcpio"],
  ["bdf", "application/x-font-bdf"],
  ["bdm", "application/vnd.syncml.dm+wbxml"],
  ["bed", "application/vnd.realvnc.bed"],
  ["bh2", "application/vnd.fujitsu.oasysprs"],
  [
    "bin",
    ["application/octet-stream", "application/mac-binary", "application/macbinary", "application/x-macbinary", "application/x-binary"]
  ],
  ["bm", "image/bmp"],
  ["bmi", "application/vnd.bmi"],
  ["bmp", ["image/bmp", "image/x-windows-bmp"]],
  ["boo", "application/book"],
  ["book", "application/book"],
  ["box", "application/vnd.previewsystems.box"],
  ["boz", "application/x-bzip2"],
  ["bsh", "application/x-bsh"],
  ["btif", "image/prs.btif"],
  ["bz", "application/x-bzip"],
  ["bz2", "application/x-bzip2"],
  ["c", ["text/plain", "text/x-c"]],
  ["c++", "text/plain"],
  ["c11amc", "application/vnd.cluetrust.cartomobile-config"],
  ["c11amz", "application/vnd.cluetrust.cartomobile-config-pkg"],
  ["c4g", "application/vnd.clonk.c4group"],
  ["cab", "application/vnd.ms-cab-compressed"],
  ["car", "application/vnd.curl.car"],
  ["cat", ["application/vnd.ms-pkiseccat", "application/vnd.ms-pki.seccat"]],
  ["cc", ["text/plain", "text/x-c"]],
  ["ccad", "application/clariscad"],
  ["cco", "application/x-cocoa"],
  ["ccxml", "application/ccxml+xml,"],
  ["cdbcmsg", "application/vnd.contact.cmsg"],
  ["cdf", ["application/cdf", "application/x-cdf", "application/x-netcdf"]],
  ["cdkey", "application/vnd.mediastation.cdkey"],
  ["cdmia", "application/cdmi-capability"],
  ["cdmic", "application/cdmi-container"],
  ["cdmid", "application/cdmi-domain"],
  ["cdmio", "application/cdmi-object"],
  ["cdmiq", "application/cdmi-queue"],
  ["cdx", "chemical/x-cdx"],
  ["cdxml", "application/vnd.chemdraw+xml"],
  ["cdy", "application/vnd.cinderella"],
  ["cer", ["application/pkix-cert", "application/x-x509-ca-cert"]],
  ["cgm", "image/cgm"],
  ["cha", "application/x-chat"],
  ["chat", "application/x-chat"],
  ["chm", "application/vnd.ms-htmlhelp"],
  ["chrt", "application/vnd.kde.kchart"],
  ["cif", "chemical/x-cif"],
  ["cii", "application/vnd.anser-web-certificate-issue-initiation"],
  ["cil", "application/vnd.ms-artgalry"],
  ["cla", "application/vnd.claymore"],
  [
    "class",
    ["application/octet-stream", "application/java", "application/java-byte-code", "application/java-vm", "application/x-java-class"]
  ],
  ["clkk", "application/vnd.crick.clicker.keyboard"],
  ["clkp", "application/vnd.crick.clicker.palette"],
  ["clkt", "application/vnd.crick.clicker.template"],
  ["clkw", "application/vnd.crick.clicker.wordbank"],
  ["clkx", "application/vnd.crick.clicker"],
  ["clp", "application/x-msclip"],
  ["cmc", "application/vnd.cosmocaller"],
  ["cmdf", "chemical/x-cmdf"],
  ["cml", "chemical/x-cml"],
  ["cmp", "application/vnd.yellowriver-custom-menu"],
  ["cmx", "image/x-cmx"],
  ["cod", ["image/cis-cod", "application/vnd.rim.cod"]],
  ["com", ["application/octet-stream", "text/plain"]],
  ["conf", "text/plain"],
  ["cpio", "application/x-cpio"],
  ["cpp", "text/x-c"],
  ["cpt", ["application/mac-compactpro", "application/x-compactpro", "application/x-cpt"]],
  ["crd", "application/x-mscardfile"],
  ["crl", ["application/pkix-crl", "application/pkcs-crl"]],
  ["crt", ["application/pkix-cert", "application/x-x509-user-cert", "application/x-x509-ca-cert"]],
  ["cryptonote", "application/vnd.rig.cryptonote"],
  ["csh", ["text/x-script.csh", "application/x-csh"]],
  ["csml", "chemical/x-csml"],
  ["csp", "application/vnd.commonspace"],
  ["css", ["text/css", "application/x-pointplus"]],
  ["csv", "text/csv"],
  ["cu", "application/cu-seeme"],
  ["curl", "text/vnd.curl"],
  ["cww", "application/prs.cww"],
  ["cxx", "text/plain"],
  ["dae", "model/vnd.collada+xml"],
  ["daf", "application/vnd.mobius.daf"],
  ["davmount", "application/davmount+xml"],
  ["dcr", "application/x-director"],
  ["dcurl", "text/vnd.curl.dcurl"],
  ["dd2", "application/vnd.oma.dd2+xml"],
  ["ddd", "application/vnd.fujixerox.ddd"],
  ["deb", "application/x-debian-package"],
  ["deepv", "application/x-deepv"],
  ["def", "text/plain"],
  ["der", "application/x-x509-ca-cert"],
  ["dfac", "application/vnd.dreamfactory"],
  ["dif", "video/x-dv"],
  ["dir", "application/x-director"],
  ["dis", "application/vnd.mobius.dis"],
  ["djvu", "image/vnd.djvu"],
  ["dl", ["video/dl", "video/x-dl"]],
  ["dll", "application/x-msdownload"],
  ["dms", "application/octet-stream"],
  ["dna", "application/vnd.dna"],
  ["doc", "application/msword"],
  ["docm", "application/vnd.ms-word.document.macroenabled.12"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["dot", "application/msword"],
  ["dotm", "application/vnd.ms-word.template.macroenabled.12"],
  ["dotx", "application/vnd.openxmlformats-officedocument.wordprocessingml.template"],
  ["dp", ["application/commonground", "application/vnd.osgi.dp"]],
  ["dpg", "application/vnd.dpgraph"],
  ["dra", "audio/vnd.dra"],
  ["drw", "application/drafting"],
  ["dsc", "text/prs.lines.tag"],
  ["dssc", "application/dssc+der"],
  ["dtb", "application/x-dtbook+xml"],
  ["dtd", "application/xml-dtd"],
  ["dts", "audio/vnd.dts"],
  ["dtshd", "audio/vnd.dts.hd"],
  ["dump", "application/octet-stream"],
  ["dv", "video/x-dv"],
  ["dvi", "application/x-dvi"],
  ["dwf", ["model/vnd.dwf", "drawing/x-dwf"]],
  ["dwg", ["application/acad", "image/vnd.dwg", "image/x-dwg"]],
  ["dxf", ["application/dxf", "image/vnd.dwg", "image/vnd.dxf", "image/x-dwg"]],
  ["dxp", "application/vnd.spotfire.dxp"],
  ["dxr", "application/x-director"],
  ["ecelp4800", "audio/vnd.nuera.ecelp4800"],
  ["ecelp7470", "audio/vnd.nuera.ecelp7470"],
  ["ecelp9600", "audio/vnd.nuera.ecelp9600"],
  ["edm", "application/vnd.novadigm.edm"],
  ["edx", "application/vnd.novadigm.edx"],
  ["efif", "application/vnd.picsel"],
  ["ei6", "application/vnd.pg.osasli"],
  ["el", "text/x-script.elisp"],
  ["elc", ["application/x-elc", "application/x-bytecode.elisp"]],
  ["eml", "message/rfc822"],
  ["emma", "application/emma+xml"],
  ["env", "application/x-envoy"],
  ["eol", "audio/vnd.digital-winds"],
  ["eot", "application/vnd.ms-fontobject"],
  ["eps", "application/postscript"],
  ["epub", "application/epub+zip"],
  ["es", ["application/ecmascript", "application/x-esrehber"]],
  ["es3", "application/vnd.eszigno3+xml"],
  ["esf", "application/vnd.epson.esf"],
  ["etx", "text/x-setext"],
  ["evy", ["application/envoy", "application/x-envoy"]],
  ["exe", ["application/octet-stream", "application/x-msdownload"]],
  ["exi", "application/exi"],
  ["ext", "application/vnd.novadigm.ext"],
  ["ez2", "application/vnd.ezpix-album"],
  ["ez3", "application/vnd.ezpix-package"],
  ["f", ["text/plain", "text/x-fortran"]],
  ["f4v", "video/x-f4v"],
  ["f77", "text/x-fortran"],
  ["f90", ["text/plain", "text/x-fortran"]],
  ["fbs", "image/vnd.fastbidsheet"],
  ["fcs", "application/vnd.isac.fcs"],
  ["fdf", "application/vnd.fdf"],
  ["fe_launch", "application/vnd.denovo.fcselayout-link"],
  ["fg5", "application/vnd.fujitsu.oasysgp"],
  ["fh", "image/x-freehand"],
  ["fif", ["application/fractals", "image/fif"]],
  ["fig", "application/x-xfig"],
  ["fli", ["video/fli", "video/x-fli"]],
  ["flo", ["image/florian", "application/vnd.micrografx.flo"]],
  ["flr", "x-world/x-vrml"],
  ["flv", "video/x-flv"],
  ["flw", "application/vnd.kde.kivio"],
  ["flx", "text/vnd.fmi.flexstor"],
  ["fly", "text/vnd.fly"],
  ["fm", "application/vnd.framemaker"],
  ["fmf", "video/x-atomic3d-feature"],
  ["fnc", "application/vnd.frogans.fnc"],
  ["for", ["text/plain", "text/x-fortran"]],
  ["fpx", ["image/vnd.fpx", "image/vnd.net-fpx"]],
  ["frl", "application/freeloader"],
  ["fsc", "application/vnd.fsc.weblaunch"],
  ["fst", "image/vnd.fst"],
  ["ftc", "application/vnd.fluxtime.clip"],
  ["fti", "application/vnd.anser-web-funds-transfer-initiation"],
  ["funk", "audio/make"],
  ["fvt", "video/vnd.fvt"],
  ["fxp", "application/vnd.adobe.fxp"],
  ["fzs", "application/vnd.fuzzysheet"],
  ["g", "text/plain"],
  ["g2w", "application/vnd.geoplan"],
  ["g3", "image/g3fax"],
  ["g3w", "application/vnd.geospace"],
  ["gac", "application/vnd.groove-account"],
  ["gdl", "model/vnd.gdl"],
  ["geo", "application/vnd.dynageo"],
  ["geojson", "application/geo+json"],
  ["gex", "application/vnd.geometry-explorer"],
  ["ggb", "application/vnd.geogebra.file"],
  ["ggt", "application/vnd.geogebra.tool"],
  ["ghf", "application/vnd.groove-help"],
  ["gif", "image/gif"],
  ["gim", "application/vnd.groove-identity-message"],
  ["gl", ["video/gl", "video/x-gl"]],
  ["gmx", "application/vnd.gmx"],
  ["gnumeric", "application/x-gnumeric"],
  ["gph", "application/vnd.flographit"],
  ["gqf", "application/vnd.grafeq"],
  ["gram", "application/srgs"],
  ["grv", "application/vnd.groove-injector"],
  ["grxml", "application/srgs+xml"],
  ["gsd", "audio/x-gsm"],
  ["gsf", "application/x-font-ghostscript"],
  ["gsm", "audio/x-gsm"],
  ["gsp", "application/x-gsp"],
  ["gss", "application/x-gss"],
  ["gtar", "application/x-gtar"],
  ["gtm", "application/vnd.groove-tool-message"],
  ["gtw", "model/vnd.gtw"],
  ["gv", "text/vnd.graphviz"],
  ["gxt", "application/vnd.geonext"],
  ["gz", ["application/x-gzip", "application/x-compressed"]],
  ["gzip", ["multipart/x-gzip", "application/x-gzip"]],
  ["h", ["text/plain", "text/x-h"]],
  ["h261", "video/h261"],
  ["h263", "video/h263"],
  ["h264", "video/h264"],
  ["hal", "application/vnd.hal+xml"],
  ["hbci", "application/vnd.hbci"],
  ["hdf", "application/x-hdf"],
  ["help", "application/x-helpfile"],
  ["hgl", "application/vnd.hp-hpgl"],
  ["hh", ["text/plain", "text/x-h"]],
  ["hlb", "text/x-script"],
  ["hlp", ["application/winhlp", "application/hlp", "application/x-helpfile", "application/x-winhelp"]],
  ["hpg", "application/vnd.hp-hpgl"],
  ["hpgl", "application/vnd.hp-hpgl"],
  ["hpid", "application/vnd.hp-hpid"],
  ["hps", "application/vnd.hp-hps"],
  [
    "hqx",
    [
      "application/mac-binhex40",
      "application/binhex",
      "application/binhex4",
      "application/mac-binhex",
      "application/x-binhex40",
      "application/x-mac-binhex40"
    ]
  ],
  ["hta", "application/hta"],
  ["htc", "text/x-component"],
  ["htke", "application/vnd.kenameaapp"],
  ["htm", "text/html"],
  ["html", "text/html"],
  ["htmls", "text/html"],
  ["htt", "text/webviewhtml"],
  ["htx", "text/html"],
  ["hvd", "application/vnd.yamaha.hv-dic"],
  ["hvp", "application/vnd.yamaha.hv-voice"],
  ["hvs", "application/vnd.yamaha.hv-script"],
  ["i2g", "application/vnd.intergeo"],
  ["icc", "application/vnd.iccprofile"],
  ["ice", "x-conference/x-cooltalk"],
  ["ico", "image/x-icon"],
  ["ics", "text/calendar"],
  ["idc", "text/plain"],
  ["ief", "image/ief"],
  ["iefs", "image/ief"],
  ["ifm", "application/vnd.shana.informed.formdata"],
  ["iges", ["application/iges", "model/iges"]],
  ["igl", "application/vnd.igloader"],
  ["igm", "application/vnd.insors.igm"],
  ["igs", ["application/iges", "model/iges"]],
  ["igx", "application/vnd.micrografx.igx"],
  ["iif", "application/vnd.shana.informed.interchange"],
  ["iii", "application/x-iphone"],
  ["ima", "application/x-ima"],
  ["imap", "application/x-httpd-imap"],
  ["imp", "application/vnd.accpac.simply.imp"],
  ["ims", "application/vnd.ms-ims"],
  ["inf", "application/inf"],
  ["ins", ["application/x-internet-signup", "application/x-internett-signup"]],
  ["ip", "application/x-ip2"],
  ["ipfix", "application/ipfix"],
  ["ipk", "application/vnd.shana.informed.package"],
  ["irm", "application/vnd.ibm.rights-management"],
  ["irp", "application/vnd.irepository.package+xml"],
  ["isp", "application/x-internet-signup"],
  ["isu", "video/x-isvideo"],
  ["it", "audio/it"],
  ["itp", "application/vnd.shana.informed.formtemplate"],
  ["iv", "application/x-inventor"],
  ["ivp", "application/vnd.immervision-ivp"],
  ["ivr", "i-world/i-vrml"],
  ["ivu", "application/vnd.immervision-ivu"],
  ["ivy", "application/x-livescreen"],
  ["jad", "text/vnd.sun.j2me.app-descriptor"],
  ["jam", ["application/vnd.jam", "audio/x-jam"]],
  ["jar", "application/java-archive"],
  ["jav", ["text/plain", "text/x-java-source"]],
  ["java", ["text/plain", "text/x-java-source,java", "text/x-java-source"]],
  ["jcm", "application/x-java-commerce"],
  ["jfif", ["image/pipeg", "image/jpeg", "image/pjpeg"]],
  ["jfif-tbnl", "image/jpeg"],
  ["jisp", "application/vnd.jisp"],
  ["jlt", "application/vnd.hp-jlyt"],
  ["jnlp", "application/x-java-jnlp-file"],
  ["joda", "application/vnd.joost.joda-archive"],
  ["jpe", ["image/jpeg", "image/pjpeg"]],
  ["jpeg", ["image/jpeg", "image/pjpeg"]],
  ["jpg", ["image/jpeg", "image/pjpeg"]],
  ["jpgv", "video/jpeg"],
  ["jpm", "video/jpm"],
  ["jps", "image/x-jps"],
  ["js", ["application/javascript", "application/ecmascript", "text/javascript", "text/ecmascript", "application/x-javascript"]],
  ["json", "application/json"],
  ["jut", "image/jutvision"],
  ["kar", ["audio/midi", "music/x-karaoke"]],
  ["karbon", "application/vnd.kde.karbon"],
  ["kfo", "application/vnd.kde.kformula"],
  ["kia", "application/vnd.kidspiration"],
  ["kml", "application/vnd.google-earth.kml+xml"],
  ["kmz", "application/vnd.google-earth.kmz"],
  ["kne", "application/vnd.kinar"],
  ["kon", "application/vnd.kde.kontour"],
  ["kpr", "application/vnd.kde.kpresenter"],
  ["ksh", ["application/x-ksh", "text/x-script.ksh"]],
  ["ksp", "application/vnd.kde.kspread"],
  ["ktx", "image/ktx"],
  ["ktz", "application/vnd.kahootz"],
  ["kwd", "application/vnd.kde.kword"],
  ["la", ["audio/nspaudio", "audio/x-nspaudio"]],
  ["lam", "audio/x-liveaudio"],
  ["lasxml", "application/vnd.las.las+xml"],
  ["latex", "application/x-latex"],
  ["lbd", "application/vnd.llamagraphics.life-balance.desktop"],
  ["lbe", "application/vnd.llamagraphics.life-balance.exchange+xml"],
  ["les", "application/vnd.hhe.lesson-player"],
  ["lha", ["application/octet-stream", "application/lha", "application/x-lha"]],
  ["lhx", "application/octet-stream"],
  ["link66", "application/vnd.route66.link66+xml"],
  ["list", "text/plain"],
  ["lma", ["audio/nspaudio", "audio/x-nspaudio"]],
  ["log", "text/plain"],
  ["lrm", "application/vnd.ms-lrm"],
  ["lsf", "video/x-la-asf"],
  ["lsp", ["application/x-lisp", "text/x-script.lisp"]],
  ["lst", "text/plain"],
  ["lsx", ["video/x-la-asf", "text/x-la-asf"]],
  ["ltf", "application/vnd.frogans.ltf"],
  ["ltx", "application/x-latex"],
  ["lvp", "audio/vnd.lucent.voice"],
  ["lwp", "application/vnd.lotus-wordpro"],
  ["lzh", ["application/octet-stream", "application/x-lzh"]],
  ["lzx", ["application/lzx", "application/octet-stream", "application/x-lzx"]],
  ["m", ["text/plain", "text/x-m"]],
  ["m13", "application/x-msmediaview"],
  ["m14", "application/x-msmediaview"],
  ["m1v", "video/mpeg"],
  ["m21", "application/mp21"],
  ["m2a", "audio/mpeg"],
  ["m2v", "video/mpeg"],
  ["m3u", ["audio/x-mpegurl", "audio/x-mpequrl"]],
  ["m3u8", "application/vnd.apple.mpegurl"],
  ["m4v", "video/x-m4v"],
  ["ma", "application/mathematica"],
  ["mads", "application/mads+xml"],
  ["mag", "application/vnd.ecowin.chart"],
  ["man", "application/x-troff-man"],
  ["map", "application/x-navimap"],
  ["mar", "text/plain"],
  ["mathml", "application/mathml+xml"],
  ["mbd", "application/mbedlet"],
  ["mbk", "application/vnd.mobius.mbk"],
  ["mbox", "application/mbox"],
  ["mc$", "application/x-magic-cap-package-1.0"],
  ["mc1", "application/vnd.medcalcdata"],
  ["mcd", ["application/mcad", "application/vnd.mcd", "application/x-mathcad"]],
  ["mcf", ["image/vasa", "text/mcf"]],
  ["mcp", "application/netmc"],
  ["mcurl", "text/vnd.curl.mcurl"],
  ["mdb", "application/x-msaccess"],
  ["mdi", "image/vnd.ms-modi"],
  ["me", "application/x-troff-me"],
  ["meta4", "application/metalink4+xml"],
  ["mets", "application/mets+xml"],
  ["mfm", "application/vnd.mfmp"],
  ["mgp", "application/vnd.osgeo.mapguide.package"],
  ["mgz", "application/vnd.proteus.magazine"],
  ["mht", "message/rfc822"],
  ["mhtml", "message/rfc822"],
  ["mid", ["audio/mid", "audio/midi", "music/crescendo", "x-music/x-midi", "audio/x-midi", "application/x-midi", "audio/x-mid"]],
  ["midi", ["audio/midi", "music/crescendo", "x-music/x-midi", "audio/x-midi", "application/x-midi", "audio/x-mid"]],
  ["mif", ["application/vnd.mif", "application/x-mif", "application/x-frame"]],
  ["mime", ["message/rfc822", "www/mime"]],
  ["mj2", "video/mj2"],
  ["mjf", "audio/x-vnd.audioexplosion.mjuicemediafile"],
  ["mjpg", "video/x-motion-jpeg"],
  ["mlp", "application/vnd.dolby.mlp"],
  ["mm", ["application/base64", "application/x-meme"]],
  ["mmd", "application/vnd.chipnuts.karaoke-mmd"],
  ["mme", "application/base64"],
  ["mmf", "application/vnd.smaf"],
  ["mmr", "image/vnd.fujixerox.edmics-mmr"],
  ["mny", "application/x-msmoney"],
  ["mod", ["audio/mod", "audio/x-mod"]],
  ["mods", "application/mods+xml"],
  ["moov", "video/quicktime"],
  ["mov", "video/quicktime"],
  ["movie", "video/x-sgi-movie"],
  ["mp2", ["video/mpeg", "audio/mpeg", "video/x-mpeg", "audio/x-mpeg", "video/x-mpeq2a"]],
  ["mp3", ["audio/mpeg", "audio/mpeg3", "video/mpeg", "audio/x-mpeg-3", "video/x-mpeg"]],
  ["mp4", ["video/mp4", "application/mp4"]],
  ["mp4a", "audio/mp4"],
  ["mpa", ["video/mpeg", "audio/mpeg"]],
  ["mpc", ["application/vnd.mophun.certificate", "application/x-project"]],
  ["mpe", "video/mpeg"],
  ["mpeg", "video/mpeg"],
  ["mpg", ["video/mpeg", "audio/mpeg"]],
  ["mpga", "audio/mpeg"],
  ["mpkg", "application/vnd.apple.installer+xml"],
  ["mpm", "application/vnd.blueice.multipass"],
  ["mpn", "application/vnd.mophun.application"],
  ["mpp", "application/vnd.ms-project"],
  ["mpt", "application/x-project"],
  ["mpv", "application/x-project"],
  ["mpv2", "video/mpeg"],
  ["mpx", "application/x-project"],
  ["mpy", "application/vnd.ibm.minipay"],
  ["mqy", "application/vnd.mobius.mqy"],
  ["mrc", "application/marc"],
  ["mrcx", "application/marcxml+xml"],
  ["ms", "application/x-troff-ms"],
  ["mscml", "application/mediaservercontrol+xml"],
  ["mseq", "application/vnd.mseq"],
  ["msf", "application/vnd.epson.msf"],
  ["msg", "application/vnd.ms-outlook"],
  ["msh", "model/mesh"],
  ["msl", "application/vnd.mobius.msl"],
  ["msty", "application/vnd.muvee.style"],
  ["mts", "model/vnd.mts"],
  ["mus", "application/vnd.musician"],
  ["musicxml", "application/vnd.recordare.musicxml+xml"],
  ["mv", "video/x-sgi-movie"],
  ["mvb", "application/x-msmediaview"],
  ["mwf", "application/vnd.mfer"],
  ["mxf", "application/mxf"],
  ["mxl", "application/vnd.recordare.musicxml"],
  ["mxml", "application/xv+xml"],
  ["mxs", "application/vnd.triscape.mxs"],
  ["mxu", "video/vnd.mpegurl"],
  ["my", "audio/make"],
  ["mzz", "application/x-vnd.audioexplosion.mzz"],
  ["n-gage", "application/vnd.nokia.n-gage.symbian.install"],
  ["n3", "text/n3"],
  ["nap", "image/naplps"],
  ["naplps", "image/naplps"],
  ["nbp", "application/vnd.wolfram.player"],
  ["nc", "application/x-netcdf"],
  ["ncm", "application/vnd.nokia.configuration-message"],
  ["ncx", "application/x-dtbncx+xml"],
  ["ngdat", "application/vnd.nokia.n-gage.data"],
  ["nif", "image/x-niff"],
  ["niff", "image/x-niff"],
  ["nix", "application/x-mix-transfer"],
  ["nlu", "application/vnd.neurolanguage.nlu"],
  ["nml", "application/vnd.enliven"],
  ["nnd", "application/vnd.noblenet-directory"],
  ["nns", "application/vnd.noblenet-sealer"],
  ["nnw", "application/vnd.noblenet-web"],
  ["npx", "image/vnd.net-fpx"],
  ["nsc", "application/x-conference"],
  ["nsf", "application/vnd.lotus-notes"],
  ["nvd", "application/x-navidoc"],
  ["nws", "message/rfc822"],
  ["o", "application/octet-stream"],
  ["oa2", "application/vnd.fujitsu.oasys2"],
  ["oa3", "application/vnd.fujitsu.oasys3"],
  ["oas", "application/vnd.fujitsu.oasys"],
  ["obd", "application/x-msbinder"],
  ["oda", "application/oda"],
  ["odb", "application/vnd.oasis.opendocument.database"],
  ["odc", "application/vnd.oasis.opendocument.chart"],
  ["odf", "application/vnd.oasis.opendocument.formula"],
  ["odft", "application/vnd.oasis.opendocument.formula-template"],
  ["odg", "application/vnd.oasis.opendocument.graphics"],
  ["odi", "application/vnd.oasis.opendocument.image"],
  ["odm", "application/vnd.oasis.opendocument.text-master"],
  ["odp", "application/vnd.oasis.opendocument.presentation"],
  ["ods", "application/vnd.oasis.opendocument.spreadsheet"],
  ["odt", "application/vnd.oasis.opendocument.text"],
  ["oga", "audio/ogg"],
  ["ogv", "video/ogg"],
  ["ogx", "application/ogg"],
  ["omc", "application/x-omc"],
  ["omcd", "application/x-omcdatamaker"],
  ["omcr", "application/x-omcregerator"],
  ["onetoc", "application/onenote"],
  ["opf", "application/oebps-package+xml"],
  ["org", "application/vnd.lotus-organizer"],
  ["osf", "application/vnd.yamaha.openscoreformat"],
  ["osfpvg", "application/vnd.yamaha.openscoreformat.osfpvg+xml"],
  ["otc", "application/vnd.oasis.opendocument.chart-template"],
  ["otf", "application/x-font-otf"],
  ["otg", "application/vnd.oasis.opendocument.graphics-template"],
  ["oth", "application/vnd.oasis.opendocument.text-web"],
  ["oti", "application/vnd.oasis.opendocument.image-template"],
  ["otp", "application/vnd.oasis.opendocument.presentation-template"],
  ["ots", "application/vnd.oasis.opendocument.spreadsheet-template"],
  ["ott", "application/vnd.oasis.opendocument.text-template"],
  ["oxt", "application/vnd.openofficeorg.extension"],
  ["p", "text/x-pascal"],
  ["p10", ["application/pkcs10", "application/x-pkcs10"]],
  ["p12", ["application/pkcs-12", "application/x-pkcs12"]],
  ["p7a", "application/x-pkcs7-signature"],
  ["p7b", "application/x-pkcs7-certificates"],
  ["p7c", ["application/pkcs7-mime", "application/x-pkcs7-mime"]],
  ["p7m", ["application/pkcs7-mime", "application/x-pkcs7-mime"]],
  ["p7r", "application/x-pkcs7-certreqresp"],
  ["p7s", ["application/pkcs7-signature", "application/x-pkcs7-signature"]],
  ["p8", "application/pkcs8"],
  ["par", "text/plain-bas"],
  ["part", "application/pro_eng"],
  ["pas", "text/pascal"],
  ["paw", "application/vnd.pawaafile"],
  ["pbd", "application/vnd.powerbuilder6"],
  ["pbm", "image/x-portable-bitmap"],
  ["pcf", "application/x-font-pcf"],
  ["pcl", ["application/vnd.hp-pcl", "application/x-pcl"]],
  ["pclxl", "application/vnd.hp-pclxl"],
  ["pct", "image/x-pict"],
  ["pcurl", "application/vnd.curl.pcurl"],
  ["pcx", "image/x-pcx"],
  ["pdb", ["application/vnd.palm", "chemical/x-pdb"]],
  ["pdf", "application/pdf"],
  ["pfa", "application/x-font-type1"],
  ["pfr", "application/font-tdpfr"],
  ["pfunk", ["audio/make", "audio/make.my.funk"]],
  ["pfx", "application/x-pkcs12"],
  ["pgm", ["image/x-portable-graymap", "image/x-portable-greymap"]],
  ["pgn", "application/x-chess-pgn"],
  ["pgp", "application/pgp-signature"],
  ["pic", ["image/pict", "image/x-pict"]],
  ["pict", "image/pict"],
  ["pkg", "application/x-newton-compatible-pkg"],
  ["pki", "application/pkixcmp"],
  ["pkipath", "application/pkix-pkipath"],
  ["pko", ["application/ynd.ms-pkipko", "application/vnd.ms-pki.pko"]],
  ["pl", ["text/plain", "text/x-script.perl"]],
  ["plb", "application/vnd.3gpp.pic-bw-large"],
  ["plc", "application/vnd.mobius.plc"],
  ["plf", "application/vnd.pocketlearn"],
  ["pls", "application/pls+xml"],
  ["plx", "application/x-pixclscript"],
  ["pm", ["text/x-script.perl-module", "image/x-xpixmap"]],
  ["pm4", "application/x-pagemaker"],
  ["pm5", "application/x-pagemaker"],
  ["pma", "application/x-perfmon"],
  ["pmc", "application/x-perfmon"],
  ["pml", ["application/vnd.ctc-posml", "application/x-perfmon"]],
  ["pmr", "application/x-perfmon"],
  ["pmw", "application/x-perfmon"],
  ["png", "image/png"],
  ["pnm", ["application/x-portable-anymap", "image/x-portable-anymap"]],
  ["portpkg", "application/vnd.macports.portpkg"],
  ["pot", ["application/vnd.ms-powerpoint", "application/mspowerpoint"]],
  ["potm", "application/vnd.ms-powerpoint.template.macroenabled.12"],
  ["potx", "application/vnd.openxmlformats-officedocument.presentationml.template"],
  ["pov", "model/x-pov"],
  ["ppa", "application/vnd.ms-powerpoint"],
  ["ppam", "application/vnd.ms-powerpoint.addin.macroenabled.12"],
  ["ppd", "application/vnd.cups-ppd"],
  ["ppm", "image/x-portable-pixmap"],
  ["pps", ["application/vnd.ms-powerpoint", "application/mspowerpoint"]],
  ["ppsm", "application/vnd.ms-powerpoint.slideshow.macroenabled.12"],
  ["ppsx", "application/vnd.openxmlformats-officedocument.presentationml.slideshow"],
  ["ppt", ["application/vnd.ms-powerpoint", "application/mspowerpoint", "application/powerpoint", "application/x-mspowerpoint"]],
  ["pptm", "application/vnd.ms-powerpoint.presentation.macroenabled.12"],
  ["pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ["ppz", "application/mspowerpoint"],
  ["prc", "application/x-mobipocket-ebook"],
  ["pre", ["application/vnd.lotus-freelance", "application/x-freelance"]],
  ["prf", "application/pics-rules"],
  ["prt", "application/pro_eng"],
  ["ps", "application/postscript"],
  ["psb", "application/vnd.3gpp.pic-bw-small"],
  ["psd", ["application/octet-stream", "image/vnd.adobe.photoshop"]],
  ["psf", "application/x-font-linux-psf"],
  ["pskcxml", "application/pskc+xml"],
  ["ptid", "application/vnd.pvi.ptid1"],
  ["pub", "application/x-mspublisher"],
  ["pvb", "application/vnd.3gpp.pic-bw-var"],
  ["pvu", "paleovu/x-pv"],
  ["pwn", "application/vnd.3m.post-it-notes"],
  ["pwz", "application/vnd.ms-powerpoint"],
  ["py", "text/x-script.phyton"],
  ["pya", "audio/vnd.ms-playready.media.pya"],
  ["pyc", "application/x-bytecode.python"],
  ["pyv", "video/vnd.ms-playready.media.pyv"],
  ["qam", "application/vnd.epson.quickanime"],
  ["qbo", "application/vnd.intu.qbo"],
  ["qcp", "audio/vnd.qcelp"],
  ["qd3", "x-world/x-3dmf"],
  ["qd3d", "x-world/x-3dmf"],
  ["qfx", "application/vnd.intu.qfx"],
  ["qif", "image/x-quicktime"],
  ["qps", "application/vnd.publishare-delta-tree"],
  ["qt", "video/quicktime"],
  ["qtc", "video/x-qtc"],
  ["qti", "image/x-quicktime"],
  ["qtif", "image/x-quicktime"],
  ["qxd", "application/vnd.quark.quarkxpress"],
  ["ra", ["audio/x-realaudio", "audio/x-pn-realaudio", "audio/x-pn-realaudio-plugin"]],
  ["ram", "audio/x-pn-realaudio"],
  ["rar", "application/x-rar-compressed"],
  ["ras", ["image/cmu-raster", "application/x-cmu-raster", "image/x-cmu-raster"]],
  ["rast", "image/cmu-raster"],
  ["rcprofile", "application/vnd.ipunplugged.rcprofile"],
  ["rdf", "application/rdf+xml"],
  ["rdz", "application/vnd.data-vision.rdz"],
  ["rep", "application/vnd.businessobjects"],
  ["res", "application/x-dtbresource+xml"],
  ["rexx", "text/x-script.rexx"],
  ["rf", "image/vnd.rn-realflash"],
  ["rgb", "image/x-rgb"],
  ["rif", "application/reginfo+xml"],
  ["rip", "audio/vnd.rip"],
  ["rl", "application/resource-lists+xml"],
  ["rlc", "image/vnd.fujixerox.edmics-rlc"],
  ["rld", "application/resource-lists-diff+xml"],
  ["rm", ["application/vnd.rn-realmedia", "audio/x-pn-realaudio"]],
  ["rmi", "audio/mid"],
  ["rmm", "audio/x-pn-realaudio"],
  ["rmp", ["audio/x-pn-realaudio-plugin", "audio/x-pn-realaudio"]],
  ["rms", "application/vnd.jcp.javame.midlet-rms"],
  ["rnc", "application/relax-ng-compact-syntax"],
  ["rng", ["application/ringing-tones", "application/vnd.nokia.ringing-tone"]],
  ["rnx", "application/vnd.rn-realplayer"],
  ["roff", "application/x-troff"],
  ["rp", "image/vnd.rn-realpix"],
  ["rp9", "application/vnd.cloanto.rp9"],
  ["rpm", "audio/x-pn-realaudio-plugin"],
  ["rpss", "application/vnd.nokia.radio-presets"],
  ["rpst", "application/vnd.nokia.radio-preset"],
  ["rq", "application/sparql-query"],
  ["rs", "application/rls-services+xml"],
  ["rsd", "application/rsd+xml"],
  ["rt", ["text/richtext", "text/vnd.rn-realtext"]],
  ["rtf", ["application/rtf", "text/richtext", "application/x-rtf"]],
  ["rtx", ["text/richtext", "application/rtf"]],
  ["rv", "video/vnd.rn-realvideo"],
  ["s", "text/x-asm"],
  ["s3m", "audio/s3m"],
  ["saf", "application/vnd.yamaha.smaf-audio"],
  ["saveme", "application/octet-stream"],
  ["sbk", "application/x-tbook"],
  ["sbml", "application/sbml+xml"],
  ["sc", "application/vnd.ibm.secure-container"],
  ["scd", "application/x-msschedule"],
  [
    "scm",
    ["application/vnd.lotus-screencam", "video/x-scm", "text/x-script.guile", "application/x-lotusscreencam", "text/x-script.scheme"]
  ],
  ["scq", "application/scvp-cv-request"],
  ["scs", "application/scvp-cv-response"],
  ["sct", "text/scriptlet"],
  ["scurl", "text/vnd.curl.scurl"],
  ["sda", "application/vnd.stardivision.draw"],
  ["sdc", "application/vnd.stardivision.calc"],
  ["sdd", "application/vnd.stardivision.impress"],
  ["sdkm", "application/vnd.solent.sdkm+xml"],
  ["sdml", "text/plain"],
  ["sdp", ["application/sdp", "application/x-sdp"]],
  ["sdr", "application/sounder"],
  ["sdw", "application/vnd.stardivision.writer"],
  ["sea", ["application/sea", "application/x-sea"]],
  ["see", "application/vnd.seemail"],
  ["seed", "application/vnd.fdsn.seed"],
  ["sema", "application/vnd.sema"],
  ["semd", "application/vnd.semd"],
  ["semf", "application/vnd.semf"],
  ["ser", "application/java-serialized-object"],
  ["set", "application/set"],
  ["setpay", "application/set-payment-initiation"],
  ["setreg", "application/set-registration-initiation"],
  ["sfd-hdstx", "application/vnd.hydrostatix.sof-data"],
  ["sfs", "application/vnd.spotfire.sfs"],
  ["sgl", "application/vnd.stardivision.writer-global"],
  ["sgm", ["text/sgml", "text/x-sgml"]],
  ["sgml", ["text/sgml", "text/x-sgml"]],
  ["sh", ["application/x-shar", "application/x-bsh", "application/x-sh", "text/x-script.sh"]],
  ["shar", ["application/x-bsh", "application/x-shar"]],
  ["shf", "application/shf+xml"],
  ["shtml", ["text/html", "text/x-server-parsed-html"]],
  ["sid", "audio/x-psid"],
  ["sis", "application/vnd.symbian.install"],
  ["sit", ["application/x-stuffit", "application/x-sit"]],
  ["sitx", "application/x-stuffitx"],
  ["skd", "application/x-koan"],
  ["skm", "application/x-koan"],
  ["skp", ["application/vnd.koan", "application/x-koan"]],
  ["skt", "application/x-koan"],
  ["sl", "application/x-seelogo"],
  ["sldm", "application/vnd.ms-powerpoint.slide.macroenabled.12"],
  ["sldx", "application/vnd.openxmlformats-officedocument.presentationml.slide"],
  ["slt", "application/vnd.epson.salt"],
  ["sm", "application/vnd.stepmania.stepchart"],
  ["smf", "application/vnd.stardivision.math"],
  ["smi", ["application/smil", "application/smil+xml"]],
  ["smil", "application/smil"],
  ["snd", ["audio/basic", "audio/x-adpcm"]],
  ["snf", "application/x-font-snf"],
  ["sol", "application/solids"],
  ["spc", ["text/x-speech", "application/x-pkcs7-certificates"]],
  ["spf", "application/vnd.yamaha.smaf-phrase"],
  ["spl", ["application/futuresplash", "application/x-futuresplash"]],
  ["spot", "text/vnd.in3d.spot"],
  ["spp", "application/scvp-vp-response"],
  ["spq", "application/scvp-vp-request"],
  ["spr", "application/x-sprite"],
  ["sprite", "application/x-sprite"],
  ["src", "application/x-wais-source"],
  ["sru", "application/sru+xml"],
  ["srx", "application/sparql-results+xml"],
  ["sse", "application/vnd.kodak-descriptor"],
  ["ssf", "application/vnd.epson.ssf"],
  ["ssi", "text/x-server-parsed-html"],
  ["ssm", "application/streamingmedia"],
  ["ssml", "application/ssml+xml"],
  ["sst", ["application/vnd.ms-pkicertstore", "application/vnd.ms-pki.certstore"]],
  ["st", "application/vnd.sailingtracker.track"],
  ["stc", "application/vnd.sun.xml.calc.template"],
  ["std", "application/vnd.sun.xml.draw.template"],
  ["step", "application/step"],
  ["stf", "application/vnd.wt.stf"],
  ["sti", "application/vnd.sun.xml.impress.template"],
  ["stk", "application/hyperstudio"],
  ["stl", ["application/vnd.ms-pkistl", "application/sla", "application/vnd.ms-pki.stl", "application/x-navistyle"]],
  ["stm", "text/html"],
  ["stp", "application/step"],
  ["str", "application/vnd.pg.format"],
  ["stw", "application/vnd.sun.xml.writer.template"],
  ["sub", "image/vnd.dvb.subtitle"],
  ["sus", "application/vnd.sus-calendar"],
  ["sv4cpio", "application/x-sv4cpio"],
  ["sv4crc", "application/x-sv4crc"],
  ["svc", "application/vnd.dvb.service"],
  ["svd", "application/vnd.svd"],
  ["svf", ["image/vnd.dwg", "image/x-dwg"]],
  ["svg", "image/svg+xml"],
  ["svr", ["x-world/x-svr", "application/x-world"]],
  ["swf", "application/x-shockwave-flash"],
  ["swi", "application/vnd.aristanetworks.swi"],
  ["sxc", "application/vnd.sun.xml.calc"],
  ["sxd", "application/vnd.sun.xml.draw"],
  ["sxg", "application/vnd.sun.xml.writer.global"],
  ["sxi", "application/vnd.sun.xml.impress"],
  ["sxm", "application/vnd.sun.xml.math"],
  ["sxw", "application/vnd.sun.xml.writer"],
  ["t", ["text/troff", "application/x-troff"]],
  ["talk", "text/x-speech"],
  ["tao", "application/vnd.tao.intent-module-archive"],
  ["tar", "application/x-tar"],
  ["tbk", ["application/toolbook", "application/x-tbook"]],
  ["tcap", "application/vnd.3gpp2.tcap"],
  ["tcl", ["text/x-script.tcl", "application/x-tcl"]],
  ["tcsh", "text/x-script.tcsh"],
  ["teacher", "application/vnd.smart.teacher"],
  ["tei", "application/tei+xml"],
  ["tex", "application/x-tex"],
  ["texi", "application/x-texinfo"],
  ["texinfo", "application/x-texinfo"],
  ["text", ["application/plain", "text/plain"]],
  ["tfi", "application/thraud+xml"],
  ["tfm", "application/x-tex-tfm"],
  ["tgz", ["application/gnutar", "application/x-compressed"]],
  ["thmx", "application/vnd.ms-officetheme"],
  ["tif", ["image/tiff", "image/x-tiff"]],
  ["tiff", ["image/tiff", "image/x-tiff"]],
  ["tmo", "application/vnd.tmobile-livetv"],
  ["torrent", "application/x-bittorrent"],
  ["tpl", "application/vnd.groove-tool-template"],
  ["tpt", "application/vnd.trid.tpt"],
  ["tr", "application/x-troff"],
  ["tra", "application/vnd.trueapp"],
  ["trm", "application/x-msterminal"],
  ["tsd", "application/timestamped-data"],
  ["tsi", "audio/tsp-audio"],
  ["tsp", ["application/dsptype", "audio/tsplayer"]],
  ["tsv", "text/tab-separated-values"],
  ["ttf", "application/x-font-ttf"],
  ["ttl", "text/turtle"],
  ["turbot", "image/florian"],
  ["twd", "application/vnd.simtech-mindmapper"],
  ["txd", "application/vnd.genomatix.tuxedo"],
  ["txf", "application/vnd.mobius.txf"],
  ["txt", "text/plain"],
  ["ufd", "application/vnd.ufdl"],
  ["uil", "text/x-uil"],
  ["uls", "text/iuls"],
  ["umj", "application/vnd.umajin"],
  ["uni", "text/uri-list"],
  ["unis", "text/uri-list"],
  ["unityweb", "application/vnd.unity"],
  ["unv", "application/i-deas"],
  ["uoml", "application/vnd.uoml+xml"],
  ["uri", "text/uri-list"],
  ["uris", "text/uri-list"],
  ["ustar", ["application/x-ustar", "multipart/x-ustar"]],
  ["utz", "application/vnd.uiq.theme"],
  ["uu", ["application/octet-stream", "text/x-uuencode"]],
  ["uue", "text/x-uuencode"],
  ["uva", "audio/vnd.dece.audio"],
  ["uvh", "video/vnd.dece.hd"],
  ["uvi", "image/vnd.dece.graphic"],
  ["uvm", "video/vnd.dece.mobile"],
  ["uvp", "video/vnd.dece.pd"],
  ["uvs", "video/vnd.dece.sd"],
  ["uvu", "video/vnd.uvvu.mp4"],
  ["uvv", "video/vnd.dece.video"],
  ["vcd", "application/x-cdlink"],
  ["vcf", "text/x-vcard"],
  ["vcg", "application/vnd.groove-vcard"],
  ["vcs", "text/x-vcalendar"],
  ["vcx", "application/vnd.vcx"],
  ["vda", "application/vda"],
  ["vdo", "video/vdo"],
  ["vew", "application/groupwise"],
  ["vis", "application/vnd.visionary"],
  ["viv", ["video/vivo", "video/vnd.vivo"]],
  ["vivo", ["video/vivo", "video/vnd.vivo"]],
  ["vmd", "application/vocaltec-media-desc"],
  ["vmf", "application/vocaltec-media-file"],
  ["voc", ["audio/voc", "audio/x-voc"]],
  ["vos", "video/vosaic"],
  ["vox", "audio/voxware"],
  ["vqe", "audio/x-twinvq-plugin"],
  ["vqf", "audio/x-twinvq"],
  ["vql", "audio/x-twinvq-plugin"],
  ["vrml", ["model/vrml", "x-world/x-vrml", "application/x-vrml"]],
  ["vrt", "x-world/x-vrt"],
  ["vsd", ["application/vnd.visio", "application/x-visio"]],
  ["vsf", "application/vnd.vsf"],
  ["vst", "application/x-visio"],
  ["vsw", "application/x-visio"],
  ["vtu", "model/vnd.vtu"],
  ["vxml", "application/voicexml+xml"],
  ["w60", "application/wordperfect6.0"],
  ["w61", "application/wordperfect6.1"],
  ["w6w", "application/msword"],
  ["wad", "application/x-doom"],
  ["wav", ["audio/wav", "audio/x-wav"]],
  ["wax", "audio/x-ms-wax"],
  ["wb1", "application/x-qpro"],
  ["wbmp", "image/vnd.wap.wbmp"],
  ["wbs", "application/vnd.criticaltools.wbs+xml"],
  ["wbxml", "application/vnd.wap.wbxml"],
  ["wcm", "application/vnd.ms-works"],
  ["wdb", "application/vnd.ms-works"],
  ["web", "application/vnd.xara"],
  ["weba", "audio/webm"],
  ["webm", "video/webm"],
  ["webp", "image/webp"],
  ["wg", "application/vnd.pmi.widget"],
  ["wgt", "application/widget"],
  ["wiz", "application/msword"],
  ["wk1", "application/x-123"],
  ["wks", "application/vnd.ms-works"],
  ["wm", "video/x-ms-wm"],
  ["wma", "audio/x-ms-wma"],
  ["wmd", "application/x-ms-wmd"],
  ["wmf", ["windows/metafile", "application/x-msmetafile"]],
  ["wml", "text/vnd.wap.wml"],
  ["wmlc", "application/vnd.wap.wmlc"],
  ["wmls", "text/vnd.wap.wmlscript"],
  ["wmlsc", "application/vnd.wap.wmlscriptc"],
  ["wmv", "video/x-ms-wmv"],
  ["wmx", "video/x-ms-wmx"],
  ["wmz", "application/x-ms-wmz"],
  ["woff", "application/x-font-woff"],
  ["word", "application/msword"],
  ["wp", "application/wordperfect"],
  ["wp5", ["application/wordperfect", "application/wordperfect6.0"]],
  ["wp6", "application/wordperfect"],
  ["wpd", ["application/wordperfect", "application/vnd.wordperfect", "application/x-wpwin"]],
  ["wpl", "application/vnd.ms-wpl"],
  ["wps", "application/vnd.ms-works"],
  ["wq1", "application/x-lotus"],
  ["wqd", "application/vnd.wqd"],
  ["wri", ["application/mswrite", "application/x-wri", "application/x-mswrite"]],
  ["wrl", ["model/vrml", "x-world/x-vrml", "application/x-world"]],
  ["wrz", ["model/vrml", "x-world/x-vrml"]],
  ["wsc", "text/scriplet"],
  ["wsdl", "application/wsdl+xml"],
  ["wspolicy", "application/wspolicy+xml"],
  ["wsrc", "application/x-wais-source"],
  ["wtb", "application/vnd.webturbo"],
  ["wtk", "application/x-wintalk"],
  ["wvx", "video/x-ms-wvx"],
  ["x-png", "image/png"],
  ["x3d", "application/vnd.hzn-3d-crossword"],
  ["xaf", "x-world/x-vrml"],
  ["xap", "application/x-silverlight-app"],
  ["xar", "application/vnd.xara"],
  ["xbap", "application/x-ms-xbap"],
  ["xbd", "application/vnd.fujixerox.docuworks.binder"],
  ["xbm", ["image/xbm", "image/x-xbm", "image/x-xbitmap"]],
  ["xdf", "application/xcap-diff+xml"],
  ["xdm", "application/vnd.syncml.dm+xml"],
  ["xdp", "application/vnd.adobe.xdp+xml"],
  ["xdr", "video/x-amt-demorun"],
  ["xdssc", "application/dssc+xml"],
  ["xdw", "application/vnd.fujixerox.docuworks"],
  ["xenc", "application/xenc+xml"],
  ["xer", "application/patch-ops-error+xml"],
  ["xfdf", "application/vnd.adobe.xfdf"],
  ["xfdl", "application/vnd.xfdl"],
  ["xgz", "xgl/drawing"],
  ["xhtml", "application/xhtml+xml"],
  ["xif", "image/vnd.xiff"],
  ["xl", "application/excel"],
  ["xla", ["application/vnd.ms-excel", "application/excel", "application/x-msexcel", "application/x-excel"]],
  ["xlam", "application/vnd.ms-excel.addin.macroenabled.12"],
  ["xlb", ["application/excel", "application/vnd.ms-excel", "application/x-excel"]],
  ["xlc", ["application/vnd.ms-excel", "application/excel", "application/x-excel"]],
  ["xld", ["application/excel", "application/x-excel"]],
  ["xlk", ["application/excel", "application/x-excel"]],
  ["xll", ["application/excel", "application/vnd.ms-excel", "application/x-excel"]],
  ["xlm", ["application/vnd.ms-excel", "application/excel", "application/x-excel"]],
  ["xls", ["application/vnd.ms-excel", "application/excel", "application/x-msexcel", "application/x-excel"]],
  ["xlsb", "application/vnd.ms-excel.sheet.binary.macroenabled.12"],
  ["xlsm", "application/vnd.ms-excel.sheet.macroenabled.12"],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["xlt", ["application/vnd.ms-excel", "application/excel", "application/x-excel"]],
  ["xltm", "application/vnd.ms-excel.template.macroenabled.12"],
  ["xltx", "application/vnd.openxmlformats-officedocument.spreadsheetml.template"],
  ["xlv", ["application/excel", "application/x-excel"]],
  ["xlw", ["application/vnd.ms-excel", "application/excel", "application/x-msexcel", "application/x-excel"]],
  ["xm", "audio/xm"],
  ["xml", ["application/xml", "text/xml", "application/atom+xml", "application/rss+xml"]],
  ["xmz", "xgl/movie"],
  ["xo", "application/vnd.olpc-sugar"],
  ["xof", "x-world/x-vrml"],
  ["xop", "application/xop+xml"],
  ["xpi", "application/x-xpinstall"],
  ["xpix", "application/x-vnd.ls-xpix"],
  ["xpm", ["image/xpm", "image/x-xpixmap"]],
  ["xpr", "application/vnd.is-xpr"],
  ["xps", "application/vnd.ms-xpsdocument"],
  ["xpw", "application/vnd.intercon.formnet"],
  ["xslt", "application/xslt+xml"],
  ["xsm", "application/vnd.syncml+xml"],
  ["xspf", "application/xspf+xml"],
  ["xsr", "video/x-amt-showrun"],
  ["xul", "application/vnd.mozilla.xul+xml"],
  ["xwd", ["image/x-xwd", "image/x-xwindowdump"]],
  ["xyz", ["chemical/x-xyz", "chemical/x-pdb"]],
  ["yang", "application/yang"],
  ["yin", "application/yin+xml"],
  ["z", ["application/x-compressed", "application/x-compress"]],
  ["zaz", "application/vnd.zzazz.deck+xml"],
  ["zip", ["application/zip", "multipart/x-zip", "application/x-zip-compressed", "application/x-compressed"]],
  ["zir", "application/vnd.zul"],
  ["zmm", "application/vnd.handheld-entertainment+xml"],
  ["zoo", "application/octet-stream"],
  ["zsh", "text/x-script.zsh"]
]);
function detectMimeType(filename) {
  if (!filename) {
    return defaultMimeType;
  }
  const parsed = import_node_path.default.parse(filename);
  const extension = (parsed.ext.substr(1) || parsed.name || "").split("?").shift().trim().toLowerCase();
  const value = extensions.has(extension) ? extensions.get(extension) : defaultMimeType;
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}
function detectExtension(mimeType) {
  if (!mimeType) {
    return defaultExtension;
  }
  const parts = mimeType.toLowerCase().trim().split("/");
  const rootType = parts.shift().trim();
  const subType = parts.join("/").trim();
  if (mimeTypes.has(rootType + "/" + subType)) {
    const value = mimeTypes.get(rootType + "/" + subType);
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }
  switch (rootType) {
    case "text":
      return "txt";
    default:
      return "bin";
  }
}

// node_modules/nodemailer/dist/esm/mime-node/index.js
var import_node_crypto = __toESM(require("node:crypto"), 1);
var import_node_fs2 = __toESM(require("node:fs"), 1);
var import_node_stream8 = require("node:stream");
var import_node_url2 = __toESM(require("node:url"), 1);

// node_modules/nodemailer/dist/esm/base64/index.js
var import_node_stream3 = require("node:stream");
function encode2(buffer) {
  if (typeof buffer === "string") {
    buffer = Buffer.from(buffer, "utf-8");
  }
  return buffer.toString("base64");
}
function normalizeLineLength(lineLength) {
  const length = Math.floor(Number(lineLength));
  return Number.isFinite(length) && length >= 1 ? length : 76;
}
function wrapBuffer(src, lineLength, final) {
  const lines = Math.ceil(src.length / lineLength);
  const complete = Math.max(lines - 1, 0);
  let rest = src.length - complete * lineLength;
  const output = Buffer.allocUnsafe(complete * (lineLength + 2) + (final ? rest : 0));
  let to = 0;
  for (let from = 0; from < complete * lineLength; from += lineLength) {
    src.copy(output, to, from, from + lineLength);
    to += lineLength;
    output[to++] = 13;
    output[to++] = 10;
  }
  if (final) {
    to += src.copy(output, to, complete * lineLength);
    rest = 0;
  }
  if (to !== output.length) {
    throw new Error("Unexpected wrapped length");
  }
  return { output, rest };
}
var Encoder = class extends import_node_stream3.Transform {
  constructor(options) {
    super();
    this.options = options || {};
    if (this.options.lineLength !== false) {
      this.options.lineLength = normalizeLineLength(this.options.lineLength);
    }
    this._curLine = "";
    this._remainingBytes = false;
    this.inputBytes = 0;
    this.outputBytes = 0;
  }
  /**
   * Emits the encoded characters `b64` that follow the current line, keeping what can not be
   * emitted yet as the new current line
   *
   * @internal
   */
  _emit(b64, final) {
    const src = Buffer.from(this._curLine + b64, "latin1");
    if (!src.length) {
      return;
    }
    let output = src;
    if (this.options.lineLength) {
      const wrapped = wrapBuffer(src, this.options.lineLength, final);
      output = wrapped.output;
      this._curLine = wrapped.rest ? src.toString("latin1", src.length - wrapped.rest) : "";
    } else {
      this._curLine = "";
    }
    if (output.length) {
      this.outputBytes += output.length;
      this.push(output);
    }
  }
  /** @internal */
  _transform(chunk, encoding, done) {
    let buf = encoding !== "buffer" ? Buffer.from(chunk, encoding) : chunk;
    if (!buf || !buf.length) {
      return done();
    }
    this.inputBytes += buf.length;
    if (this._remainingBytes) {
      buf = Buffer.concat([this._remainingBytes, buf], this._remainingBytes.length + buf.length);
      this._remainingBytes = false;
    }
    const extra = buf.length % 3;
    if (extra) {
      this._remainingBytes = buf.subarray(buf.length - extra);
      buf = buf.subarray(0, buf.length - extra);
    }
    this._emit(encode2(buf), false);
    done();
  }
  /** @internal */
  _flush(done) {
    this._emit(this._remainingBytes ? encode2(this._remainingBytes) : "", true);
    this._remainingBytes = false;
    done();
  }
};

// node_modules/nodemailer/dist/esm/qp/index.js
var import_node_stream4 = require("node:stream");
var MIN_LINE_LENGTH = 4;
var QP_RANGES = [
  [9],
  // <TAB>
  [10],
  // <LF>
  [13],
  // <CR>
  [32, 60],
  // <SP>!"#$%&'()*+,-./0123456789:;
  [62, 126]
  // >?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_`abcdefghijklmnopqrstuvwxyz{|}
];
var QP_LITERAL = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  QP_LITERAL[i] = checkRanges(i, QP_RANGES) ? 1 : 0;
}
var HEX_DIGITS = Buffer.from("0123456789ABCDEF", "latin1");
var isWhitespace = (c) => c === 32 || c === 9;
function encode3(buffer) {
  return encodeBytes(typeof buffer === "string" ? Buffer.from(buffer, "utf-8") : buffer);
}
function encodeBytes(buffer, next, binary, previous) {
  const len = buffer.length;
  const output = Buffer.allocUnsafe(len * 3);
  let pos = 0;
  for (let i = 0; i < len; i++) {
    const ord = buffer[i];
    const following = i + 1 < len ? buffer[i + 1] : next;
    const lineBreakByte = binary && (ord === 13 || ord === 10) ? ord === 13 ? following === 10 : (i > 0 ? buffer[i - 1] : previous) === 13 : true;
    if (QP_LITERAL[ord] && lineBreakByte && !(isWhitespace(ord) && (following === void 0 || following === 10 || following === 13))) {
      output[pos++] = ord;
      continue;
    }
    output[pos++] = 61;
    output[pos++] = HEX_DIGITS[Math.floor(ord / 16)];
    output[pos++] = HEX_DIGITS[ord % 16];
  }
  return output.toString("latin1", 0, pos);
}
function wrap(str, lineLength) {
  str = (str || "").toString();
  lineLength = Math.max(Number(lineLength) || 76, MIN_LINE_LENGTH);
  if (str.length <= lineLength) {
    return str;
  }
  let pos = 0;
  const len = str.length;
  let match, code, line;
  const lineMargin = Math.floor(lineLength / 3);
  let result = "";
  while (pos < len) {
    line = str.substr(pos, lineLength);
    if (match = line.match(/\r\n/)) {
      line = line.substr(0, match.index + match[0].length);
      result += line;
      pos += line.length;
      continue;
    }
    if (line.substr(-1) === "\n") {
      result += line;
      pos += line.length;
      continue;
    }
    if (match = line.substr(-lineMargin).match(/\n.*?$/)) {
      line = line.substr(0, line.length - (match[0].length - 1));
      result += line;
      pos += line.length;
      continue;
    }
    if (line.length > lineLength - lineMargin && (match = line.substr(-lineMargin).match(/[ \t.,!?][^ \t.,!?]*$/))) {
      line = line.substr(0, line.length - (match[0].length - 1));
    } else if (line.match(/[=][\da-f]{0,2}$/i)) {
      if (match = line.match(/[=][\da-f]{0,1}$/i)) {
        line = line.substr(0, line.length - match[0].length);
      }
      while (line.length > 3 && line.length < len - pos && !line.match(/^(?:=[\da-f]{2}){1,4}$/i) && (match = line.match(/[=][\da-f]{2}$/gi))) {
        code = parseInt(match[0].substr(1, 2), 16);
        if (code < 128) {
          break;
        }
        line = line.substr(0, line.length - 3);
        if (code >= 192) {
          break;
        }
      }
    }
    if (!line.length) {
      line = str.substr(pos, lineLength);
    }
    if (pos + line.length < len && line.substr(-1) !== "\n") {
      if (line.length === lineLength && line.match(/[=][\da-f]{2}$/i)) {
        line = line.substr(0, line.length - 3);
      } else if (line.length === lineLength) {
        line = line.substr(0, line.length - 1);
      }
      pos += line.length;
      line += "=\r\n";
    } else {
      pos += line.length;
    }
    result += line;
  }
  return result;
}
function checkRanges(nr, ranges) {
  for (let i = ranges.length - 1; i >= 0; i--) {
    const range = ranges[i];
    if (!range.length) {
      continue;
    }
    if (range.length === 1 && nr === range[0]) {
      return true;
    }
    if (range.length === 2 && nr >= range[0] && nr <= range[1]) {
      return true;
    }
  }
  return false;
}
var ENCODE_SLICE_SIZE = 64 * 1024;
var Encoder2 = class extends import_node_stream4.Transform {
  constructor(options) {
    super();
    this.options = options || {};
    if (this.options.lineLength !== false) {
      this.options.lineLength = this.options.lineLength || 76;
    }
    this._curLine = "";
    this._remainingBytes = false;
    this._lastByte = void 0;
    this.inputBytes = 0;
    this.outputBytes = 0;
  }
  /** @internal */
  _transform(chunk, encoding, done) {
    let buf = encoding !== "buffer" ? Buffer.from(chunk, encoding) : chunk;
    if (!buf || !buf.length) {
      return done();
    }
    this.inputBytes += buf.length;
    if (this._remainingBytes) {
      buf = Buffer.concat([this._remainingBytes, buf], this._remainingBytes.length + buf.length);
      this._remainingBytes = false;
    }
    let end = buf.length;
    while (end > 0 && (isWhitespace(buf[end - 1]) || this.options.binary && buf[end - 1] === 13)) {
      end--;
    }
    if (buf.length - end <= ENCODE_SLICE_SIZE) {
      this._remainingBytes = end < buf.length ? Buffer.from(buf.subarray(end)) : false;
      buf = buf.subarray(0, end);
    }
    this._encodeSlices(buf);
    done();
  }
  /** @internal */
  _flush(done) {
    if (this._remainingBytes) {
      this._encodeSlices(this._remainingBytes);
      this._remainingBytes = false;
    }
    if (this._curLine) {
      this.outputBytes += this._curLine.length;
      this.push(this._curLine, "ascii");
      this._curLine = "";
    }
    done();
  }
  /**
   * Encodes the input in slices of ENCODE_SLICE_SIZE bytes. Each slice is told the byte that
   * follows it, so a slice that ends in whitespace is encoded as if it was not split
   *
   * @internal
   */
  _encodeSlices(buf) {
    for (let start = 0; start < buf.length; start += ENCODE_SLICE_SIZE) {
      const end = Math.min(start + ENCODE_SLICE_SIZE, buf.length);
      this._encodeSlice(buf.subarray(start, end), end < buf.length ? buf[end] : void 0);
      this._lastByte = buf[end - 1];
    }
  }
  /** @internal */
  _encodeSlice(buf, next) {
    let qp;
    if (this.options.lineLength) {
      qp = wrap(this._curLine + encodeBytes(buf, next, this.options.binary, this._lastByte), this.options.lineLength);
      const lastLF = qp.lastIndexOf("\n");
      this._curLine = qp.substring(lastLF + 1);
      qp = qp.substring(0, lastLF + 1);
      if (qp) {
        this.outputBytes += qp.length;
        this.push(qp, "ascii");
      }
    } else {
      qp = encodeBytes(buf, next, this.options.binary, this._lastByte);
      this.outputBytes += qp.length;
      this.push(qp, "ascii");
    }
  }
};

// node_modules/nodemailer/dist/esm/mime-funcs/index.js
function isPlainText(value, isParam) {
  const re = isParam ? /[\x00-\x1f\x7f"\u0080-\uFFFF]/ : /[\x00-\x08\x0b\x0c\x0e-\x1f\u0080-\uFFFF]/;
  return typeof value === "string" && !re.test(value);
}
function quoteString(value) {
  return '"' + (value || "").toString().replace(/["\\]/g, "\\$&") + '"';
}
function hasLongerLines(str, lineLength) {
  if (str.length > 128 * 1024) {
    return true;
  }
  return new RegExp("^.{" + (lineLength + 1) + ",}", "m").test(str);
}
function encodeWord(data, mimeWordEncoding, maxLength) {
  mimeWordEncoding = (mimeWordEncoding || "Q").toString().toUpperCase().trim().charAt(0);
  maxLength = maxLength || 0;
  let encodedStr;
  const toCharset = "UTF-8";
  if (maxLength && maxLength > 7 + toCharset.length) {
    maxLength -= 7 + toCharset.length;
  }
  if (mimeWordEncoding === "Q") {
    encodedStr = encode3(data).replace(/[^a-z0-9!*+\-/=]/gi, (chr) => {
      const ord = chr.charCodeAt(0).toString(16).toUpperCase();
      if (chr === " ") {
        return "_";
      }
      return "=" + (ord.length === 1 ? "0" + ord : ord);
    });
  } else if (mimeWordEncoding === "B") {
    encodedStr = typeof data === "string" ? data : data.toString("utf-8");
    maxLength = maxLength ? Math.max(3, (maxLength - maxLength % 4) / 4 * 3) : 0;
  }
  if (maxLength && (mimeWordEncoding !== "B" ? encodedStr : encode2(data)).length > maxLength) {
    if (mimeWordEncoding === "Q") {
      encodedStr = splitMimeEncodedString(encodedStr, maxLength).join("?= =?" + toCharset + "?" + mimeWordEncoding + "?");
    } else {
      const parts = [];
      let lpart = "";
      for (let i = 0, len = encodedStr.length; i < len; i++) {
        let chr = encodedStr.charAt(i);
        if (/[\ud800-\udbff]/.test(chr) && /[\udc00-\udfff]/.test(encodedStr.charAt(i + 1))) {
          chr += encodedStr.charAt(++i);
        }
        if (Buffer.byteLength(lpart + chr) <= maxLength || i === 0) {
          lpart += chr;
        } else {
          parts.push(encode2(lpart));
          lpart = chr;
        }
      }
      if (lpart) {
        parts.push(encode2(lpart));
      }
      if (parts.length > 1) {
        encodedStr = parts.join("?= =?" + toCharset + "?" + mimeWordEncoding + "?");
      } else {
        encodedStr = parts.join("");
      }
    }
  } else if (mimeWordEncoding === "B") {
    encodedStr = encode2(data);
  }
  return "=?" + toCharset + "?" + mimeWordEncoding + "?" + encodedStr + (encodedStr.substr(-2) === "?=" ? "" : "?=");
}
function encodeWords(value, mimeWordEncoding, maxLength, encodeAll) {
  maxLength = maxLength || 0;
  let firstSpecial = -1;
  let lastSpecial = -1;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 34 || code >= 128) {
      if (firstSpecial < 0) {
        firstSpecial = i;
      }
      lastSpecial = i;
    }
  }
  if (firstSpecial < 0) {
    return value;
  }
  if (encodeAll) {
    return encodeWord(value, mimeWordEncoding, maxLength);
  }
  let startIndex = firstSpecial;
  while (startIndex > 0 && !/\s/.test(value.charAt(startIndex - 1))) {
    startIndex--;
  }
  let endIndex = lastSpecial + 1;
  while (endIndex < value.length && !/\s/.test(value.charAt(endIndex))) {
    endIndex++;
  }
  return (startIndex ? value.substr(0, startIndex) : "") + encodeWord(value.substring(startIndex, endIndex), mimeWordEncoding || "Q", maxLength) + (endIndex < value.length ? value.substr(endIndex) : "");
}
function buildHeaderValue(structured) {
  const paramsArray = [];
  Object.keys(structured.params || {}).forEach((key) => {
    const value2 = structured.params[key];
    const param = key.replace(/[\x00-\x1f\x7f]/g, "");
    if (!isPlainText(value2, true) || value2.length >= 75) {
      buildHeaderParam(param, value2, 50).forEach((encodedParam) => {
        if (!/[\s"\\;:/=(),<>@[\]?]|^[-']|'$/.test(encodedParam.value) || encodedParam.key.substr(-1) === "*") {
          paramsArray.push(encodedParam.key + "=" + encodedParam.value);
        } else {
          paramsArray.push(encodedParam.key + "=" + JSON.stringify(encodedParam.value));
        }
      });
    } else if (!value2.length || /[\s'"\\;:/=(),<>@[\]?]|^-/.test(value2)) {
      paramsArray.push(param + "=" + JSON.stringify(value2));
    } else {
      paramsArray.push(param + "=" + value2);
    }
  });
  const value = typeof structured.value === "string" ? structured.value.replace(/[\x00-\x1f\x7f]/g, "") : structured.value;
  return value + (paramsArray.length ? "; " + paramsArray.join("; ") : "");
}
function buildHeaderParam(key, data, maxLength) {
  const list = [];
  let encodedStr = typeof data === "string" ? data : (data || "").toString();
  let chr;
  let line;
  let startPos = 0;
  let i, len;
  maxLength = maxLength || 50;
  if (isPlainText(data, true)) {
    if (encodedStr.length <= maxLength) {
      return [
        {
          key,
          value: encodedStr
        }
      ];
    }
    encodedStr = encodedStr.replace(new RegExp(".{" + maxLength + "}", "g"), (str) => {
      list.push({
        line: str
      });
      return "";
    });
    if (encodedStr) {
      list.push({
        line: encodedStr
      });
    }
  } else {
    if (/[\uD800-\uDBFF]/.test(encodedStr)) {
      const encodedStrArr = [];
      for (i = 0, len = encodedStr.length; i < len; i++) {
        chr = encodedStr.charAt(i);
        if (/[\ud800-\udbff]/.test(chr) && /[\udc00-\udfff]/.test(encodedStr.charAt(i + 1))) {
          chr += encodedStr.charAt(i + 1);
          encodedStrArr.push(chr);
          i++;
        } else {
          encodedStrArr.push(chr);
        }
      }
      encodedStr = encodedStrArr;
    }
    line = "utf-8''";
    let encoded = true;
    startPos = 0;
    for (i = 0, len = encodedStr.length; i < len; i++) {
      chr = encodedStr[i];
      if (encoded) {
        chr = safeEncodeURIComponent(chr);
      } else {
        chr = chr === " " ? chr : safeEncodeURIComponent(chr);
        if (chr !== encodedStr[i]) {
          if ((safeEncodeURIComponent(line) + chr).length >= maxLength) {
            list.push({
              line,
              encoded
            });
            line = "";
            encoded = true;
          } else {
            encoded = true;
            i = startPos;
            line = "";
            continue;
          }
        }
      }
      if ((line + chr).length >= maxLength) {
        list.push({
          line,
          encoded
        });
        line = chr = encodedStr[i] === " " ? " " : safeEncodeURIComponent(encodedStr[i]);
        if (chr === encodedStr[i]) {
          encoded = false;
          startPos = i - 1;
        } else {
          encoded = true;
        }
      } else {
        line += chr;
      }
    }
    if (line) {
      list.push({
        line,
        encoded
      });
    }
  }
  return list.map((item, i2) => ({
    // encoded lines: {name}*{part}*
    // unencoded lines: {name}*{part}
    // if any line needs to be encoded then the first line (part==0) is always encoded
    key: key + "*" + i2 + (item.encoded ? "*" : ""),
    value: item.line
  }));
}
var TOKEN = /^[^\x00-\x20\x7f()<>@,;:\\"/[\]?=]+$/;
function _isParamName(name2) {
  return !!name2 && !isProtoKey(name2);
}
function parseHeaderValue(str) {
  const response = {
    value: "",
    params: {}
  };
  const setParam = (name2, value2) => {
    name2 = name2.toLowerCase();
    if (_isParamName(name2) && !Object.prototype.hasOwnProperty.call(response.params, name2)) {
      response.params[name2] = value2;
    }
  };
  let key = false;
  let value = "";
  let stage = "value";
  let quote = false;
  let escaped = false;
  let chr;
  let pendingSpace = "";
  let quoteClosed = false;
  const flushSpace = () => {
    if (value.length) {
      value += pendingSpace;
    }
    pendingSpace = "";
  };
  const addChr = (c) => {
    flushSpace();
    value += c;
  };
  const takeValue = () => {
    const taken = value;
    value = "";
    pendingSpace = "";
    quoteClosed = false;
    return taken;
  };
  const storeValue = () => {
    const taken = takeValue();
    if (key === false) {
      response.value = taken;
    } else {
      setParam(key, taken);
    }
  };
  const storeEmptyKey = () => {
    setParam(takeValue().trim(), "");
  };
  for (let i = 0, len = str.length; i < len; i++) {
    chr = str.charAt(i);
    if (stage === "key") {
      if (chr === "=") {
        key = takeValue().trim();
        stage = "value";
        continue;
      }
      if (chr === ";") {
        storeEmptyKey();
        continue;
      }
      value += chr;
    } else {
      if (quoteClosed && chr !== ";") {
        escaped = false;
        continue;
      }
      if (escaped) {
        addChr(chr);
      } else if (quote && chr === "\\") {
        escaped = true;
        continue;
      } else if (quote && chr === quote) {
        quote = false;
        quoteClosed = true;
      } else if (!quote && chr === '"') {
        quote = chr;
        flushSpace();
      } else if (!quote && chr === ";") {
        storeValue();
        stage = "key";
      } else if (!quote && (chr === " " || chr === "	")) {
        pendingSpace += chr;
      } else {
        addChr(chr);
      }
      escaped = false;
    }
  }
  if (stage === "value") {
    storeValue();
  } else {
    storeEmptyKey();
  }
  const continuations = /* @__PURE__ */ new Map();
  Object.keys(response.params).forEach((key2) => {
    const match = key2.match(/(\*(\d+)|\*(\d+)\*|\*)$/);
    if (!match) {
      return;
    }
    const actualKey = key2.substr(0, match.index);
    const nr = Number(match[2] || match[3]) || 0;
    const encoded = match[0].substr(-1) === "*";
    let value2 = response.params[key2];
    delete response.params[key2];
    if (!_isParamName(actualKey)) {
      return;
    }
    let continuation = continuations.get(actualKey);
    if (!continuation) {
      continuation = { charset: false, sections: [] };
      continuations.set(actualKey, continuation);
    }
    const charsetMatch = nr === 0 && encoded ? value2.match(/^([^']*)'[^']*'(.*)$/) : null;
    if (charsetMatch) {
      continuation.charset = TOKEN.test(charsetMatch[1]) ? charsetMatch[1] : "iso-8859-1";
      value2 = charsetMatch[2];
    }
    continuation.sections.push({ nr, value: value2, encoded });
  });
  continuations.forEach((continuation, key2) => {
    if (Object.prototype.hasOwnProperty.call(response.params, key2)) {
      return;
    }
    continuation.sections.sort((a, b) => a.nr - b.nr);
    if (!continuation.charset) {
      response.params[key2] = continuation.sections.map((section) => section.value).join("");
      return;
    }
    response.params[key2] = "=?" + continuation.charset + "?Q?" + continuation.sections.map(_encodeContinuationSection).join("") + "?=";
  });
  return response;
}
function _encodeContinuationSection(section) {
  const specials = section.encoded ? /[=?_\s]/g : /[=?_\s%]/g;
  return section.value.replace(specials, (s) => {
    const c = s.charCodeAt(0).toString(16);
    if (s === " ") {
      return "_";
    }
    return "%" + (c.length < 2 ? "0" : "") + c;
  }).replace(/%/g, "=");
}
function detectExtension2(mimeType) {
  return detectExtension(mimeType);
}
function detectMimeType2(extension) {
  return detectMimeType(extension);
}
function foldLines(str, lineLength, afterSpace) {
  str = (str || "").toString();
  lineLength = lineLength || 76;
  let pos = 0;
  const len = str.length;
  let result = "";
  let line, match;
  while (pos < len) {
    line = str.substr(pos, lineLength);
    if (line.length < lineLength) {
      result += line;
      break;
    }
    if (match = line.match(/^[^\n\r]*(\r?\n|\r)/)) {
      line = match[0];
      result += line;
      pos += line.length;
      continue;
    } else if ((match = line.match(/(\s+)[^\s]*$/)) && match[0].length - (afterSpace ? (match[1] || "").length : 0) < line.length) {
      line = line.substr(0, line.length - (match[0].length - (afterSpace ? (match[1] || "").length : 0)));
    } else if (match = str.substr(pos + line.length).match(/^[^\s]+(\s*)/)) {
      line = line + match[0].substr(0, match[0].length - (!afterSpace ? (match[1] || "").length : 0));
    }
    result += line;
    pos += line.length;
    if (pos < len) {
      result += "\r\n";
    }
  }
  return result;
}
function splitMimeEncodedString(str, maxlen) {
  const lines = [];
  let curLine, fallbackLine, match, chr, done;
  maxlen = Math.max(maxlen || 0, 12);
  while (str.length) {
    curLine = str.substr(0, maxlen);
    if (match = curLine.match(/[=][0-9A-F]?$/i)) {
      curLine = curLine.substr(0, match.index);
    }
    fallbackLine = curLine.length ? curLine : str.substr(0, maxlen);
    done = false;
    while (!done && curLine.length) {
      done = true;
      if (match = str.substr(curLine.length).match(/^[=]([0-9A-F]{2})/i)) {
        chr = parseInt(match[1], 16);
        if (chr < 194 && chr > 127) {
          curLine = curLine.substr(0, curLine.length - 3);
          done = false;
        }
      }
    }
    if (!curLine.length) {
      curLine = fallbackLine;
    }
    lines.push(curLine);
    str = str.substr(curLine.length);
  }
  return lines;
}
function encodeURICharComponent(chr) {
  let res = "";
  let ord = chr.charCodeAt(0).toString(16).toUpperCase();
  if (ord.length % 2) {
    ord = "0" + ord;
  }
  if (ord.length > 2) {
    for (let i = 0, len = ord.length / 2; i < len; i++) {
      res += "%" + ord.substr(i, 2);
    }
  } else {
    res += "%" + ord;
  }
  return res;
}
function safeEncodeURIComponent(str) {
  str = (str || "").toString();
  try {
    str = encodeURIComponent(str);
  } catch (_E) {
    str = encodeURIComponent(Buffer.from(str, "utf-8").toString("utf-8"));
  }
  return str.replace(/[\x00-\x1F *'()<>@,;:\\"[\]?=\u007F-\uFFFF]/g, (chr) => encodeURICharComponent(chr));
}

// node_modules/nodemailer/dist/esm/addressparser/index.js
function _quoteLocalPart(address) {
  const lastAt = address.lastIndexOf("@");
  if (lastAt < 0) {
    return address;
  }
  const user = address.substr(0, lastAt);
  if (/^[^\s"(),:;<>@[\\\]]+$/.test(user) || /^"(?:[^"\\]|\\[\s\S])*"$/.test(user)) {
    return address;
  }
  return '"' + user.replace(/["\\]/g, "\\$&") + '"@' + address.substr(lastAt + 1);
}
var HAS_WHITESPACE = /\s/;
var QUOTED_LOCAL_ADDR = /^("(?:[^"\\]|\\[\s\S])*"@\S+)(?:\s+([\s\S]+))?$/;
var ADDR_SPEC = /^[^@\s]+@[^@\s]+$/;
var LOOSE_ADDR_SPEC = /^[^@\s]+@\S+$/;
var LOOSE_TEXT_ADDR = /\s*\b[^@\s]+@[^\s]+\b\s*/y;
function _isSpaceCode(code) {
  return code === 32 || code >= 9 && code <= 13 || code === 160 || code === 5760 || code >= 8192 && code <= 8202 || code === 8232 || code === 8233 || code === 8239 || code === 8287 || code === 12288 || code === 65279;
}
function _isWordCode(code) {
  return code >= 48 && code <= 57 || code >= 65 && code <= 90 || code >= 97 && code <= 122 || code === 95;
}
function _isBoundary(text, at) {
  return _isWordCode(text.charCodeAt(at - 1)) !== _isWordCode(text.charCodeAt(at));
}
function _indexOfAt(text, from, to) {
  for (let i = from; i < to; i++) {
    if (text.charCodeAt(i) === 64) {
      return i;
    }
  }
  return -1;
}
function _looseAddressStart(text) {
  const len = text.length;
  let pos = 0;
  while (pos < len) {
    while (pos < len && _isSpaceCode(text.charCodeAt(pos))) {
      pos++;
    }
    if (pos >= len) {
      break;
    }
    const runStart = pos;
    let runEnd = pos;
    while (runEnd < len && !_isSpaceCode(text.charCodeAt(runEnd))) {
      runEnd++;
    }
    let at = _indexOfAt(text, runStart, runEnd);
    if (at >= 0) {
      let lastBoundary = -1;
      for (let k = runEnd; k > runStart; k--) {
        if (_isBoundary(text, k)) {
          lastBoundary = k;
          break;
        }
      }
      let atomStart = runStart;
      while (lastBoundary >= 0 && at >= 0) {
        if (at > atomStart && runEnd > at + 1 && lastBoundary > at + 1) {
          for (let start = atomStart; start < at; start++) {
            if (_isBoundary(text, start)) {
              if (start > runStart) {
                return start;
              }
              let padded = runStart;
              while (padded > 0 && _isSpaceCode(text.charCodeAt(padded - 1))) {
                padded--;
              }
              return padded;
            }
          }
        }
        atomStart = at + 1;
        at = _indexOfAt(text, atomStart, runEnd);
      }
    }
    pos = runEnd;
  }
  return -1;
}
function _recoverAddrSpec(data) {
  if (!HAS_WHITESPACE.test(data.address)) {
    return;
  }
  let address;
  let rest;
  const quoted = data.address.match(QUOTED_LOCAL_ADDR);
  if (quoted) {
    if (!quoted[2]) {
      return;
    }
    address = quoted[1];
    rest = [quoted[2]];
  } else {
    if (data.address.indexOf('"') >= 0) {
      return;
    }
    const parts = data.address.split(/\s+/);
    let addrIndex = parts.findIndex((part) => ADDR_SPEC.test(part));
    if (addrIndex < 0) {
      addrIndex = parts.findIndex((part) => LOOSE_ADDR_SPEC.test(part));
    }
    if (addrIndex < 0) {
      return;
    }
    address = parts.splice(addrIndex, 1)[0];
    rest = parts;
  }
  data.address = address;
  data.text = [data.text].concat(rest).filter((part) => part).join(" ");
}
function _stripAddressComments(address) {
  const comments = [];
  let result = "";
  let comment = "";
  let depth = 0;
  let closer = "";
  let lastChar = "";
  for (let i = 0, len = address.length; i < len; i++) {
    const chr = address.charAt(i);
    if (depth) {
      if (chr === "\\" && i < len - 1) {
        comment += address.charAt(++i);
      } else if (chr === "(") {
        depth++;
        comment += chr;
      } else if (chr === ")" && !--depth) {
        comments.push(comment.trim());
        comment = "";
        if (lastChar !== "@" && address.charAt(i + 1) !== "@") {
          result += " ";
          lastChar = " ";
        }
      } else {
        comment += chr;
      }
      continue;
    }
    if (closer) {
      if (chr === "\\" && closer === '"' && i < len - 1) {
        result += chr + address.charAt(++i);
        lastChar = address.charAt(i);
        continue;
      }
      if (chr === closer) {
        closer = "";
      }
    } else if (chr === '"') {
      closer = '"';
    } else if (chr === "[") {
      closer = "]";
    } else if (chr === "(") {
      depth = 1;
      continue;
    }
    result += chr;
    lastChar = chr;
  }
  if (depth) {
    comments.push(comment.trim());
  }
  return { address: result.trim(), comments: comments.filter((text) => text) };
}
function _handleAddress(tokens, depth) {
  let isGroup = false;
  let state = "text";
  const addresses = [];
  const data = {
    address: [],
    comment: [],
    group: [],
    text: [],
    textWasQuoted: []
  };
  let insideQuotes = false;
  const lastChars = { address: "", comment: "", group: "", text: "" };
  for (let i = 0, len = tokens.length; i < len; i++) {
    const token = tokens[i];
    const prevToken = i ? tokens[i - 1] : null;
    if (token.type === "operator") {
      switch (token.value) {
        case "<":
          state = "address";
          insideQuotes = false;
          break;
        case "(":
          state = "comment";
          insideQuotes = false;
          break;
        case ":":
          state = "group";
          isGroup = true;
          insideQuotes = false;
          break;
        case '"':
          insideQuotes = !insideQuotes;
          state = "text";
          break;
        default:
          state = "text";
          insideQuotes = false;
          break;
      }
    } else if (token.value) {
      const prevPrevToken = i > 1 ? tokens[i - 2] : null;
      const opensAfterEmptyQuotedString = prevToken?.type === "operator" && prevToken.value === '"' && !!prevToken.noBreak && prevPrevToken?.type === "operator" && prevPrevToken.value === '"';
      if (state === "address") {
        token.value = token.value.replace(/^[^<]*<\s*/, "");
      }
      const parts = data[state];
      const joins = prevToken && prevToken.noBreak && parts.length && (prevToken.value !== ")" || lastChars[state] === "@" || token.value.charAt(0) === "@");
      if (joins) {
        data[state][data[state].length - 1] += token.value;
        if (token.value) {
          lastChars[state] = token.value.charAt(token.value.length - 1);
        }
        if (state === "text" && insideQuotes) {
          data.textWasQuoted[data.textWasQuoted.length - 1] = true;
        }
      } else {
        data[state].push(token.value);
        lastChars[state] = token.value.charAt(token.value.length - 1);
        if (state === "text") {
          data.textWasQuoted.push(insideQuotes || opensAfterEmptyQuotedString);
        }
      }
    }
  }
  if (!data.text.length && data.comment.length) {
    data.text = data.comment;
    data.comment = [];
  }
  if (isGroup) {
    data.text = data.text.join(" ");
    let groupMembers = [];
    if (data.group.length) {
      const parsedGroup = _parseAddressList(data.group.join(","), depth + 1);
      parsedGroup.forEach((member) => {
        if (member.group) {
          groupMembers = groupMembers.concat(member.group);
        } else {
          groupMembers.push(member);
        }
      });
    }
    addresses.push({
      name: data.text || "",
      group: groupMembers
    });
  } else {
    const addressComments = [];
    const addressParts = [];
    for (const part of data.address) {
      if (part.indexOf("(") < 0) {
        addressParts.push(part);
        continue;
      }
      const stripped = _stripAddressComments(part);
      for (const comment of stripped.comments) {
        addressComments.push(comment);
      }
      if (stripped.address) {
        addressParts.push(stripped.address);
      }
    }
    data.address = addressParts;
    if (!data.address.length && data.text.length) {
      for (let i = data.text.length - 1; i >= 0; i--) {
        if (!data.textWasQuoted[i] && ADDR_SPEC.test(data.text[i])) {
          data.address = data.text.splice(i, 1);
          data.textWasQuoted.splice(i, 1);
          break;
        }
      }
      if (!data.address.length) {
        let extracted = false;
        for (let i = data.text.length - 1; i >= 0; i--) {
          if (!data.textWasQuoted[i]) {
            const part = data.text[i];
            let remainder = part;
            const at = _looseAddressStart(part);
            if (at >= 0) {
              LOOSE_TEXT_ADDR.lastIndex = at;
              const match = LOOSE_TEXT_ADDR.exec(part);
              if (match) {
                data.address = [match[0].trim()];
                extracted = true;
                remainder = part.slice(0, at) + " " + part.slice(at + match[0].length);
              }
            }
            data.text[i] = remainder.trim();
            if (extracted) {
              break;
            }
          }
        }
      }
    }
    if (!data.text.length && data.comment.length) {
      data.text = data.comment;
      data.comment = [];
    }
    if (data.address.length > 1) {
      data.text = data.text.concat(data.address.splice(1));
    }
    const addressFromQuotedText = !data.address.length && data.textWasQuoted.some((wasQuoted) => wasQuoted);
    data.text = data.text.join(" ");
    data.address = data.address.join(" ");
    if (addressFromQuotedText && data.text.indexOf("@") >= 0) {
      data.address = _quoteLocalPart(data.text);
      data.text = "";
    }
    _recoverAddrSpec(data);
    if (!data.text && addressComments.length) {
      data.text = addressComments.join(" ");
    }
    const address = {
      address: data.address || data.text || "",
      name: data.text || data.address || ""
    };
    if (address.address === address.name) {
      if (/@/.test(address.address || "")) {
        address.name = "";
      } else {
        address.address = "";
      }
    }
    addresses.push(address);
  }
  return addresses;
}
var Tokenizer = class {
  constructor(str) {
    this.str = (str || "").toString();
    this.operatorCurrent = "";
    this.operatorExpecting = "";
    this.node = null;
    this.escaped = false;
    this.inDomainLiteral = false;
    this.afterAt = false;
    this.list = [];
    this.operators = {
      '"': '"',
      "(": ")",
      "<": ">",
      ",": "",
      ":": ";",
      // Semicolons are not a legal delimiter per the RFC2822 grammar other
      // than for terminating a group, but they are also not valid for any
      // other use in this context.  Given that some mail clients have
      // historically allowed the semicolon as a delimiter equivalent to the
      // comma in their UI, it makes sense to treat them the same as a comma
      // when used outside of a group.
      ";": ""
    };
  }
  /**
   * Tokenizes the original input string
   *
   * @return An array of operator|text tokens
   */
  tokenize() {
    const list = [];
    for (let i = 0, len = this.str.length; i < len; i++) {
      const chr = this.str.charAt(i);
      const nextChr = i < len - 1 ? this.str.charAt(i + 1) : null;
      this.checkChar(chr, nextChr);
    }
    this.list.forEach((node) => {
      node.value = (node.value || "").toString().trim();
      if (node.value) {
        list.push(node);
      }
    });
    return list;
  }
  /**
   * Checks if a character is an operator or text and acts accordingly
   *
   * @param chr Character from the address field
   * @param nextChr Character following chr, null at the end of the field
   */
  checkChar(chr, nextChr) {
    if (!this.escaped && !this.operatorExpecting) {
      if (!this.inDomainLiteral && chr === "[" && this.afterAt) {
        this.inDomainLiteral = true;
      } else if (this.inDomainLiteral && (chr === "]" || chr === "," || chr === ";")) {
        this.inDomainLiteral = false;
      }
    }
    if (this.escaped) {
    } else if (chr === this.operatorExpecting) {
      this.node = {
        type: "operator",
        value: chr
      };
      if (nextChr && ![" ", "	", "\r", "\n", ",", ";"].includes(nextChr)) {
        this.node.noBreak = true;
      }
      this.list.push(this.node);
      this.node = null;
      if (chr !== ")") {
        this.afterAt = false;
      }
      this.operatorExpecting = "";
      this.escaped = false;
      return;
    } else if (!this.operatorExpecting && !(this.inDomainLiteral && chr === ":") && chr in this.operators) {
      this.node = {
        type: "operator",
        value: chr
      };
      this.list.push(this.node);
      this.node = null;
      if (chr !== "(") {
        this.afterAt = false;
      }
      this.operatorExpecting = this.operators[chr];
      this.escaped = false;
      return;
    } else if (['"', "'", ")"].includes(this.operatorExpecting) && chr === "\\") {
      this.escaped = true;
      return;
    }
    if (!this.node) {
      this.node = {
        type: "text",
        value: ""
      };
      this.list.push(this.node);
    }
    if (chr === "\n") {
      chr = " ";
    }
    if (chr.charCodeAt(0) >= 33 || [" ", "	"].includes(chr)) {
      this.node.value += chr;
      if (!this.operatorExpecting && chr !== " " && chr !== "	") {
        this.afterAt = chr === "@";
      }
    }
    this.escaped = false;
  }
};
var MAX_NESTED_GROUP_DEPTH = 50;
function _parseAddressList(str, depth) {
  if (depth > MAX_NESTED_GROUP_DEPTH) {
    return [];
  }
  const tokenizer = new Tokenizer(str);
  const tokens = tokenizer.tokenize();
  const addresses = [];
  let address = [];
  const parsedAddresses = [];
  tokens.forEach((token) => {
    if (token.type === "operator" && (token.value === "," || token.value === ";")) {
      if (address.length) {
        addresses.push(address);
      }
      address = [];
    } else {
      address.push(token);
    }
  });
  if (address.length) {
    addresses.push(address);
  }
  addresses.forEach((addr) => {
    const handled = _handleAddress(addr, depth);
    for (let i = 0; i < handled.length; i++) {
      parsedAddresses.push(handled[i]);
    }
  });
  const mergedAddresses = [];
  for (let i = parsedAddresses.length - 1; i >= 0; i--) {
    const current = parsedAddresses[i];
    const next = mergedAddresses.length ? mergedAddresses[mergedAddresses.length - 1] : null;
    if (next && current.address === "" && current.name && !current.group && next.address && next.name) {
      next.name = current.name + ", " + next.name;
    } else {
      mergedAddresses.push(current);
    }
  }
  mergedAddresses.reverse();
  return mergedAddresses;
}
function addressparser(str, options) {
  const parsedAddresses = _parseAddressList(str, 0);
  if (options?.flatten) {
    const flatAddresses = [];
    const walkAddressList = (list) => {
      list.forEach((entry) => {
        if (entry.group) {
          return walkAddressList(entry.group);
        }
        flatAddresses.push(entry);
      });
    };
    walkAddressList(parsedAddresses);
    return flatAddresses;
  }
  return parsedAddresses;
}
var addressparser_default = addressparser;

// node_modules/nodemailer/dist/esm/mime-node/last-newline.js
var import_node_stream5 = require("node:stream");
var LastNewline = class extends import_node_stream5.Transform {
  constructor() {
    super();
    this.lastByte = false;
  }
  /** @internal */
  _transform(chunk, encoding, done) {
    if (chunk.length) {
      this.lastByte = chunk[chunk.length - 1];
    }
    this.push(chunk);
    done();
  }
  /** @internal */
  _flush(done) {
    if (this.lastByte === 10) {
      return done();
    }
    if (this.lastByte === 13) {
      this.push(Buffer.from("\n"));
      return done();
    }
    this.push(Buffer.from("\r\n"));
    return done();
  }
};

// node_modules/nodemailer/dist/esm/mime-node/le-windows.js
var import_node_stream6 = require("node:stream");
var LeWindows = class extends import_node_stream6.Transform {
  constructor(options) {
    super(options);
    this.lastByte = false;
  }
  /**
   * Escapes dots
   * @internal
   */
  _transform(chunk, encoding, done) {
    let buf;
    let lastPos = 0;
    for (let i = 0, len = chunk.length; i < len; i++) {
      if (chunk[i] === 10) {
        if (i && chunk[i - 1] !== 13 || !i && this.lastByte !== 13) {
          if (i > lastPos) {
            buf = chunk.slice(lastPos, i);
            this.push(buf);
          }
          this.push(Buffer.from("\r\n"));
          lastPos = i + 1;
        }
      }
    }
    if (lastPos && lastPos < chunk.length) {
      buf = chunk.slice(lastPos);
      this.push(buf);
    } else if (!lastPos) {
      this.push(chunk);
    }
    this.lastByte = chunk[chunk.length - 1];
    done();
  }
};

// node_modules/nodemailer/dist/esm/mime-node/le-unix.js
var import_node_stream7 = require("node:stream");
var LeUnix = class extends import_node_stream7.Transform {
  constructor(options) {
    super(options);
  }
  /**
   * Escapes dots
   * @internal
   */
  _transform(chunk, encoding, done) {
    let buf;
    let lastPos = 0;
    for (let i = 0, len = chunk.length; i < len; i++) {
      if (chunk[i] === 13) {
        buf = chunk.slice(lastPos, i);
        lastPos = i + 1;
        this.push(buf);
      }
    }
    if (lastPos && lastPos < chunk.length) {
      buf = chunk.slice(lastPos);
      this.push(buf);
    } else if (!lastPos) {
      this.push(chunk);
    }
    done();
  }
};

// node_modules/nodemailer/dist/esm/mime-node/index.js
var FORMATTED_HEADERS = ["From", "Sender", "To", "Cc", "Bcc", "Reply-To", "Date", "References"];
var ATEXT = "[A-Za-z0-9!#$%&'*+\\-/=?^_`{|}~\\x80-\\uFFFF]";
var DOT_ATOM = new RegExp("^" + ATEXT + "+(?:\\." + ATEXT + "+)*$");
var QUOTED_STRING = /^"(?:[^"\\]|\\[\s\S])*"$/;
var PLAIN_ADDRESS = /^[^\s"(),:;<>@[\\\]]+@[^\s"(),:;<>@[\\\]]+$/;
var URL_PARSER_UNSAFE = /[/\\?#%\x00-\x20\x7F]/;
var MAX_DOMAIN_LENGTH = 253;
var MAX_LABEL_LENGTH = 63;
var PIPELINE_NOOP = () => false;
function abortedError() {
  const err = new Error("Message stream was closed before the message was generated");
  err.code = ESTREAM;
  return err;
}
function exceedsDomainLimits(domain) {
  let total = 0;
  let label = 0;
  for (const char of domain) {
    total++;
    if (char === "." || char === "\u3002" || char === "\uFF0E" || char === "\uFF61") {
      label = 0;
    } else if (++label > MAX_LABEL_LENGTH) {
      return true;
    }
  }
  return total > MAX_DOMAIN_LENGTH;
}
function normalizeDomain(domain, toUnicode2) {
  if (typeof import_node_url2.default.domainToASCII === "function" && typeof import_node_url2.default.domainToUnicode === "function" && !URL_PARSER_UNSAFE.test(domain)) {
    const ascii = import_node_url2.default.domainToASCII(domain);
    const mapped = ascii && toUnicode2 ? import_node_url2.default.domainToUnicode(ascii) : ascii;
    if (mapped) {
      return mapped;
    }
  }
  if (exceedsDomainLimits(domain)) {
    return domain;
  }
  return toUnicode2 ? toUnicode(domain) : toASCII(domain);
}
function _stripBoundaryControls(value) {
  return value.replace(/[\x00-\x1f\x7f]+/g, "");
}
var MimeNode = class _MimeNode {
  constructor(contentType, options) {
    this.nodeCounter = 0;
    options = options || {};
    this.baseBoundary = _stripBoundaryControls(options.baseBoundary || import_node_crypto.default.randomBytes(8).toString("hex"));
    this.boundaryPrefix = _stripBoundaryControls(options.boundaryPrefix || "--_NmP");
    this.disableFileAccess = !!options.disableFileAccess;
    this.disableUrlAccess = !!options.disableUrlAccess;
    this.normalizeHeaderKey = options.normalizeHeaderKey;
    this.date = options.parentNode ? null : /* @__PURE__ */ new Date();
    this.rootNode = options.rootNode || this;
    this.keepBcc = !!options.keepBcc;
    if (options.filename) {
      this.filename = options.filename;
      if (!contentType) {
        contentType = detectMimeType2(this.filename.split(".").pop());
      }
    }
    this.textEncoding = (options.textEncoding || "").toString().trim().charAt(0).toUpperCase();
    this.parentNode = options.parentNode;
    this.hostname = options.hostname;
    this.newline = options.newline;
    this.childNodes = [];
    this._nodeId = ++this.rootNode.nodeCounter;
    this._headers = [];
    this._isPlainText = false;
    this._hasLongLines = false;
    this._envelope = false;
    this._raw = false;
    this._transforms = [];
    this._processFuncs = [];
    if (contentType) {
      this.setHeader("Content-Type", contentType);
    }
  }
  /////// PUBLIC METHODS
  /**
   * Creates and appends a child node.Arguments provided are passed to MimeNode constructor
   *
   * @param [contentType] Optional content type
   * @param [options] Optional options object
   * @return Created node object
   */
  createChild(contentType, options) {
    if (!options && typeof contentType === "object") {
      options = contentType;
      contentType = void 0;
    }
    const node = new _MimeNode(contentType, options);
    this.appendChild(node);
    return node;
  }
  /**
   * Appends an existing node to the mime tree. Removes the node from an existing
   * tree if needed
   *
   * @param childNode node to be appended
   * @return Appended node object
   */
  appendChild(childNode) {
    if (childNode.parentNode && childNode.parentNode !== this) {
      childNode.remove();
    }
    if (childNode.rootNode !== this.rootNode) {
      childNode.rootNode = this.rootNode;
      childNode._nodeId = ++this.rootNode.nodeCounter;
    }
    childNode.parentNode = this;
    this.childNodes.push(childNode);
    return childNode;
  }
  /**
   * Replaces current node with another node
   *
   * @param node Replacement node
   * @return Replacement node
   */
  replace(node) {
    if (node === this) {
      return this;
    }
    this.parentNode.childNodes.forEach((childNode, i) => {
      if (childNode === this) {
        node.rootNode = this.rootNode;
        node.parentNode = this.parentNode;
        node._nodeId = this._nodeId;
        this.rootNode = this;
        this.parentNode = void 0;
        node.parentNode.childNodes[i] = node;
      }
    });
    return node;
  }
  /**
   * Removes current node from the mime tree
   *
   * @return removed node
   */
  remove() {
    if (!this.parentNode) {
      return this;
    }
    for (let i = this.parentNode.childNodes.length - 1; i >= 0; i--) {
      if (this.parentNode.childNodes[i] === this) {
        this.parentNode.childNodes.splice(i, 1);
        this.parentNode = void 0;
        this.rootNode = this;
        return this;
      }
    }
  }
  /**
   * Sets a header value. If the value for selected key exists, it is overwritten.
   * You can set multiple values as well by using [{key:'', value:''}] or
   * {key: 'value'} as the first argument.
   *
   * @param key Header key or a list of key value pairs
   * @param value Header value
   * @return current node
   */
  setHeader(key, value) {
    let added = false;
    if (!value && key && typeof key === "object") {
      if (key.key && "value" in key) {
        this.setHeader(key.key, key.value);
      } else if (Array.isArray(key)) {
        key.forEach((i) => {
          this.setHeader(i.key, i.value);
        });
      } else {
        Object.keys(key).forEach((i) => {
          this.setHeader(i, key[i]);
        });
      }
      return this;
    }
    key = this._normalizeHeaderKey(key);
    const headerValue = {
      key,
      value
    };
    for (let i = 0, len = this._headers.length; i < len; i++) {
      if (this._headers[i].key === key) {
        if (!added) {
          this._headers[i] = headerValue;
          added = true;
        } else {
          this._headers.splice(i, 1);
          i--;
          len--;
        }
      }
    }
    if (!added) {
      this._headers.push(headerValue);
    }
    return this;
  }
  /**
   * Adds a header value. If the value for selected key exists, the value is appended
   * as a new field and old one is not touched.
   * You can set multiple values as well by using [{key:'', value:''}] or
   * {key: 'value'} as the first argument.
   *
   * @param key Header key or a list of key value pairs
   * @param value Header value
   * @return current node
   */
  addHeader(key, value) {
    if (!value && key && typeof key === "object") {
      if (key.key && key.value) {
        this.addHeader(key.key, key.value);
      } else if (Array.isArray(key)) {
        key.forEach((i) => {
          this.addHeader(i.key, i.value);
        });
      } else {
        Object.keys(key).forEach((i) => {
          this.addHeader(i, key[i]);
        });
      }
      return this;
    } else if (Array.isArray(value)) {
      value.forEach((val) => {
        this.addHeader(key, val);
      });
      return this;
    }
    this._headers.push({
      key: this._normalizeHeaderKey(key),
      value
    });
    return this;
  }
  /**
   * Retrieves the first mathcing value of a selected key
   *
   * @param key Key to search for
   * @retun Value for the key
   */
  getHeader(key) {
    key = this._normalizeHeaderKey(key);
    for (let i = 0, len = this._headers.length; i < len; i++) {
      if (this._headers[i].key === key) {
        return this._headers[i].value;
      }
    }
  }
  /**
   * Sets body content for current node. If the value is a string, charset is added automatically
   * to Content-Type (if it is text/*). If the value is a Buffer, you need to specify
   * the charset yourself
   *
   * @param content Body content
   * @return current node
   */
  setContent(content) {
    this.content = content;
    if (typeof this.content.pipe === "function") {
      recordStreamErrors(this.content);
    } else if (typeof this.content === "string") {
      this._isPlainText = isPlainText(this.content);
      if (this._isPlainText && hasLongerLines(this.content, 76)) {
        this._hasLongLines = true;
      }
    }
    return this;
  }
  build(callback) {
    let promise;
    if (!callback) {
      promise = new Promise((resolve3, reject) => {
        callback = callbackPromise(resolve3, reject);
      });
    }
    const done = callback;
    const stream = this.createReadStream();
    const buf = [];
    let buflen = 0;
    let returned = false;
    stream.on("readable", () => {
      let chunk;
      while ((chunk = stream.read()) !== null) {
        buf.push(chunk);
        buflen += chunk.length;
      }
    });
    stream.once("error", (err) => {
      if (returned) {
        return;
      }
      returned = true;
      return done(err);
    });
    stream.once("end", (chunk) => {
      if (returned) {
        return;
      }
      returned = true;
      if (chunk && chunk.length) {
        buf.push(chunk);
        buflen += chunk.length;
      }
      return done(null, Buffer.concat(buf, buflen));
    });
    return promise;
  }
  getTransferEncoding() {
    let transferEncoding = false;
    const contentType = (this.getHeader("Content-Type") || "").toString().toLowerCase().trim();
    if (this.content) {
      transferEncoding = (this.getHeader("Content-Transfer-Encoding") || "").toString().toLowerCase().trim();
      if (!transferEncoding || !["base64", "quoted-printable"].includes(transferEncoding)) {
        if (/^text\//i.test(contentType)) {
          if (this._isPlainText && !this._hasLongLines) {
            transferEncoding = "7bit";
          } else if (typeof this.content === "string" || this.content instanceof Buffer) {
            transferEncoding = this._getTextEncoding(this.content) === "Q" ? "quoted-printable" : "base64";
          } else {
            transferEncoding = this.textEncoding === "B" ? "base64" : "quoted-printable";
          }
        } else if (!/^(multipart|message)\//i.test(contentType)) {
          transferEncoding = transferEncoding || "base64";
        }
      }
    }
    return transferEncoding;
  }
  /**
   * Builds the header block for the mime node. Append \r\n\r\n before writing the content
   *
   * @returns Headers
   */
  buildHeaders() {
    const transferEncoding = this.getTransferEncoding();
    const headers = [];
    if (transferEncoding) {
      this.setHeader("Content-Transfer-Encoding", transferEncoding);
    }
    if (this.filename && !this.getHeader("Content-Disposition")) {
      this.setHeader("Content-Disposition", "attachment");
    }
    if (this.rootNode === this) {
      if (!this.getHeader("Date")) {
        this.setHeader("Date", this.date.toUTCString().replace(/GMT/, "+0000"));
      }
      this.messageId();
      if (!this.getHeader("MIME-Version")) {
        this.setHeader("MIME-Version", "1.0");
      }
      for (let i = this._headers.length - 2; i >= 0; i--) {
        const header = this._headers[i];
        if (header.key === "Content-Type") {
          this._headers.splice(i, 1);
          this._headers.push(header);
        }
      }
    }
    this._headers.forEach((header) => {
      let key = header.key;
      let value = header.value;
      let structured;
      let param;
      const options = {};
      const formattedHeaders = FORMATTED_HEADERS;
      if (value && typeof value === "object" && !formattedHeaders.includes(key)) {
        copyOwnKeys(options, value, (optionKey) => optionKey === "value");
        value = (value.value || "").toString();
        if (!value.trim()) {
          return;
        }
      }
      if (options.prepared) {
        if (options.foldLines) {
          headers.push(foldLines(key + ": " + value));
        } else {
          headers.push(key + ": " + value);
        }
        return;
      }
      switch (header.key) {
        case "Content-Disposition":
          structured = parseHeaderValue(value);
          if (this.filename) {
            structured.params.filename = this.filename;
          }
          value = buildHeaderValue(structured);
          break;
        case "Content-Type":
          structured = parseHeaderValue(value);
          structured.value = (structured.value || "").toString().replace(/[\x00-\x1f\x7f]/g, "");
          this._handleContentType(structured);
          if (structured.value.match(/^text\/plain\b/) && typeof this.content === "string" && /[\u0080-\uFFFF]/.test(this.content)) {
            structured.params.charset = "utf-8";
          }
          if (this.filename) {
            for (const paramKey of Object.keys(structured.params)) {
              if (/^name(\*|$)/i.test(paramKey)) {
                delete structured.params[paramKey];
              }
            }
          }
          value = buildHeaderValue(structured);
          if (this.filename) {
            param = /[\x00-\x1f\x7f]/.test(this.filename) ? encodeWord(this.filename, this._getTextEncoding(this.filename), 52) : this._encodeWords(this.filename);
            if (param !== this.filename || /[\s'"\\;:/=(),<>@[\]?]|^-/.test(param)) {
              param = JSON.stringify(param);
            }
            value += "; name=" + param;
          }
          break;
        case "Bcc":
          if (!this.keepBcc) {
            return;
          }
          break;
      }
      value = this._encodeHeaderValue(key, value);
      if (!(value || "").toString().trim()) {
        return;
      }
      if (typeof this.normalizeHeaderKey === "function") {
        const normalized2 = this.normalizeHeaderKey(key, value);
        const cleaned = typeof normalized2 === "string" ? normalized2.replace(/[\x00-\x1f\x7f]/g, "") : "";
        if (cleaned) {
          key = cleaned;
        }
      }
      headers.push(foldLines(key + ": " + value, 76));
    });
    return headers.join("\r\n");
  }
  /**
   * Streams the rfc2822 message from the current node. If this is a root node,
   * mandatory header fields are set if missing (Date, Message-Id, MIME-Version)
   *
   * @return Compiled message
   */
  createReadStream(options) {
    options = options || {};
    const stream = new import_node_stream8.PassThrough(options);
    this.stream(stream, options, (err) => {
      if (err) {
        stream.destroy(err);
        return;
      }
      stream.end();
    });
    stream.once("close", () => {
      if (!stream.writableFinished) {
        this._destroyContentStreams();
      }
    });
    const stages = [stream];
    for (const transform of this._transforms) {
      stages.push(typeof transform === "function" ? transform() : transform);
    }
    stages.push(new LastNewline());
    let outputStream = (0, import_node_stream8.pipeline)(stages, PIPELINE_NOOP);
    for (const processFunc of this._processFuncs) {
      const input = outputStream;
      outputStream = processFunc(input);
      if (outputStream !== input) {
        (0, import_node_stream8.finished)(outputStream, (err) => {
          if (err) {
            input.destroy();
          }
        });
      }
    }
    if (this.newline) {
      const winbreak = ["win", "windows", "dos", "\r\n"].includes(this.newline.toString().toLowerCase());
      outputStream = (0, import_node_stream8.pipeline)(outputStream, winbreak ? new LeWindows() : new LeUnix(), PIPELINE_NOOP);
    }
    return outputStream;
  }
  /**
   * Appends a transform stream object to the transforms list. Final output
   * is passed through this stream before exposing
   *
   * @param transform Read-Write stream
   */
  transform(transform) {
    this._transforms.push(transform);
  }
  /**
   * Appends a post process function. The functon is run after transforms and
   * uses the following syntax
   *
   *   processFunc(input) -> outputStream
   *
   * @param processFunc Read-Write stream
   */
  processFunc(processFunc) {
    this._processFuncs.push(processFunc);
  }
  stream(outputStream, options, done) {
    const transferEncoding = this.getTransferEncoding();
    let activeStreams = [];
    let returned = false;
    const callback = (err) => {
      if (returned) {
        return;
      }
      returned = true;
      outputStream.removeListener("close", onOutputClose);
      done(err);
    };
    function onOutputClose() {
      for (const stream of activeStreams) {
        stream.destroy();
      }
      return callback(abortedError());
    }
    const readInto = (...streams) => {
      if (!activeStreams.length) {
        outputStream.once("close", onOutputClose);
      }
      activeStreams = streams;
    };
    const aborted = () => {
      if (outputStream.destroyed) {
        callback(abortedError());
        return true;
      }
      return false;
    };
    const finalize = () => {
      let childId = 0;
      const processChildNode = () => {
        if (aborted()) {
          return;
        }
        if (childId >= this.childNodes.length) {
          outputStream.write("\r\n--" + this.boundary + "--\r\n");
          return callback();
        }
        const child = this.childNodes[childId++];
        outputStream.write((childId > 1 ? "\r\n" : "") + "--" + this.boundary + "\r\n");
        child.stream(outputStream, options, (err) => {
          if (err) {
            return callback(err);
          }
          setImmediate(processChildNode);
        });
      };
      if (this.multipart) {
        setImmediate(processChildNode);
      } else {
        return callback();
      }
    };
    const sendContent = () => {
      if (aborted()) {
        return;
      }
      if (!this.content) {
        return setImmediate(finalize);
      }
      const createStream = () => {
        if (aborted()) {
          return;
        }
        const contentError = this._takeStreamContent(this.content);
        if (contentError) {
          return callback(contentError);
        }
        const localStream = this._getStream(this.content);
        if (["quoted-printable", "base64"].includes(transferEncoding)) {
          const contentStream = transferEncoding === "base64" ? new Encoder(options) : (
            // outside of text a lone CR or LF is data, encoding it keeps it from being
            // turned into a line break by a newline transform or the receiving side
            new Encoder2(Object.assign({}, options, { binary: !/^text\//i.test(this.contentType || "") }))
          );
          readInto(localStream, contentStream);
          contentStream.pipe(outputStream, {
            end: false
          });
          (0, import_node_stream8.pipeline)(localStream, contentStream, (err) => err && callback(err));
          (0, import_node_stream8.finished)(contentStream, { writable: false }, (err) => err ? callback(err) : finalize());
        } else {
          readInto(localStream);
          localStream.pipe(outputStream, {
            end: false
          });
          (0, import_node_stream8.finished)(localStream, { writable: false }, (err) => err ? callback(err) : finalize());
        }
      };
      if (this.content._resolve) {
        const sourceStream = this._getStream(this.content);
        readInto(sourceStream);
        resolveStream(sourceStream, (err, value) => {
          if (err) {
            return callback(err);
          }
          if (returned) {
            return;
          }
          this.content._resolve = false;
          this.content._resolvedValue = value;
          setImmediate(createStream);
        });
      } else {
        setImmediate(createStream);
      }
    };
    if (this._raw) {
      setImmediate(() => {
        if (aborted()) {
          return;
        }
        const rawError = this._takeStreamContent(this._raw);
        if (rawError) {
          return callback(rawError);
        }
        const raw = this._getStream(this._raw);
        readInto(raw);
        raw.pipe(outputStream, {
          end: false
        });
        (0, import_node_stream8.finished)(raw, { writable: false }, (err) => err ? callback(err) : finalize());
      });
    } else {
      outputStream.write(this.buildHeaders() + "\r\n\r\n");
      setImmediate(sendContent);
    }
  }
  /**
   * Sets envelope to be used instead of the generated one
   *
   * @return SMTP envelope in the form of {from: 'from@example.com', to: ['to@example.com']}
   */
  setEnvelope(envelope) {
    let list;
    this._envelope = {
      from: false,
      to: []
    };
    if (envelope.from) {
      list = [];
      this._convertAddresses(this._parseEnvelopeAddresses(envelope.from), list);
      list = list.filter((address) => address && address.address);
      if (list.length && list[0]) {
        this._envelope.from = list[0].address;
      }
    }
    const seenRecipients = /* @__PURE__ */ new Set();
    const recipients = [];
    ["to", "cc", "bcc"].forEach((key) => {
      if (envelope[key]) {
        this._convertAddresses(this._parseEnvelopeAddresses(envelope[key]), recipients, seenRecipients);
      }
    });
    this._envelope.to = recipients.map((to) => to.address).filter((address) => address);
    const standardFields = ["to", "cc", "bcc", "from"];
    copyOwnKeys(this._envelope, envelope, (key) => standardFields.includes(key));
    return this;
  }
  /**
   * Generates and returns an object with parsed address fields
   *
   * @return Address object
   */
  getAddresses() {
    const addresses = {};
    const seenByKey = /* @__PURE__ */ new Map();
    this._headers.forEach((header) => {
      const key = header.key.toLowerCase();
      if (["from", "sender", "reply-to", "to", "cc", "bcc"].includes(key)) {
        if (!Array.isArray(addresses[key])) {
          addresses[key] = [];
          seenByKey.set(key, /* @__PURE__ */ new Set());
        }
        this._convertAddresses(this._parseAddresses(header.value), addresses[key], seenByKey.get(key));
      }
    });
    return addresses;
  }
  /**
   * Generates and returns SMTP envelope with the sender address and a list of recipients addresses
   *
   * @return SMTP envelope in the form of {from: 'from@example.com', to: ['to@example.com']}
   */
  getEnvelope() {
    if (this._envelope) {
      return this._envelope;
    }
    const envelope = {
      from: false,
      to: []
    };
    const seenRecipients = /* @__PURE__ */ new Set();
    const recipients = [];
    this._headers.forEach((header) => {
      const list = [];
      if (header.key === "From" || !envelope.from && ["Reply-To", "Sender"].includes(header.key)) {
        this._convertAddresses(this._parseAddresses(header.value), list);
        if (list.length && list[0]) {
          envelope.from = list[0].address;
        }
      } else if (["To", "Cc", "Bcc"].includes(header.key)) {
        this._convertAddresses(this._parseAddresses(header.value), recipients, seenRecipients);
      }
    });
    envelope.to = recipients.map((to) => to.address);
    return envelope;
  }
  /**
   * Returns Message-Id value. If it does not exist, then creates one
   *
   * @return Message-Id value
   */
  messageId() {
    let messageId = this.getHeader("Message-ID");
    if (!messageId) {
      messageId = this._generateMessageId();
      this.setHeader("Message-ID", messageId);
    }
    return messageId;
  }
  /**
   * Sets pregenerated content that will be used as the output of this node
   *
   * @param raw Raw MIME contents
   */
  setRaw(raw) {
    this._raw = raw;
    if (this._raw && typeof this._raw.pipe === "function") {
      recordStreamErrors(this._raw);
    }
    return this;
  }
  /////// PRIVATE METHODS
  /**
   * Checks an access policy flag for this node and every node above it. The flags are set
   * from the options the node was built with, and createChild only ever sees the options
   * the caller passed, so a child of a closed tree starts out open. Reading the answer off
   * the parent chain keeps it right whatever order the tree was assembled in.
   *
   * @param flag Either 'disableFileAccess' or 'disableUrlAccess'
   * @return true if this node or an ancestor closed that access
   * @internal
   */
  _accessDisabled(flag) {
    let node = this;
    while (node) {
      if (node[flag]) {
        return true;
      }
      node = node.parentNode;
    }
    return false;
  }
  /**
   * Destroys the content streams of this node and of every node below it
   *
   * @internal
   */
  _destroyContentStreams() {
    destroyStream(this.content);
    destroyStream(this._raw);
    for (const child of this.childNodes) {
      child._destroyContentStreams();
    }
  }
  /**
   * Checks that a content value can still be read before the node streams it. A stream is
   * refused once it errored, ended or was destroyed: piping it would either never finish or
   * produce an empty body without any error
   *
   * @param content Node content or raw value
   * @returns The error to stop with, or null when the content can be read
   * @internal
   */
  _takeStreamContent(content) {
    if (Object.prototype.toString.call(content) === "[object Error]") {
      return content;
    }
    if (!content || typeof content.pipe !== "function" || content._resolvedValue) {
      return null;
    }
    return unreadableStreamError(content);
  }
  /**
   * Detects and returns handle to a stream related with the content.
   *
   * @param content Node content
   * @returns Stream object
   * @internal
   */
  _getStream(content) {
    let contentStream;
    if (content._resolvedValue) {
      contentStream = new import_node_stream8.PassThrough();
      setImmediate(() => {
        try {
          contentStream.end(content._resolvedValue);
        } catch (_err) {
          contentStream.emit("error", _err);
        }
      });
      return contentStream;
    }
    if (typeof content.pipe === "function") {
      return content;
    }
    if (content && typeof content.path === "string" && !content.href) {
      if (this._accessDisabled("disableFileAccess")) {
        contentStream = new import_node_stream8.PassThrough();
        setImmediate(() => {
          const err = new Error("File access rejected for " + content.path);
          err.code = EFILEACCESS;
          contentStream.emit("error", err);
        });
        return contentStream;
      }
      return import_node_fs2.default.createReadStream(content.path);
    }
    if (content && typeof content.href === "string") {
      if (this._accessDisabled("disableUrlAccess")) {
        contentStream = new import_node_stream8.PassThrough();
        setImmediate(() => {
          const err = new Error("Url access rejected for " + content.href);
          err.code = EURLACCESS;
          contentStream.emit("error", err);
        });
        return contentStream;
      }
      return fetch_default(content.href, { headers: content.httpHeaders, tls: content.tls });
    }
    contentStream = new import_node_stream8.PassThrough();
    setImmediate(() => {
      try {
        contentStream.end(content || "");
      } catch (_err) {
        contentStream.emit("error", _err);
      }
    });
    return contentStream;
  }
  /**
   * Parses addresses. Takes in a single address or an array or an
   * array of address arrays (eg. To: [[first group], [second group],...])
   *
   * @param addresses Addresses to be parsed
   * @return An array of address objects
   * @internal
   */
  _parseAddresses(addresses) {
    const flattened = [];
    const seen = /* @__PURE__ */ new WeakSet();
    const stack = [];
    const enter = (list) => {
      if (!seen.has(list)) {
        seen.add(list);
        stack.push({ list, pos: 0 });
      }
    };
    enter(Array.isArray(addresses) ? addresses : [addresses]);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (frame.pos >= frame.list.length) {
        stack.pop();
        continue;
      }
      const address = frame.list[frame.pos++];
      if (Array.isArray(address)) {
        enter(address);
        continue;
      }
      if (address && address.address) {
        const normalized2 = this._normalizeAddress(address.address);
        if (normalized2 === address.address && typeof address.name === "string") {
          flattened.push(address);
          continue;
        }
        const copy = copyOwnKeys({}, address);
        copy.address = normalized2;
        copy.name = address.name || "";
        flattened.push(copy);
        continue;
      }
      const parsed = this._normalizeParsedAddresses(addressparser_default(address));
      for (let i = 0; i < parsed.length; i++) {
        flattened.push(parsed[i]);
      }
    }
    return flattened;
  }
  /**
   * Normalizes the addresses of a freshly parsed address list, groups included.
   *
   * Everything this method returns carries a normalized address, whether it arrived as an
   * object or was parsed out of a header value. Without this the two shapes disagree, and
   * a consumer reading the parsed form back is handed the ambiguous
   * 'user@evil.com@good.com' that the header and the envelope no longer carry.
   *
   * @param parsed An array of address objects, as returned by addressparser
   * @return The same array, with every address normalized
   * @internal
   */
  _normalizeParsedAddresses(parsed) {
    parsed.forEach((entry) => {
      if (entry.address) {
        entry.address = this._normalizeAddress(entry.address);
      } else if (entry.group) {
        this._normalizeParsedAddresses(entry.group);
      }
    });
    return parsed;
  }
  /**
   * Parses the addresses of an explicitly set envelope.
   *
   * An envelope value is an addr-spec and never a display name, so a bare local username
   * such as 'root' is the address here. Header parsing has to read the same value as a
   * display name, as a value with no '@' in it can not be an addr-spec in a header.
   *
   * @param addresses Addresses to be parsed
   * @return An array of address objects
   * @internal
   */
  _parseEnvelopeAddresses(addresses) {
    return this._parseAddresses(addresses).map((entry) => {
      if (entry.address || entry.group || !entry.name || /[\s@]/.test(entry.name)) {
        return entry;
      }
      return { address: this._normalizeAddress(entry.name), name: "" };
    });
  }
  /**
   * Normalizes a header key, uses Camel-Case form, except for uppercase MIME-
   *
   * @param key Key to be normalized
   * @return key in Camel-Case form
   * @internal
   */
  _normalizeHeaderKey(key) {
    key = (key || "").toString().replace(/[\s\x00-\x20\x7f:]/g, "").toLowerCase().replace(/^X-SMTPAPI$|^(MIME|DKIM|ARC|BIMI)\b|^[a-z]|-(SPF|FBL|ID|MD5)$|-[a-z]/gi, (c) => c.toUpperCase()).replace(/^Content-Features$/i, "Content-features");
    return key;
  }
  /**
   * Checks if the content type is multipart and defines boundary if needed.
   * Doesn't return anything, modifies object argument instead.
   *
   * @param structured Parsed header value for 'Content-Type' key
   * @internal
   */
  _handleContentType(structured) {
    this.contentType = structured.value.trim().toLowerCase();
    this.multipart = /^multipart\//i.test(this.contentType) ? this.contentType.substr(this.contentType.indexOf("/") + 1) : false;
    if (this.multipart) {
      const declared = _stripBoundaryControls(structured.params.boundary || this.boundary || "");
      this.boundary = structured.params.boundary = declared || _stripBoundaryControls(this._generateBoundary());
    } else {
      this.boundary = false;
    }
  }
  /**
   * Generates a multipart boundary value
   *
   * @return boundary value
   * @internal
   */
  _generateBoundary() {
    return _stripBoundaryControls(this.rootNode.boundaryPrefix + "-" + this.rootNode.baseBoundary) + "-Part_" + this._nodeId;
  }
  /**
   * Encodes a header value for use in the generated rfc2822 email.
   *
   * @param key Header key
   * @param value Header value
   * @internal
   */
  _encodeHeaderValue(key, value) {
    key = this._normalizeHeaderKey(key);
    switch (key) {
      // Structured headers
      case "From":
      case "Sender":
      case "To":
      case "Cc":
      case "Bcc":
      case "Reply-To":
        return this._convertAddresses(this._parseAddresses(value));
      // values enclosed in <>
      case "Message-ID":
      case "In-Reply-To":
      case "Content-Id":
        value = (value || "").toString().replace(/\r?\n|\r/g, " ").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
        if (value.charAt(0) !== "<") {
          value = "<" + value;
        }
        if (value.charAt(value.length - 1) !== ">") {
          value = value + ">";
        }
        return value;
      // space separated list of values enclosed in <>
      case "References":
        value = [].concat.apply([], [].concat(value || "").map((elm) => {
          elm = (elm || "").toString().replace(/\r?\n|\r/g, " ").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").trim();
          return elm.replace(/<[^>]*>/g, (str) => str.replace(/\s/g, "")).split(/\s+/);
        })).map((elm) => {
          if (elm.charAt(0) !== "<") {
            elm = "<" + elm;
          }
          if (elm.charAt(elm.length - 1) !== ">") {
            elm = elm + ">";
          }
          return elm;
        });
        return value.join(" ").trim();
      case "Date":
        if (Object.prototype.toString.call(value) === "[object Date]") {
          return value.toUTCString().replace(/GMT/, "+0000");
        }
        value = (value || "").toString().replace(/\r?\n|\r/g, " ");
        return this._encodeHeaderText(value);
      case "Content-Type":
      case "Content-Disposition":
        return (value || "").toString().replace(/\r?\n|\r/g, " ");
      default:
        value = (value || "").toString().replace(/\r?\n|\r/g, " ");
        return this._encodeHeaderText(value);
    }
  }
  /**
   * Rebuilds address object using punycode and other adjustments
   *
   * @param addresses An array of address objects
   * @param [uniqueList] An array to be populated with addresses
   * @param [seenAddresses] Addresses already added to uniqueList, shared with recursive calls to keep deduplication linear
   * @return address string
   * @internal
   */
  _convertAddresses(addresses, uniqueList, seenAddresses) {
    const values = [];
    uniqueList = uniqueList || [];
    if (!seenAddresses) {
      seenAddresses = /* @__PURE__ */ new Set();
      for (let i = 0; i < uniqueList.length; i++) {
        seenAddresses.add(uniqueList[i].address);
      }
    }
    [].concat(addresses || []).forEach((address) => {
      if (address.address) {
        address.address = this._normalizeAddress(address.address);
        if (!address.name) {
          values.push(PLAIN_ADDRESS.test(address.address) ? address.address : `<${address.address}>`);
        } else {
          values.push(`${this._encodeAddressName(address.name)} <${address.address}>`);
        }
        if (!seenAddresses.has(address.address)) {
          seenAddresses.add(address.address);
          uniqueList.push(address);
        }
      } else if (address.group) {
        const groupListAddresses = (address.group.length ? this._convertAddresses(address.group, uniqueList, seenAddresses) : "").trim();
        values.push(`${this._encodeAddressName(address.name)}:${groupListAddresses};`);
      }
    });
    return values.join(", ");
  }
  /**
   * Normalizes an email address
   *
   * @param address An array of address objects
   * @return address string
   * @internal
   */
  _normalizeAddress(address) {
    address = (address || "").toString().replace(/[\x00-\x1F\x7F<>]+/g, " ").trim();
    if (!address) {
      return address;
    }
    const lastAt = address.lastIndexOf("@");
    if (lastAt < 0) {
      return this._normalizeLocalPart(address);
    }
    const user = address.substr(0, lastAt);
    const domain = address.substr(lastAt + 1);
    let encodedDomain = domain;
    const smtputf8 = /[\x80-\uFFFF]/.test(user);
    try {
      encodedDomain = normalizeDomain(domain.toLowerCase(), smtputf8);
    } catch (_err) {
    }
    return `${this._normalizeLocalPart(user)}@${encodedDomain}`;
  }
  /**
   * Normalizes the local part of an address into a form that can be emitted as is.
   *
   * A local part is either a dot-atom or a quoted-string, anything else is not a valid
   * addr-spec. The quotes of a quoted local part get lost along the way, and a bare
   * 'user@evil.com@good.com' leaves it to the receiver which '@' splits the domain off,
   * while the split here is always at the last one. So whatever is not already one of
   * the two valid forms goes back out as a quoted-string.
   *
   * @param user Local part of an address
   * @return Local part as a dot-atom or as a quoted-string
   * @internal
   */
  _normalizeLocalPart(user) {
    if (DOT_ATOM.test(user) || QUOTED_STRING.test(user)) {
      return user;
    }
    return quoteString(user);
  }
  /**
   * If needed, mime encodes the name part
   *
   * @param name Name part of an address
   * @returns Mime word encoded string if needed
   * @internal
   */
  _encodeAddressName(name2) {
    if (!/^[\w ]*$/.test(name2)) {
      if (/^[\x20-\x7e]*$/.test(name2)) {
        return quoteString(name2);
      } else {
        return encodeWord(name2, this._getTextEncoding(name2), 52);
      }
    }
    return name2;
  }
  /**
   * Encodes an unstructured header value. Such a value can only carry VCHAR and WSP, so a
   * control char or DEL has to be forced into the mime encoded word that a non-ascii value
   * would get anyway. HT stays as it is, it is valid folding whitespace here.
   *
   * @param value Header value to encode
   * @returns Mime word encoded string if needed
   * @internal
   */
  _encodeHeaderText(value) {
    return /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value) ? encodeWord(value, this._getTextEncoding(value), 52) : (
      // encodeWords only encodes if needed, otherwise the original string is returned
      this._encodeWords(value)
    );
  }
  /**
   * If needed, mime encodes the name part
   *
   * @param value Name part of an address
   * @returns Mime word encoded string if needed
   * @internal
   */
  _encodeWords(value) {
    return encodeWords(value, this._getTextEncoding(value), 52, true);
  }
  /**
   * Detects best mime encoding for a text value
   *
   * @param value Value to check for
   * @return either 'Q' or 'B'
   * @internal
   */
  _getTextEncoding(value) {
    value = (value || "").toString();
    if (this.textEncoding) {
      return this.textEncoding;
    }
    let nonLatinLen = 0;
    let latinLen = 0;
    for (let i = 0, len = value.length; i < len; i++) {
      const code = value.charCodeAt(i);
      if (code >= 0 && code <= 8 || code === 11 || code === 12 || code >= 14 && code <= 31 || code >= 128) {
        nonLatinLen++;
      } else if (code >= 65 && code <= 90 || code >= 97 && code <= 122) {
        latinLen++;
      }
    }
    return nonLatinLen < latinLen ? "Q" : "B";
  }
  /**
   * Generates a message id
   *
   * @return Random Message-ID value
   * @internal
   */
  _generateMessageId() {
    return "<" + [2, 2, 2, 6].reduce(
      // crux to generate UUID-like random strings
      (prev, len) => prev + "-" + import_node_crypto.default.randomBytes(len).toString("hex"),
      import_node_crypto.default.randomBytes(4).toString("hex")
    ) + "@" + // try to use the domain of the FROM address or fallback to server hostname
    (this.getEnvelope().from || this.hostname || "localhost").split("@").pop() + ">";
  }
};
var mime_node_default = MimeNode;

// node_modules/nodemailer/dist/esm/mail-composer/index.js
function isContentObject(value) {
  const content = value;
  return typeof value === "object" && !!(content.content || content.path || content.href || content.raw);
}
var MailComposer = class {
  constructor(mail) {
    this.mail = mail || {};
    this.message = false;
  }
  /**
   * Builds MimeNode instance
   */
  compile() {
    this._alternatives = this.getAlternatives();
    this._htmlNode = this._alternatives.filter((alternative) => /^text\/html\b/i.test(alternative.contentType)).pop();
    this._attachments = this.getAttachments(!!this._htmlNode);
    this._useRelated = !!(this._htmlNode && this._attachments.related.length);
    this._useAlternative = this._alternatives.length > 1;
    this._useMixed = this._attachments.attached.length > 1 || this._alternatives.length && this._attachments.attached.length === 1;
    if (this.mail.raw) {
      this.message = new mime_node_default("message/rfc822", {
        newline: this.mail.newline,
        disableUrlAccess: this.mail.disableUrlAccess,
        disableFileAccess: this.mail.disableFileAccess
      }).setRaw(this.mail.raw);
    } else if (this._useMixed) {
      this.message = this._createMixed();
    } else if (this._useAlternative) {
      this.message = this._createAlternative();
    } else if (this._useRelated) {
      this.message = this._createRelated();
    } else {
      this.message = this._createContentNode(false, [].concat(this._alternatives || []).concat(this._attachments.attached || []).shift() || {
        contentType: "text/plain",
        content: ""
      });
    }
    if (this.mail.headers) {
      this.message.addHeader(this.mail.headers);
    }
    ["from", "sender", "to", "cc", "bcc", "reply-to", "in-reply-to", "references", "subject", "message-id", "date"].forEach((header) => {
      const key = header.replace(/-(\w)/g, (o, c) => c.toUpperCase());
      if (this.mail[key]) {
        this.message.setHeader(header, this.mail[key]);
      }
    });
    if (this.mail.envelope) {
      this.message.setEnvelope(this.mail.envelope);
    }
    this.message.messageId();
    return this.message;
  }
  /**
   * List all attachments. Resulting attachment objects can be used as input for MimeNode nodes
   *
   * @param findRelated If true separate related attachments from attached ones
   * @returns An object of arrays (`related` and `attached`)
   */
  getAttachments(findRelated) {
    let eventObject;
    const attachments = [].concat(this.mail.attachments || []).map((attachment, i) => {
      if (/^data:/i.test(attachment.path || attachment.href)) {
        attachment = this._processDataUrl(attachment);
      }
      const contentType = attachment.contentType || detectMimeType2(attachment.filename || attachment.path || attachment.href || "bin");
      const isImage = /^image\//i.test(contentType);
      const isMessageNode = /^message\//i.test(contentType);
      const contentDisposition = attachment.contentDisposition || (isMessageNode || isImage && attachment.cid ? "inline" : "attachment");
      let contentTransferEncoding;
      if ("contentTransferEncoding" in attachment) {
        contentTransferEncoding = attachment.contentTransferEncoding;
      } else if (isMessageNode) {
        contentTransferEncoding = "8bit";
      } else {
        contentTransferEncoding = "base64";
      }
      const data = {
        contentType,
        contentDisposition,
        contentTransferEncoding
      };
      if (attachment.filename) {
        data.filename = attachment.filename;
      } else if (!isMessageNode && attachment.filename !== false) {
        data.filename = (attachment.path || attachment.href || "").split(/[/\\]/).pop().split("?").shift() || "attachment-" + (i + 1);
        if (data.filename.indexOf(".") < 0) {
          data.filename += "." + detectExtension2(data.contentType);
        }
      }
      if (/^https?:\/\//i.test(attachment.path)) {
        attachment.href = attachment.path;
        attachment.path = void 0;
      }
      if (attachment.cid) {
        data.cid = attachment.cid;
      }
      if (attachment.raw) {
        data.raw = attachment.raw;
      } else if (attachment.path) {
        data.content = {
          path: attachment.path
        };
      } else if (attachment.href) {
        data.content = {
          href: attachment.href,
          httpHeaders: attachment.httpHeaders,
          tls: attachment.tls
        };
      } else {
        data.content = attachment.content || "";
      }
      if (attachment.encoding) {
        data.encoding = attachment.encoding;
      }
      if (attachment.headers) {
        data.headers = attachment.headers;
      }
      return data;
    });
    if (this.mail.icalEvent) {
      eventObject = Object.assign({}, this._getIcalEvent());
      eventObject.contentType = "application/ics";
      if (!eventObject.headers) {
        eventObject.headers = {};
      }
      eventObject.filename = eventObject.filename || "invite.ics";
      eventObject.headers["Content-Disposition"] = "attachment";
      eventObject.headers["Content-Transfer-Encoding"] = "base64";
    }
    if (!findRelated) {
      return {
        attached: attachments.concat(eventObject || []),
        related: []
      };
    }
    return {
      attached: attachments.filter((attachment) => !attachment.cid).concat(eventObject || []),
      related: attachments.filter((attachment) => !!attachment.cid)
    };
  }
  /**
   * Returns the icalEvent value with `path`/`href`/data uri input normalized into
   * a `content` entry, the same way as for regular attachments. The same event is
   * included twice (as a text/calendar alternative and as an application/ics
   * attachment), so the shared content object is marked to be resolved just once
   * and the buffered result is reused by the second node.
   *
   * @returns Normalized icalEvent data
   * @internal
   */
  _getIcalEvent() {
    if (!this._icalEvent) {
      let icalEvent;
      if (isContentObject(this.mail.icalEvent)) {
        icalEvent = copyOwnKeys({}, this.mail.icalEvent);
      } else {
        icalEvent = {
          content: this.mail.icalEvent
        };
      }
      if (/^data:/i.test(icalEvent.path || icalEvent.href)) {
        icalEvent = this._processDataUrl(icalEvent);
      }
      if (/^https?:\/\//i.test(icalEvent.path)) {
        icalEvent.href = icalEvent.path;
        icalEvent.path = void 0;
      }
      if (!icalEvent.raw) {
        if (icalEvent.path) {
          icalEvent.content = {
            path: icalEvent.path
          };
          icalEvent.path = void 0;
        } else if (icalEvent.href) {
          icalEvent.content = {
            href: icalEvent.href,
            httpHeaders: icalEvent.httpHeaders,
            tls: icalEvent.tls
          };
          icalEvent.href = void 0;
        }
      }
      if (icalEvent.content && typeof icalEvent.content === "object") {
        icalEvent.content._resolve = true;
      }
      this._icalEvent = icalEvent;
    }
    return this._icalEvent;
  }
  /**
   * List alternatives. Resulting objects can be used as input for MimeNode nodes
   *
   * @returns An array of alternative elements. Includes the `text` and `html` values as well
   */
  getAlternatives() {
    const alternatives = [];
    let text, html, watchHtml, amp, eventObject;
    if (this.mail.text) {
      if (isContentObject(this.mail.text)) {
        text = this.mail.text;
      } else {
        text = {
          content: this.mail.text
        };
      }
      text.contentType = "text/plain; charset=utf-8";
    }
    if (this.mail.watchHtml) {
      if (isContentObject(this.mail.watchHtml)) {
        watchHtml = this.mail.watchHtml;
      } else {
        watchHtml = {
          content: this.mail.watchHtml
        };
      }
      watchHtml.contentType = "text/watch-html; charset=utf-8";
    }
    if (this.mail.amp) {
      if (isContentObject(this.mail.amp)) {
        amp = this.mail.amp;
      } else {
        amp = {
          content: this.mail.amp
        };
      }
      amp.contentType = "text/x-amp-html; charset=utf-8";
    }
    if (this.mail.icalEvent) {
      eventObject = Object.assign({}, this._getIcalEvent());
      eventObject.filename = false;
      eventObject.contentType = "text/calendar; charset=utf-8; method=" + (eventObject.method || "PUBLISH").toString().trim().toUpperCase();
      if (!eventObject.headers) {
        eventObject.headers = {};
      }
    }
    if (this.mail.html) {
      if (isContentObject(this.mail.html)) {
        html = this.mail.html;
      } else {
        html = {
          content: this.mail.html
        };
      }
      html.contentType = "text/html; charset=utf-8";
    }
    [].concat(text || []).concat(watchHtml || []).concat(amp || []).concat(html || []).concat(eventObject || []).concat(this.mail.alternatives || []).forEach((alternative) => {
      if (/^data:/i.test(alternative.path || alternative.href)) {
        alternative = this._processDataUrl(alternative);
      }
      const data = {
        contentType: alternative.contentType || detectMimeType2(alternative.filename || alternative.path || alternative.href || "txt"),
        contentTransferEncoding: alternative.contentTransferEncoding
      };
      if (alternative.filename) {
        data.filename = alternative.filename;
      }
      if (/^https?:\/\//i.test(alternative.path)) {
        alternative.href = alternative.path;
        alternative.path = void 0;
      }
      if (alternative.raw) {
        data.raw = alternative.raw;
      } else if (alternative.path) {
        data.content = {
          path: alternative.path
        };
      } else if (alternative.href) {
        data.content = {
          href: alternative.href,
          httpHeaders: alternative.httpHeaders,
          tls: alternative.tls
        };
      } else {
        data.content = alternative.content || "";
      }
      if (alternative.encoding) {
        data.encoding = alternative.encoding;
      }
      if (alternative.headers) {
        data.headers = alternative.headers;
      }
      alternatives.push(data);
    });
    return alternatives;
  }
  /**
   * Builds multipart/mixed node. It should always contain different type of elements on the same level
   * eg. text + attachments
   *
   * @param parentNode Parent for this note. If it does not exist, a root node is created
   * @returns MimeNode node element
   * @internal
   */
  _createMixed(parentNode) {
    const node = parentNode ? parentNode.createChild("multipart/mixed", {
      disableUrlAccess: this.mail.disableUrlAccess,
      disableFileAccess: this.mail.disableFileAccess,
      normalizeHeaderKey: this.mail.normalizeHeaderKey,
      newline: this.mail.newline
    }) : new mime_node_default("multipart/mixed", {
      baseBoundary: this.mail.baseBoundary,
      textEncoding: this.mail.textEncoding,
      boundaryPrefix: this.mail.boundaryPrefix,
      disableUrlAccess: this.mail.disableUrlAccess,
      disableFileAccess: this.mail.disableFileAccess,
      normalizeHeaderKey: this.mail.normalizeHeaderKey,
      newline: this.mail.newline
    });
    if (this._useAlternative) {
      this._createAlternative(node);
    } else if (this._useRelated) {
      this._createRelated(node);
    }
    [].concat(!this._useAlternative && this._alternatives || []).concat(this._attachments.attached || []).forEach((element) => {
      if (!this._useRelated || element !== this._htmlNode) {
        this._createContentNode(node, element);
      }
    });
    return node;
  }
  /**
   * Builds multipart/alternative node. It should always contain same type of elements on the same level
   * eg. text + html view of the same data
   *
   * @param parentNode Parent for this note. If it does not exist, a root node is created
   * @returns MimeNode node element
   * @internal
   */
  _createAlternative(parentNode) {
    const node = parentNode ? parentNode.createChild("multipart/alternative", {
      disableUrlAccess: this.mail.disableUrlAccess,
      disableFileAccess: this.mail.disableFileAccess,
      normalizeHeaderKey: this.mail.normalizeHeaderKey,
      newline: this.mail.newline
    }) : new mime_node_default("multipart/alternative", {
      baseBoundary: this.mail.baseBoundary,
      textEncoding: this.mail.textEncoding,
      boundaryPrefix: this.mail.boundaryPrefix,
      disableUrlAccess: this.mail.disableUrlAccess,
      disableFileAccess: this.mail.disableFileAccess,
      normalizeHeaderKey: this.mail.normalizeHeaderKey,
      newline: this.mail.newline
    });
    this._alternatives.forEach((alternative) => {
      if (this._useRelated && this._htmlNode === alternative) {
        this._createRelated(node);
      } else {
        this._createContentNode(node, alternative);
      }
    });
    return node;
  }
  /**
   * Builds multipart/related node. It should always contain html node with related attachments
   *
   * @param parentNode Parent for this note. If it does not exist, a root node is created
   * @returns MimeNode node element
   * @internal
   */
  _createRelated(parentNode) {
    const node = parentNode ? parentNode.createChild('multipart/related; type="text/html"', {
      disableUrlAccess: this.mail.disableUrlAccess,
      disableFileAccess: this.mail.disableFileAccess,
      normalizeHeaderKey: this.mail.normalizeHeaderKey,
      newline: this.mail.newline
    }) : new mime_node_default('multipart/related; type="text/html"', {
      baseBoundary: this.mail.baseBoundary,
      textEncoding: this.mail.textEncoding,
      boundaryPrefix: this.mail.boundaryPrefix,
      disableUrlAccess: this.mail.disableUrlAccess,
      disableFileAccess: this.mail.disableFileAccess,
      normalizeHeaderKey: this.mail.normalizeHeaderKey,
      newline: this.mail.newline
    });
    this._createContentNode(node, this._htmlNode);
    this._attachments.related.forEach((alternative) => this._createContentNode(node, alternative));
    return node;
  }
  /**
   * Creates a regular node with contents
   *
   * @param parentNode Parent for this note. If it does not exist, a root node is created
   * @param element Node data
   * @returns MimeNode node element
   * @internal
   */
  _createContentNode(parentNode, element) {
    element = element || {};
    element.content = element.content || "";
    const encoding = (element.encoding || "utf8").toString().toLowerCase().replace(/[-_\s]/g, "");
    const node = parentNode ? parentNode.createChild(element.contentType, {
      filename: element.filename,
      textEncoding: this.mail.textEncoding,
      disableUrlAccess: this.mail.disableUrlAccess,
      disableFileAccess: this.mail.disableFileAccess,
      normalizeHeaderKey: this.mail.normalizeHeaderKey,
      newline: this.mail.newline
    }) : new mime_node_default(element.contentType, {
      filename: element.filename,
      baseBoundary: this.mail.baseBoundary,
      textEncoding: this.mail.textEncoding,
      boundaryPrefix: this.mail.boundaryPrefix,
      disableUrlAccess: this.mail.disableUrlAccess,
      disableFileAccess: this.mail.disableFileAccess,
      normalizeHeaderKey: this.mail.normalizeHeaderKey,
      newline: this.mail.newline
    });
    if (element.headers) {
      node.addHeader(element.headers);
    }
    if (element.cid) {
      node.setHeader("Content-Id", "<" + element.cid.replace(/[<>]/g, "") + ">");
    }
    if (element.contentTransferEncoding) {
      node.setHeader("Content-Transfer-Encoding", element.contentTransferEncoding);
    } else if (this.mail.encoding && /^text\//i.test(element.contentType)) {
      node.setHeader("Content-Transfer-Encoding", this.mail.encoding);
    }
    if (!/^text\//i.test(element.contentType) || element.contentDisposition) {
      node.setHeader("Content-Disposition", element.contentDisposition || (element.cid && /^image\//i.test(element.contentType) ? "inline" : "attachment"));
    }
    if (typeof element.content === "string" && !["utf8", "usascii", "ascii"].includes(encoding)) {
      element.content = Buffer.from(element.content, encoding);
    }
    if (element.raw) {
      node.setRaw(element.raw);
    } else {
      node.setContent(element.content);
    }
    return node;
  }
  /**
   * Parses data uri and converts it to a Buffer
   *
   * @param element Content element
   * @return Parsed element
   * @internal
   */
  _processDataUrl(element) {
    const dataUrl = element.path || element.href;
    if (!dataUrl || typeof dataUrl !== "string") {
      return element;
    }
    if (!dataUrl.startsWith("data:")) {
      return element;
    }
    if (dataUrl.length > 52428800) {
      let detectedType = "application/octet-stream";
      const commaPos = dataUrl.indexOf(",");
      if (commaPos > 0 && commaPos < 200) {
        const header = dataUrl.substring(5, commaPos);
        const parts = header.split(";");
        if (parts[0] && parts[0].includes("/")) {
          detectedType = parts[0].trim();
        }
      }
      return Object.assign(copyOwnKeys({}, element), {
        path: false,
        href: false,
        content: Buffer.alloc(0),
        contentType: element.contentType || detectedType
      });
    }
    let parsedDataUri;
    try {
      parsedDataUri = parseDataURI(dataUrl);
    } catch (_err) {
      return element;
    }
    if (!parsedDataUri) {
      return element;
    }
    element.content = parsedDataUri.data;
    element.contentType = element.contentType || parsedDataUri.contentType;
    if ("path" in element) {
      element.path = false;
    }
    if ("href" in element) {
      element.href = false;
    }
    return element;
  }
};
var mail_composer_default = MailComposer;

// node_modules/nodemailer/dist/esm/dkim/message-parser.js
var import_node_stream9 = require("node:stream");
function _trimFieldName(str) {
  let start = 0;
  let end = str.length;
  while (start < end && (str.charCodeAt(start) === 32 || str.charCodeAt(start) === 9)) {
    start++;
  }
  while (end > start && (str.charCodeAt(end - 1) === 32 || str.charCodeAt(end - 1) === 9)) {
    end--;
  }
  return str.slice(start, end);
}
var MessageParser = class extends import_node_stream9.Transform {
  constructor(options) {
    super(options);
    this.lastBytes = Buffer.alloc(4);
    this.headersParsed = false;
    this.headerBytes = 0;
    this.headerChunks = [];
    this.rawHeaders = false;
    this.bodySize = 0;
  }
  /**
   * Keeps count of the last 4 bytes in order to detect line breaks on chunk boundaries
   *
   * @param data Next data chunk from the stream
   */
  updateLastBytes(data) {
    const lblen = this.lastBytes.length;
    const nblen = Math.min(data.length, lblen);
    for (let i = 0, len = lblen - nblen; i < len; i++) {
      this.lastBytes[i] = this.lastBytes[i + nblen];
    }
    for (let i = 1; i <= nblen; i++) {
      this.lastBytes[lblen - i] = data[data.length - i];
    }
  }
  /**
   * Finds and removes message headers from the remaining body. We want to keep
   * headers separated until final delivery to be able to modify these
   *
   * @param data Next chunk of data
   * @return Returns true if headers are already found or false otherwise
   */
  checkHeaders(data) {
    if (this.headersParsed) {
      return true;
    }
    const lblen = this.lastBytes.length;
    let headerPos = 0;
    for (let i = 0, len = this.lastBytes.length + data.length; i < len; i++) {
      let chr;
      if (i < lblen) {
        chr = this.lastBytes[i];
      } else {
        chr = data[i - lblen];
      }
      if (chr === 10 && i) {
        const pr1 = i - 1 < lblen ? this.lastBytes[i - 1] : data[i - 1 - lblen];
        const pr2 = i > 1 ? i - 2 < lblen ? this.lastBytes[i - 2] : data[i - 2 - lblen] : false;
        if (pr1 === 10) {
          this.headersParsed = true;
          headerPos = i - lblen + 1;
          this.headerBytes += headerPos;
          break;
        } else if (pr1 === 13 && pr2 === 10) {
          this.headersParsed = true;
          headerPos = i - lblen + 1;
          this.headerBytes += headerPos;
          break;
        }
      }
    }
    if (this.headersParsed) {
      this.headerChunks.push(data.slice(0, headerPos));
      this.rawHeaders = Buffer.concat(this.headerChunks, this.headerBytes);
      this.headerChunks = null;
      this.emit("headers", this.parseHeaders());
      if (data.length > headerPos) {
        const chunk = data.slice(headerPos);
        this.bodySize += chunk.length;
        this.push(chunk);
      }
      return false;
    }
    this.headerBytes += data.length;
    this.headerChunks.push(data);
    this.updateLastBytes(data);
    return false;
  }
  /** @internal */
  _transform(chunk, encoding, callback) {
    if (!chunk || !chunk.length) {
      return callback();
    }
    if (typeof chunk === "string") {
      chunk = Buffer.from(chunk, encoding);
    }
    let headersFound;
    try {
      headersFound = this.checkHeaders(chunk);
    } catch (E) {
      return callback(E);
    }
    if (headersFound) {
      this.bodySize += chunk.length;
      this.push(chunk);
    }
    callback();
  }
  /** @internal */
  _flush(callback) {
    if (this.headerChunks) {
      this.rawHeaders = Buffer.concat(this.headerChunks, this.headerBytes);
      this.headerChunks = null;
      this.emit("headers", this.parseHeaders());
    }
    callback();
  }
  parseHeaders() {
    const rawLines = (this.rawHeaders || Buffer.alloc(0)).toString("binary").split(/\r?\n/);
    const lines = [];
    for (const rawLine of rawLines) {
      if (lines.length && /^[ \t]/.test(rawLine)) {
        lines[lines.length - 1] += "\n" + rawLine;
      } else {
        lines.push(rawLine);
      }
    }
    return lines.filter((line) => /[^ \t\r]/.test(line)).map((line) => ({
      key: _trimFieldName(line.substr(0, line.indexOf(":"))).toLowerCase(),
      line
    }));
  }
};
var message_parser_default = MessageParser;

// node_modules/nodemailer/dist/esm/dkim/relaxed-body.js
var import_node_stream10 = require("node:stream");
var import_node_crypto2 = __toESM(require("node:crypto"), 1);
var CHAR_CR = 13;
var CHAR_LF = 10;
var CHAR_SPACE = 32;
var CHAR_TAB = 9;
var CRLF = Buffer.from("\r\n");
var EMPTY_LINES = Buffer.alloc(4096, CRLF);
var RelaxedBody = class extends import_node_stream10.Transform {
  constructor(options) {
    super();
    options = options || {};
    this.bodyHash = import_node_crypto2.default.createHash(options.hashAlgo || "sha256");
    this.byteLength = 0;
    this.debug = options.debug;
    this._debugBody = options.debug ? [] : false;
    this._lineHasContent = false;
    this._pendingWsp = false;
    this._pendingCr = false;
    this._pendingEmptyLines = 0;
  }
  /** @internal */
  _hashCanonical(data) {
    if (!data.length) {
      return;
    }
    this.bodyHash.update(data);
    if (this._debugBody) {
      this._debugBody.push(Buffer.from(data));
    }
  }
  /** @internal */
  _hashEmptyLines() {
    while (this._pendingEmptyLines > 0) {
      const count = Math.min(this._pendingEmptyLines, EMPTY_LINES.length / 2);
      this._hashCanonical(EMPTY_LINES.subarray(0, count * 2));
      this._pendingEmptyLines -= count;
    }
  }
  /**
   * Writes a content byte, with the space a pending run of whitespace collapses to,
   * into the output buffer and returns the new write position. Kept a method rather
   * than a closure so the write position stays a plain local in the byte loop
   * @internal
   */
  _emitContent(out, outPos, c) {
    if (!this._lineHasContent) {
      if (this._pendingEmptyLines) {
        this._hashCanonical(out.subarray(0, outPos));
        outPos = 0;
        this._hashEmptyLines();
      }
      this._lineHasContent = true;
    }
    if (this._pendingWsp) {
      out[outPos++] = CHAR_SPACE;
      this._pendingWsp = false;
    }
    out[outPos++] = c;
    return outPos;
  }
  updateHash(chunk, final) {
    const out = Buffer.allocUnsafe(chunk.length * 2 + 2);
    let outPos = 0;
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];
      if (c === CHAR_LF) {
        if (this._lineHasContent) {
          out[outPos++] = CHAR_CR;
          out[outPos++] = CHAR_LF;
          this._lineHasContent = false;
        } else {
          this._pendingEmptyLines++;
        }
        this._pendingWsp = false;
        this._pendingCr = false;
        continue;
      }
      if (this._pendingCr) {
        outPos = this._emitContent(out, outPos, CHAR_CR);
        this._pendingCr = false;
      }
      if (c === CHAR_CR) {
        this._pendingCr = true;
      } else if (c === CHAR_SPACE || c === CHAR_TAB) {
        this._pendingWsp = true;
      } else {
        outPos = this._emitContent(out, outPos, c);
      }
    }
    if (final && this._pendingCr) {
      outPos = this._emitContent(out, outPos, CHAR_CR);
      this._pendingCr = false;
    }
    this._hashCanonical(out.subarray(0, outPos));
  }
  /** @internal */
  _transform(chunk, encoding, callback) {
    if (!chunk || !chunk.length) {
      return callback();
    }
    if (typeof chunk === "string") {
      chunk = Buffer.from(chunk, encoding);
    }
    this.updateHash(chunk);
    this.byteLength += chunk.length;
    this.push(chunk);
    callback();
  }
  /** @internal */
  _flush(callback) {
    this.updateHash(Buffer.alloc(0), true);
    if (this._lineHasContent) {
      this._hashCanonical(CRLF);
    }
    this.emit("hash", this.bodyHash.digest("base64"), this.debug ? Buffer.concat(this._debugBody) : false);
    callback();
  }
};
var relaxed_body_default = RelaxedBody;

// node_modules/nodemailer/dist/esm/dkim/sign.js
var import_node_crypto3 = __toESM(require("node:crypto"), 1);
function unsupportedHashAlgoError(hashAlgo) {
  const err = new Error('Unsupported DKIM hash algorithm "' + hashAlgo + '"');
  err.code = ECONFIG;
  return err;
}
function sign(headers, hashAlgo, bodyHash, options) {
  options = options || {};
  const defaultFieldNames = "From:Sender:Reply-To:Subject:Date:Message-ID:To:Cc:MIME-Version:Content-Type:Content-Transfer-Encoding:Content-ID:Content-Description:Resent-Date:Resent-From:Resent-Sender:Resent-To:Resent-Cc:Resent-Message-ID:In-Reply-To:References:List-Id:List-Help:List-Unsubscribe:List-Subscribe:List-Post:List-Owner:List-Archive";
  const fieldNames = options.headerFieldNames || defaultFieldNames;
  const canonicalizedHeaderData = relaxedHeaders(headers, fieldNames, options.skipFields);
  const dkimHeader = generateDKIMHeader(options.domainName, options.keySelector, canonicalizedHeaderData.fieldNames, hashAlgo, bodyHash);
  canonicalizedHeaderData.headers += "dkim-signature:" + relaxedHeaderLine(dkimHeader);
  let signer;
  try {
    signer = import_node_crypto3.default.createSign(("rsa-" + hashAlgo).toUpperCase());
  } catch (_E) {
    throw unsupportedHashAlgoError(hashAlgo);
  }
  signer.update(canonicalizedHeaderData.headers, "latin1");
  let signature;
  try {
    signature = signer.sign(options.privateKey, "base64");
  } catch (_E) {
    return false;
  }
  return dkimHeader + signature.replace(/(^.{73}|.{75}(?!\r?\n|\r))/g, "$&\r\n ").trim();
}
sign.relaxedHeaders = relaxedHeaders;
sign.unsupportedHashAlgoError = unsupportedHashAlgoError;
var sign_default = sign;
function generateDKIMHeader(domainName, keySelector, fieldNames, hashAlgo, bodyHash) {
  const cleanTagValue = (value) => (value || "").toString().replace(/[\x00-\x1f\x7f;=]/g, "");
  const dkim = [
    "v=1",
    "a=rsa-" + hashAlgo,
    "c=relaxed/relaxed",
    "d=" + toASCII(cleanTagValue(domainName)),
    "q=dns/txt",
    "s=" + cleanTagValue(keySelector),
    "bh=" + bodyHash,
    "h=" + cleanTagValue(fieldNames)
  ].join("; ");
  return foldLines("DKIM-Signature: " + dkim, 76) + ";\r\n b=";
}
function relaxedHeaders(headers, fieldNames, skipFields) {
  const includedFields = /* @__PURE__ */ new Set();
  const skip = /* @__PURE__ */ new Set();
  const headerFields = /* @__PURE__ */ new Map();
  (skipFields || "").toLowerCase().split(":").forEach((field) => {
    skip.add(field.trim());
  });
  (fieldNames || "").toLowerCase().split(":").filter((field) => !skip.has(field.trim())).forEach((field) => {
    includedFields.add(field.trim());
  });
  for (let i = headers.length - 1; i >= 0; i--) {
    const line = headers[i];
    if (includedFields.has(line.key) && !headerFields.has(line.key)) {
      headerFields.set(line.key, relaxedHeaderLine(line.line));
    }
  }
  const headersList = [];
  const fields = [];
  includedFields.forEach((field) => {
    if (headerFields.has(field)) {
      fields.push(field);
      headersList.push(field + ":" + headerFields.get(field));
    }
  });
  return {
    headers: headersList.join("\r\n") + "\r\n",
    fieldNames: fields.join(":")
  };
}
function relaxedHeaderLine(line) {
  return line.substr(line.indexOf(":") + 1).replace(/\r?\n/g, "").replace(/[ \t]+/g, " ").replace(/^ | $/g, "");
}

// node_modules/nodemailer/dist/esm/dkim/index.js
var import_node_stream11 = require("node:stream");
var import_node_fs3 = __toESM(require("node:fs"), 1);
var import_node_path2 = __toESM(require("node:path"), 1);
var import_node_crypto4 = __toESM(require("node:crypto"), 1);
var DKIM_ALGO = "sha256";
var MAX_MESSAGE_SIZE = 10 * 1024 * 1024;
var DKIMSigner = class {
  constructor(options, keys, input, output) {
    this.options = options || {};
    this.keys = keys;
    this.cacheTreshold = Number(this.options.cacheTreshold) || MAX_MESSAGE_SIZE;
    this.hashAlgo = this.options.hashAlgo || DKIM_ALGO;
    this.cacheDir = this.options.cacheDir || false;
    this.chunks = [];
    this.chunklen = 0;
    this.readPos = 0;
    this.cachePath = this.cacheDir ? import_node_path2.default.join(this.cacheDir, "message." + Date.now() + "-" + import_node_crypto4.default.randomBytes(14).toString("hex")) : false;
    this.cache = false;
    this.headers = false;
    this.bodyHash = false;
    this.parser = false;
    this.relaxedBody = false;
    this.input = input;
    this.output = output;
    this.output.usingCache = false;
    this.hasErrored = false;
    this.input.on("error", (err) => this.fail(err));
    this.output.once("close", () => {
      if (this.output.writableFinished) {
        return;
      }
      this.hasErrored = true;
      this.input.unpipe();
      this.input.destroy();
      this.cleanup();
    });
  }
  /**
   * Ends the output with an error and releases the cache file
   */
  fail(err) {
    this.hasErrored = true;
    this.cleanup();
    this.output.destroy(err);
  }
  cleanup() {
    if (!this.cache || !this.cachePath) {
      return;
    }
    const cache = this.cache;
    this.cache = false;
    cache.destroy();
    import_node_fs3.default.unlink(this.cachePath, () => false);
  }
  createReadCache() {
    this.cache = import_node_fs3.default.createReadStream(this.cachePath);
    this.cache.once("error", (err) => this.fail(err));
    this.cache.once("close", () => {
      this.cleanup();
    });
    this.cache.pipe(this.output);
  }
  sendNextChunk() {
    while (!this.hasErrored) {
      if (this.readPos >= this.chunks.length) {
        if (!this.cache) {
          this.output.end();
          return;
        }
        return this.createReadCache();
      }
      const chunk = this.chunks[this.readPos++];
      if (this.output.write(chunk) === false) {
        this.output.once("drain", () => {
          this.sendNextChunk();
        });
        return;
      }
    }
  }
  sendSignedOutput() {
    if (this.hasErrored) {
      return;
    }
    let keyPos = 0;
    const signNextKey = () => {
      if (keyPos >= this.keys.length) {
        this.output.write(this.parser.rawHeaders);
        setImmediate(() => this.sendNextChunk());
        return;
      }
      const key = this.keys[keyPos++];
      let dkimField;
      try {
        dkimField = sign_default(this.headers, this.hashAlgo, this.bodyHash, {
          domainName: key.domainName,
          keySelector: key.keySelector,
          privateKey: key.privateKey,
          headerFieldNames: this.options.headerFieldNames,
          skipFields: this.options.skipFields
        });
      } catch (err) {
        this.fail(err);
        return;
      }
      if (dkimField) {
        this.output.write(Buffer.from(dkimField + "\r\n"));
      }
      setImmediate(signNextKey);
    };
    if (this.bodyHash && this.headers) {
      return signNextKey();
    }
    this.output.write(this.parser.rawHeaders);
    this.sendNextChunk();
  }
  createWriteCache() {
    this.output.usingCache = true;
    this.cache = import_node_fs3.default.createWriteStream(this.cachePath, { mode: 384 });
    this.cache.once("error", (err) => {
      this.relaxedBody.unpipe(this.cache);
      this.relaxedBody.on("readable", () => {
        while (this.relaxedBody.read() !== null) {
        }
      });
      this.fail(err);
    });
    this.cache.once("close", () => {
      if (this.hasErrored) {
        return;
      }
      this.sendSignedOutput();
    });
    this.relaxedBody.removeAllListeners("readable");
    this.relaxedBody.pipe(this.cache);
  }
  signStream() {
    this.parser = new message_parser_default();
    this.relaxedBody = new relaxed_body_default({
      hashAlgo: this.hashAlgo
    });
    this.parser.on("headers", (value) => {
      this.headers = value;
    });
    this.relaxedBody.on("hash", (value) => {
      this.bodyHash = value;
    });
    this.relaxedBody.on("readable", () => {
      let chunk;
      if (this.cache) {
        return;
      }
      while ((chunk = this.relaxedBody.read()) !== null) {
        this.chunks.push(chunk);
        this.chunklen += chunk.length;
        if (this.chunklen >= this.cacheTreshold && this.cachePath) {
          return this.createWriteCache();
        }
      }
    });
    this.relaxedBody.on("end", () => {
      if (this.cache) {
        return;
      }
      this.sendSignedOutput();
    });
    this.parser.pipe(this.relaxedBody);
    setImmediate(() => this.input.pipe(this.parser));
  }
};
var DKIM = class {
  constructor(options) {
    this.options = options || {};
    this.keys = [].concat(this.options.keys || {
      domainName: options.domainName,
      keySelector: options.keySelector,
      privateKey: options.privateKey
    });
  }
  sign(input, extraOptions) {
    const output = new import_node_stream11.PassThrough();
    let inputStream = input;
    let writeValue = false;
    if (Buffer.isBuffer(input)) {
      writeValue = input;
      inputStream = new import_node_stream11.PassThrough();
    } else if (typeof input === "string") {
      writeValue = Buffer.from(input);
      inputStream = new import_node_stream11.PassThrough();
    }
    let options = this.options;
    if (extraOptions && Object.keys(extraOptions).length) {
      options = copyOwnKeys({}, extraOptions);
      copyOwnKeys(options, this.options);
    }
    const signer = new DKIMSigner(options, this.keys, inputStream, output);
    setImmediate(() => {
      try {
        signer.signStream();
      } catch (_E) {
        signer.fail(sign_default.unsupportedHashAlgoError(signer.hashAlgo));
        return;
      }
      if (writeValue) {
        setImmediate(() => {
          inputStream.end(writeValue);
        });
      }
    });
    return output;
  }
};
var dkim_default = DKIM;

// node_modules/nodemailer/dist/esm/smtp-connection/http-proxy-client.js
var import_node_net5 = __toESM(require("node:net"), 1);
var import_node_tls = __toESM(require("node:tls"), 1);
var MAX_RESPONSE_HEADER_BYTES = 64 * 1024;
var unbracket = (host) => typeof host === "string" && host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
function httpProxyClient(proxyUrl, destinationPort, destinationHost, tlsOptions, callback) {
  if (typeof tlsOptions === "function") {
    callback = tlsOptions;
    tlsOptions = {};
  }
  tlsOptions = tlsOptions || {};
  const done = callback;
  destinationPort = Number(destinationPort) || 0;
  if (!destinationPort || /[\r\n]/.test(destinationHost)) {
    const err = new Error("Invalid proxy destination");
    err.code = EPROXY;
    setImmediate(() => done(err));
    return;
  }
  const proxy = parse(proxyUrl);
  const authority = (import_node_net5.default.isIPv6(unbracket(destinationHost)) ? "[" + unbracket(destinationHost) + "]" : destinationHost) + ":" + destinationPort;
  const connectOptions = {
    host: proxy.hostname,
    port: Number(proxy.port) ? Number(proxy.port) : proxy.protocol === "https:" ? 443 : 80
  };
  let connect;
  if (proxy.protocol === "https:") {
    connectOptions.rejectUnauthorized = tlsOptions.rejectUnauthorized !== false;
    connect = import_node_tls.default.connect.bind(import_node_tls.default);
  } else {
    connect = import_node_net5.default.connect.bind(import_node_net5.default);
  }
  const timeout = Number(tlsOptions.timeout) || httpProxyClient.timeout || 30 * 1e3;
  let socket;
  let finished3 = false;
  let timer;
  const cleanup = () => {
    clearTimeout(timer);
    socket.removeListener("data", onSocketData);
    socket.removeListener("error", fail2);
    socket.removeListener("close", onEarlyClose);
  };
  function fail2(err) {
    if (finished3) {
      return;
    }
    finished3 = true;
    cleanup();
    try {
      socket.destroy();
    } catch (_E) {
    }
    done(err);
  }
  function onEarlyClose() {
    const err = new Error("Proxy closed the connection before the tunnel was established");
    err.code = EPROXY;
    fail2(err);
  }
  const chunks = [];
  let received = 0;
  let tail = "";
  function onSocketData(chunk) {
    if (finished3) {
      return;
    }
    const window = tail + chunk.toString("binary");
    const windowEnd = window.indexOf("\r\n\r\n");
    chunks.push(chunk);
    received += chunk.length;
    tail = window.slice(-3);
    if (windowEnd < 0) {
      if (received > MAX_RESPONSE_HEADER_BYTES) {
        const err = new Error("Proxy response headers too large");
        err.code = EPROXY;
        fail2(err);
      }
      return;
    }
    socket.removeListener("data", onSocketData);
    socket.pause();
    const headerEnd = received - window.length + windowEnd;
    const response = Buffer.concat(chunks, received);
    if (response.length > headerEnd + 4) {
      socket.unshift(response.subarray(headerEnd + 4));
    }
    const match = response.toString("binary", 0, headerEnd).match(/^HTTP\/\d+\.\d+ (\d+)/i);
    if (!match || (match[1] || "").charAt(0) !== "2") {
      const err = new Error("Invalid response from proxy" + (match && ": " + match[1] || ""));
      err.code = EPROXY;
      return fail2(err);
    }
    finished3 = true;
    cleanup();
    const resumeOnData = (event) => {
      if (event === "data") {
        socket.removeListener("newListener", resumeOnData);
        socket.resume();
      }
    };
    socket.on("newListener", resumeOnData);
    return done(null, socket);
  }
  socket = connect(connectOptions, () => {
    if (finished3) {
      return;
    }
    const reqHeaders = {
      Host: authority,
      Connection: "close"
    };
    if (proxy.auth) {
      reqHeaders["Proxy-Authorization"] = "Basic " + Buffer.from(proxy.auth).toString("base64");
    }
    socket.write(
      // HTTP method
      "CONNECT " + authority + " HTTP/1.1\r\n" + // HTTP request headers
      Object.keys(reqHeaders).map((key) => key + ": " + reqHeaders[key]).join("\r\n") + // End request
      "\r\n\r\n"
    );
    socket.on("data", onSocketData);
  });
  timer = setTimeout(() => {
    const err = new Error("Proxy socket timed out");
    err.code = ETIMEDOUT;
    fail2(err);
  }, timeout);
  socket.once("error", fail2);
  socket.once("close", onEarlyClose);
}
var http_proxy_client_default = httpProxyClient;

// node_modules/nodemailer/dist/esm/mailer/index.js
var import_node_util2 = __toESM(require("node:util"), 1);

// node_modules/nodemailer/dist/esm/mailer/mail-message.js
var hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
var MailMessage = class {
  constructor(mailer, data) {
    this.mailer = mailer;
    this.data = {};
    this.message = null;
    data = data || {};
    const options = mailer.options || {};
    const defaults = mailer._defaults || {};
    copyOwnKeys(this.data, data);
    this.data.headers = this.data.headers || {};
    copyOwnKeys(this.data, defaults, (key) => hasOwn(this.data, key));
    copyOwnKeys(this.data.headers, defaults.headers, (key) => hasOwn(this.data.headers, key));
    ["disableFileAccess", "disableUrlAccess", "normalizeHeaderKey", "maxRecipients"].forEach((key) => {
      if (key in options) {
        this.data[key] = options[key];
      }
    });
    ["disableFileAccess", "disableUrlAccess"].forEach((key) => {
      if (!(key in options) && hasOwn(defaults, key)) {
        this.data[key] = this.data[key] || defaults[key];
      }
    });
  }
  resolveContent(data, key, options, callback) {
    if (!callback && typeof options === "function") {
      callback = options;
      options = false;
    }
    options = options || {};
    const policy = {
      disableFileAccess: this.data.disableFileAccess || options.disableFileAccess,
      disableUrlAccess: this.data.disableUrlAccess || options.disableUrlAccess
    };
    return resolveContent(data, key, policy, callback);
  }
  resolveAll(callback) {
    const keys = [
      [this.data, "html"],
      [this.data, "text"],
      [this.data, "watchHtml"],
      [this.data, "amp"],
      [this.data, "icalEvent"]
    ];
    if (this.data.alternatives && this.data.alternatives.length) {
      this.data.alternatives.forEach((alternative, i) => {
        keys.push([this.data.alternatives, i]);
      });
    }
    if (this.data.attachments && this.data.attachments.length) {
      this.data.attachments.forEach((attachment, i) => {
        if (!attachment.filename) {
          attachment.filename = (attachment.path || attachment.href || "").split(/[/\\]/).pop().split("?").shift() || "attachment-" + (i + 1);
          if (attachment.filename.indexOf(".") < 0) {
            attachment.filename += "." + detectExtension2(attachment.contentType);
          }
        }
        if (!attachment.contentType) {
          attachment.contentType = detectMimeType2(attachment.filename || attachment.path || attachment.href || "bin");
        }
        keys.push([this.data.attachments, i]);
      });
    }
    const mimeNode = new mime_node_default();
    const addressKeys = ["from", "to", "cc", "bcc", "sender", "replyTo"];
    addressKeys.forEach((address) => {
      let value;
      if (this.message) {
        value = [].concat(mimeNode._parseAddresses(this.message.getHeader(address === "replyTo" ? "reply-to" : address)) || []);
      } else if (this.data[address]) {
        value = [].concat(mimeNode._parseAddresses(this.data[address]) || []);
      }
      if (value && value.length) {
        this.data[address] = value;
      } else if (address in this.data) {
        this.data[address] = null;
      }
    });
    const singleKeys = ["from", "sender"];
    singleKeys.forEach((address) => {
      if (this.data[address]) {
        this.data[address] = this.data[address].shift();
      }
    });
    let pos = 0;
    const resolveNext = () => {
      if (pos >= keys.length) {
        return callback(null, this.data);
      }
      const args = keys[pos++];
      if (!args[0] || !args[0][args[1]]) {
        return resolveNext();
      }
      resolveContent(...args, { disableFileAccess: this.data.disableFileAccess, disableUrlAccess: this.data.disableUrlAccess }, (err, value) => {
        if (err) {
          return callback(err);
        }
        const node = {
          content: value
        };
        if (args[0][args[1]] && typeof args[0][args[1]] === "object" && !Buffer.isBuffer(args[0][args[1]])) {
          copyOwnKeys(node, args[0][args[1]], (key) => key in node || ["content", "path", "href", "raw"].includes(key));
        }
        args[0][args[1]] = node;
        resolveNext();
      });
    };
    setImmediate(() => resolveNext());
  }
  /**
   * Destroys the content streams of the message once sending failed. A stream that was not
   * read to the end would otherwise keep the file or the socket behind it open
   */
  releaseStreams() {
    const data = this.data;
    const values = [data.html, data.text, data.watchHtml, data.amp, data.raw, data.icalEvent];
    for (const key of ["attachments", "alternatives"]) {
      if (Array.isArray(data[key])) {
        values.push(...data[key]);
      }
    }
    for (const value of values) {
      if (value && typeof value === "object") {
        destroyStream(value);
        destroyStream(value.content);
        destroyStream(value.raw);
      }
    }
  }
  normalize(callback) {
    const envelope = this.message.getEnvelope();
    const messageId = this.message.messageId();
    this.resolveAll((err, data) => {
      if (err) {
        return callback(err);
      }
      data.envelope = envelope;
      data.messageId = messageId;
      ["html", "text", "watchHtml", "amp"].forEach((key) => {
        if (data[key] && data[key].content) {
          if (typeof data[key].content === "string") {
            data[key] = data[key].content;
          } else if (Buffer.isBuffer(data[key].content)) {
            data[key] = data[key].content.toString();
          }
        }
      });
      if (data.icalEvent && Buffer.isBuffer(data.icalEvent.content)) {
        data.icalEvent.content = data.icalEvent.content.toString("base64");
        data.icalEvent.encoding = "base64";
      }
      if (data.alternatives && data.alternatives.length) {
        data.alternatives.forEach((alternative) => {
          if (alternative && alternative.content && Buffer.isBuffer(alternative.content)) {
            alternative.content = alternative.content.toString("base64");
            alternative.encoding = "base64";
          }
        });
      }
      if (data.attachments && data.attachments.length) {
        data.attachments.forEach((attachment) => {
          if (attachment && attachment.content && Buffer.isBuffer(attachment.content)) {
            attachment.content = attachment.content.toString("base64");
            attachment.encoding = "base64";
          }
        });
      }
      data.normalizedHeaders = {};
      Object.keys(data.headers || {}).forEach((key) => {
        if (isProtoKey(key)) {
          return;
        }
        let value = [].concat(data.headers[key] || []).shift();
        value = value && value.value || value;
        if (value) {
          if (["references", "in-reply-to", "message-id", "content-id"].includes(key)) {
            value = this.message._encodeHeaderValue(key, value);
          }
          data.normalizedHeaders[key] = value;
        }
      });
      if (data.list && typeof data.list === "object") {
        const listHeaders = this._getListHeaders(data.list);
        listHeaders.forEach((entry) => {
          data.normalizedHeaders[entry.key] = entry.value.map((val) => val && val.value || val).join(", ");
        });
      }
      if (data.references) {
        data.normalizedHeaders.references = this.message._encodeHeaderValue("references", data.references);
      }
      if (data.inReplyTo) {
        data.normalizedHeaders["in-reply-to"] = this.message._encodeHeaderValue("in-reply-to", data.inReplyTo);
      }
      return callback(null, data);
    });
  }
  setMailerHeader() {
    if (!this.message || !this.data.xMailer) {
      return;
    }
    this.message.setHeader("X-Mailer", this.data.xMailer);
  }
  setPriorityHeaders() {
    if (!this.message || !this.data.priority) {
      return;
    }
    switch ((this.data.priority || "").toString().toLowerCase()) {
      case "high":
        this.message.setHeader("X-Priority", "1 (Highest)");
        this.message.setHeader("X-MSMail-Priority", "High");
        this.message.setHeader("Importance", "High");
        break;
      case "low":
        this.message.setHeader("X-Priority", "5 (Lowest)");
        this.message.setHeader("X-MSMail-Priority", "Low");
        this.message.setHeader("Importance", "Low");
        break;
      default:
    }
  }
  setListHeaders() {
    if (!this.message || !this.data.list || typeof this.data.list !== "object") {
      return;
    }
    this._getListHeaders(this.data.list).forEach((listHeader) => {
      listHeader.value.forEach((value) => {
        this.message.addHeader(listHeader.key, value);
      });
    });
  }
  /** @internal */
  _getListHeaders(listData) {
    return Object.keys(listData).map((key) => ({
      key: "list-" + key.toLowerCase().trim(),
      value: [].concat(listData[key] || []).map((value) => ({
        prepared: true,
        foldLines: true,
        value: [].concat(value || []).map((value2) => {
          if (typeof value2 === "string") {
            value2 = {
              url: value2
            };
          }
          if (value2 && value2.url) {
            let comment = (value2.comment || "").toString().replace(/\r?\n|\r/g, " ");
            const needsEncoding = !isPlainText(comment) || /\x7f/.test(comment);
            if (key.toLowerCase().trim() === "id") {
              comment = needsEncoding ? encodeWord(comment) : quoteString(comment);
              return (value2.comment ? comment + " " : "") + this._formatListUrl(value2.url).replace(/^<[^:]+:\/{0,2}/, "<");
            }
            comment = needsEncoding ? encodeWord(comment) : comment.replace(/[()\\]/g, "\\$&");
            return this._formatListUrl(value2.url) + (value2.comment ? " (" + comment + ")" : "");
          }
          return "";
        }).filter((value2) => value2).join(", ")
      }))
    }));
  }
  /** @internal */
  _formatListUrl(url) {
    url = url.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").replace(/[\s<]+|[\s>]+/g, "");
    if (/^(https?|mailto|ftp):/.test(url)) {
      return "<" + url + ">";
    }
    if (/^[^@]+@[^@]+$/.test(url)) {
      return "<mailto:" + url + ">";
    }
    return "<http://" + url + ">";
  }
};

// node_modules/nodemailer/dist/esm/mailer/index.js
var import_node_net6 = __toESM(require("node:net"), 1);
var import_node_dns2 = __toESM(require("node:dns"), 1);
var import_node_crypto5 = __toESM(require("node:crypto"), 1);
var DEFAULT_MAX_RECIPIENTS = 1e5;
var Mail = class extends import_node_events.EventEmitter {
  constructor(transporter, options, defaults) {
    super();
    this.options = options || {};
    this._defaults = defaults || {};
    this._defaultPlugins = {
      compile: [(...args) => this._convertDataImages(...args)],
      stream: []
    };
    this._userPlugins = {
      compile: [],
      stream: []
    };
    this.meta = /* @__PURE__ */ new Map();
    this.dkim = this.options.dkim ? new dkim_default(this.options.dkim) : false;
    this.transporter = transporter;
    this.transporter.mailer = this;
    this.logger = getLogger(this.options, {
      component: this.options.component || "mail"
    });
    this.logger.debug({
      tnx: "create"
    }, "Creating transport: %s", this.getVersionString());
    if (typeof this.transporter.on === "function") {
      this.transporter.on("log", (log) => {
        this.logger.debug({
          tnx: "transport"
        }, "%s: %s", log.type, log.message);
      });
      this.transporter.on("error", (err) => {
        this.logger.error({
          err,
          tnx: "transport"
        }, "Transport Error: %s", err.message);
        this.emit("error", err);
      });
      this.transporter.on("idle", (...args) => {
        this.emit("idle", ...args);
      });
      this.transporter.on("clear", (...args) => {
        this.emit("clear", ...args);
      });
    }
    ["close", "isIdle", "verify"].forEach((method) => {
      this[method] = (...args) => {
        if (typeof this.transporter[method] === "function") {
          if (method === "verify" && typeof this.getSocket === "function") {
            this.transporter.getSocket = this.getSocket;
            this.getSocket = false;
          }
          return this.transporter[method](...args);
        }
        this.logger.warn({
          tnx: "transport",
          methodName: method
        }, "Non existing method %s called for transport", method);
        return false;
      };
    });
    if (this.options.proxy && typeof this.options.proxy === "string") {
      this.setupProxy(this.options.proxy);
    }
  }
  use(step, plugin) {
    step = (step || "").toString();
    if (!this._userPlugins.hasOwnProperty(step)) {
      this._userPlugins[step] = [plugin];
    } else {
      this._userPlugins[step].push(plugin);
    }
    return this;
  }
  sendMail(data, callback = null) {
    let promise;
    if (!callback) {
      promise = new Promise((resolve3, reject) => {
        callback = callbackPromise(resolve3, reject);
      });
    }
    const done = callback;
    if (typeof this.getSocket === "function") {
      this.transporter.getSocket = this.getSocket;
      this.getSocket = false;
    }
    const mail = new MailMessage(this, data);
    const fail2 = (err) => {
      mail.releaseStreams();
      done(err);
    };
    this.logger.debug({
      tnx: "transport",
      name: this.transporter.name,
      version: this.transporter.version,
      action: "send"
    }, "Sending mail using %s/%s", this.transporter.name, this.transporter.version);
    this._processPlugins("compile", mail, (err) => {
      if (err) {
        this.logger.error({
          err,
          tnx: "plugin",
          action: "compile"
        }, "PluginCompile Error: %s", err.message);
        return fail2(err);
      }
      let recipientCount;
      try {
        mail.message = new mail_composer_default(mail.data).compile();
        mail.setMailerHeader();
        mail.setPriorityHeaders();
        mail.setListHeaders();
        recipientCount = mail.message.getEnvelope().to.length;
      } catch (err2) {
        this.logger.error({
          err: err2,
          tnx: "transport",
          action: "send"
        }, "Compile Error: %s", err2.message);
        return fail2(err2);
      }
      const maxRecipients = mail.data.maxRecipients === void 0 ? DEFAULT_MAX_RECIPIENTS : mail.data.maxRecipients;
      if (maxRecipients && recipientCount > maxRecipients) {
        const err2 = new Error(`Message has ${recipientCount} recipients, which is over the ${maxRecipients} allowed by maxRecipients`);
        err2.code = EMAXRECIPIENTS;
        this.logger.error({
          err: err2,
          tnx: "transport",
          action: "send"
        }, "Send Error: %s", err2.message);
        return fail2(err2);
      }
      this._processPlugins("stream", mail, (err2) => {
        if (err2) {
          this.logger.error({
            err: err2,
            tnx: "plugin",
            action: "stream"
          }, "PluginStream Error: %s", err2.message);
          return fail2(err2);
        }
        if (mail.data.dkim || this.dkim) {
          mail.message.processFunc((input) => {
            const dkim = mail.data.dkim ? new dkim_default(mail.data.dkim) : this.dkim;
            this.logger.debug({
              tnx: "DKIM",
              messageId: mail.message.messageId(),
              dkimDomains: dkim.keys.map((key) => key.keySelector + "." + key.domainName).join(", ")
            }, "Signing outgoing message with %s keys", dkim.keys.length);
            return dkim.sign(input, mail.data._dkim);
          });
        }
        this.transporter.send(mail, (...args) => {
          if (args[0]) {
            mail.releaseStreams();
            this.logger.error({
              err: args[0],
              tnx: "transport",
              action: "send"
            }, "Send Error: %s", args[0].message);
          }
          done(...args);
        });
      });
    });
    return promise;
  }
  getVersionString() {
    return import_node_util2.default.format("%s (%s; +%s; %s/%s)", name, version, homepage, this.transporter.name, this.transporter.version);
  }
  /** @internal */
  _processPlugins(step, mail, callback) {
    step = (step || "").toString();
    if (!this._userPlugins.hasOwnProperty(step)) {
      return callback();
    }
    const userPlugins = this._userPlugins[step] || [];
    const defaultPlugins = this._defaultPlugins[step] || [];
    if (userPlugins.length) {
      this.logger.debug({
        tnx: "transaction",
        pluginCount: userPlugins.length,
        step
      }, "Using %s plugins for %s", userPlugins.length, step);
    }
    if (userPlugins.length + defaultPlugins.length === 0) {
      return callback();
    }
    let pos = 0;
    let block = "default";
    const processPlugins = () => {
      let curplugins = block === "default" ? defaultPlugins : userPlugins;
      if (pos >= curplugins.length) {
        if (block === "default" && userPlugins.length) {
          block = "user";
          pos = 0;
          curplugins = userPlugins;
        } else {
          return callback();
        }
      }
      const plugin = curplugins[pos++];
      plugin(mail, (err) => {
        if (err) {
          return callback(err);
        }
        processPlugins();
      });
    };
    processPlugins();
  }
  /**
   * Sets up proxy handler for a Nodemailer object
   *
   * @param proxyUrl Proxy configuration url
   */
  setupProxy(proxyUrl) {
    const proxy = parse(proxyUrl);
    this.getSocket = (options, callback) => {
      const protocol = proxy.protocol.replace(/:$/, "").toLowerCase();
      const configuredTimeout = Number(this.options.connectionTimeout) || 0;
      const connectStartedAt = Number(options.connectStartedAt) || Date.now();
      const connectionTimeout = configuredTimeout ? Math.max(connectStartedAt + configuredTimeout - Date.now(), 1) : void 0;
      if (this.meta.has("proxy_handler_" + protocol)) {
        return this.meta.get("proxy_handler_" + protocol)(proxy, options, callback);
      }
      switch (protocol) {
        // Connect using a HTTP CONNECT method
        case "http":
        case "https":
          http_proxy_client_default(proxy.href, options.port, options.host, connectionTimeout ? Object.assign({}, this.options.tls, { timeout: connectionTimeout }) : this.options.tls || {}, (err2, socket) => {
            if (err2) {
              return callback(err2);
            }
            return callback(null, {
              connection: socket
            });
          });
          return;
        case "socks":
        case "socks5":
        case "socks4":
        case "socks4a": {
          if (!this.meta.has("proxy_socks_module")) {
            let err2 = new Error("Socks module not loaded");
            err2.code = EPROXY;
            return callback(err2);
          }
          const connect = (ipaddress) => {
            const proxyV2 = !!this.meta.get("proxy_socks_module").SocksClient;
            const socksClient = proxyV2 ? this.meta.get("proxy_socks_module").SocksClient : this.meta.get("proxy_socks_module");
            const proxyType = Number(proxy.protocol.replace(/\D/g, "")) || 5;
            const connectionOpts = {
              proxy: {
                ipaddress,
                port: Number(proxy.port),
                type: proxyType
              },
              [proxyV2 ? "destination" : "target"]: {
                host: options.host,
                port: options.port
              },
              command: "connect"
            };
            if (connectionTimeout) {
              connectionOpts.timeout = connectionTimeout;
            }
            if (proxy.username || proxy.password) {
              const username = proxy.username || "";
              const password = proxy.password || "";
              if (proxyV2) {
                connectionOpts.proxy.userId = username;
                connectionOpts.proxy.password = password;
              } else if (proxyType === 4) {
                connectionOpts.userid = username;
              } else {
                connectionOpts.authentication = {
                  username,
                  password
                };
              }
            }
            socksClient.createConnection(connectionOpts, (err2, info) => {
              if (err2) {
                return callback(err2);
              }
              return callback(null, {
                connection: info.socket || info
              });
            });
          };
          if (import_node_net6.default.isIP(proxy.hostname)) {
            return connect(proxy.hostname);
          }
          return import_node_dns2.default.lookup(proxy.hostname, (err2, address) => {
            if (err2) {
              return callback(err2);
            }
            connect(address);
          });
        }
      }
      let err = new Error("Unknown proxy configuration");
      err.code = EPROXY;
      callback(err);
    };
  }
  /** @internal */
  _convertDataImages(mail, callback) {
    if (!this.options.attachDataUrls && !mail.data.attachDataUrls || !mail.data.html) {
      return callback();
    }
    mail.resolveContent(mail.data, "html", { disableFileAccess: mail.data.disableFileAccess, disableUrlAccess: mail.data.disableUrlAccess }, (err, html) => {
      if (err) {
        return callback(err);
      }
      let cidCounter = 0;
      html = (html || "").toString().replace(/(<img\b[^<>]{0,1024} src\s{0,20}=[\s"']{0,20})(data:([^;"'<>\s]{1,255});[^"'>\s]+)/gi, (match, prefix, dataUri, mimeType) => {
        const cid = import_node_crypto5.default.randomBytes(10).toString("hex") + "@localhost";
        if (!mail.data.attachments) {
          mail.data.attachments = [];
        }
        if (!Array.isArray(mail.data.attachments)) {
          mail.data.attachments = [].concat(mail.data.attachments || []);
        }
        mail.data.attachments.push({
          path: dataUri,
          cid,
          filename: "image-" + ++cidCounter + "." + detectExtension(mimeType)
        });
        return prefix + "cid:" + cid;
      });
      mail.data.html = html;
      callback();
    });
  }
  set(key, value) {
    return this.meta.set(key, value);
  }
  get(key) {
    return this.meta.get(key);
  }
};
var mailer_default = Mail;

// node_modules/nodemailer/dist/esm/smtp-pool/index.js
var import_node_events4 = require("node:events");

// node_modules/nodemailer/dist/esm/smtp-connection/index.js
var import_node_events2 = require("node:events");
var import_node_net7 = __toESM(require("node:net"), 1);
var import_node_tls2 = __toESM(require("node:tls"), 1);
var import_node_os2 = __toESM(require("node:os"), 1);
var import_node_crypto6 = __toESM(require("node:crypto"), 1);

// node_modules/nodemailer/dist/esm/smtp-connection/data-stream.js
var import_node_stream12 = require("node:stream");
var INSERT_LF = Buffer.from("\n");
var INSERT_LF_DOT = Buffer.from("\n.");
var INSERT_CR = Buffer.from("\r");
var INSERT_DOT = Buffer.from(".");
var DataStream = class extends import_node_stream12.Transform {
  constructor(options) {
    super(options);
    this.options = options || {};
    this.inByteCount = 0;
    this.outByteCount = 0;
    this.lastByte = false;
  }
  /**
   * Escapes dots
   * @internal
   */
  _transform(chunk, encoding, done) {
    const chunks = [];
    let chunklen = 0;
    let i, len, lastPos = 0;
    let buf;
    if (!chunk || !chunk.length) {
      return done();
    }
    if (typeof chunk === "string") {
      chunk = Buffer.from(chunk);
    }
    this.inByteCount += chunk.length;
    for (i = 0, len = chunk.length; i < len; i++) {
      const byte = chunk[i];
      const prev = i ? chunk[i - 1] : this.lastByte;
      let insert = false;
      if (prev === 13 && byte !== 10) {
        insert = byte === 46 ? INSERT_LF_DOT : INSERT_LF;
      } else if (byte === 10 && prev !== 13) {
        insert = INSERT_CR;
      } else if (byte === 46 && (prev === 10 || prev === false)) {
        insert = INSERT_DOT;
      }
      if (insert) {
        if (i > lastPos) {
          buf = chunk.slice(lastPos, i);
          chunks.push(buf);
          chunklen += buf.length;
        }
        chunks.push(insert);
        chunklen += insert.length;
        lastPos = i;
      }
    }
    if (chunks.length) {
      if (lastPos < chunk.length) {
        buf = chunk.slice(lastPos);
        chunks.push(buf);
        chunklen += buf.length;
      }
      this.outByteCount += chunklen;
      this.push(Buffer.concat(chunks, chunklen));
    } else {
      this.outByteCount += chunk.length;
      this.push(chunk);
    }
    this.lastByte = chunk[chunk.length - 1];
    done();
  }
  /**
   * Finalizes the stream with a dot on a single line
   * @internal
   */
  _flush(done) {
    let buf;
    if (this.lastByte === 10) {
      buf = Buffer.from(".\r\n");
    } else if (this.lastByte === 13) {
      buf = Buffer.from("\n.\r\n");
    } else {
      buf = Buffer.from("\r\n.\r\n");
    }
    this.outByteCount += buf.length;
    this.push(buf);
    done();
  }
};

// node_modules/nodemailer/dist/esm/smtp-connection/index.js
var import_node_stream13 = require("node:stream");
var CONNECTION_TIMEOUT = 2 * 60 * 1e3;
var SOCKET_TIMEOUT = 10 * 60 * 1e3;
var GREETING_TIMEOUT = 30 * 1e3;
var DNS_TIMEOUT = 30 * 1e3;
var CLOSE_TIMEOUT = 5 * 1e3;
var KEEPALIVE_DELAY = 30 * 1e3;
var TEARDOWN_NOOP = () => {
};
function shuffle(list) {
  const result = list.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function timeoutError(message, timeoutType) {
  const err = new Error(message);
  err.timeoutType = timeoutType;
  return err;
}
var MAX_RESPONSE_SIZE = 1024 * 1024;
function decodeServerResponse(str) {
  if (!str) {
    return str;
  }
  const utf8 = Buffer.from(str, "binary").toString("utf8");
  return utf8.includes("\uFFFD") ? str : utf8;
}
function isPartialResponse(str) {
  return isPartialLine(str.slice(str.lastIndexOf("\n") + 1));
}
function isPartialLine(line) {
  return /^\d+-/.test(line);
}
function maskAuthCommand(cmd) {
  const match = (cmd || "").toString().match(/^AUTH\s+[^\s]+/i);
  if (!match) {
    return "/* secret */";
  }
  return match[0].length === cmd.length ? cmd : match[0] + " /* secret */";
}
var SMTPConnection = class extends import_node_events2.EventEmitter {
  constructor(options) {
    super(options);
    this.id = import_node_crypto6.default.randomBytes(8).toString("base64").replace(/\W/g, "");
    this.stage = "init";
    this.options = options || {};
    if (this.options.requireTLS && (this.options.ignoreTLS || this.options.opportunisticTLS)) {
      this.options = Object.assign({}, this.options, { ignoreTLS: false, opportunisticTLS: false });
    }
    this.secureConnection = !!this.options.secure;
    this.alreadySecured = !!this.options.secured;
    this.port = Number(this.options.port) || (this.secureConnection ? 465 : 587);
    this.host = this.options.host || "localhost";
    this.servername = this.options.servername ? this.options.servername : !import_node_net7.default.isIP(this.host) ? this.host : false;
    this.allowInternalNetworkInterfaces = this.options.allowInternalNetworkInterfaces || false;
    if (typeof this.options.secure === "undefined" && this.port === 465) {
      this.secureConnection = true;
    }
    this.name = (this.options.name || this._getHostname()).toString().replace(/[\r\n]+/g, "");
    this.logger = getLogger(this.options, {
      component: this.options.component || "smtp-connection",
      sid: this.id
    });
    this.customAuth = /* @__PURE__ */ new Map();
    for (const key of Object.keys(this.options.customAuth || {})) {
      const mapKey = (key || "").toString().trim().toUpperCase();
      if (mapKey) {
        this.customAuth.set(mapKey, this.options.customAuth[key]);
      }
    }
    this.version = version;
    this.authenticated = false;
    this.destroyed = false;
    this.secure = !!this.secureConnection;
    this._remainder = "";
    this._responseQueue = [];
    this._responsePartial = false;
    this.lastServerResponse = false;
    this._socket = false;
    this._supportedAuth = [];
    this.allowsAuth = false;
    this._envelope = false;
    this._supportedExtensions = [];
    this._maxAllowedSize = 0;
    this._responseActions = [];
    this._recipientQueue = [];
    this._phaseTimer = false;
    this._plaintextEhlo = false;
    this._destroyed = false;
    this._closing = false;
    this._currentDataStream = false;
    this._pendingSend = false;
    this._connectCallback = false;
    this._onSocketData = (chunk) => this._onData(chunk);
    this._onSocketError = (error2) => this._onError(error2, "ESOCKET", false, "CONN");
    this._onSocketClose = () => this._onClose();
    this._onSocketEnd = () => this._onEnd();
    this._onSocketTimeout = () => this._onTimeout();
    this._onConnectionSocketError = (err) => this._onError(err, "ESOCKET", false, "CONN");
  }
  /**
   * Creates a connection to a SMTP server and sets up connection
   * listener
   */
  connect(connectCallback) {
    if (this._connectCalled && !this._destroyed) {
      const err = this._formatError("Cannot connect - connect() was already called for this connection", "ECONNECTION", false, "API");
      if (typeof connectCallback === "function") {
        setImmediate(() => connectCallback(err));
        return;
      }
      this.logger.warn({ tnx: "smtp" }, "%s", err.message);
      return;
    }
    this._connectCalled = true;
    if (typeof connectCallback === "function") {
      this._connectCallback = connectCallback;
      this.once("connect", () => {
        this._connectCallback = false;
        this.logger.debug({
          tnx: "smtp"
        }, "SMTP handshake finished");
        connectCallback();
      });
      const isDestroyedMessage = this._isDestroyedMessage("connect");
      if (isDestroyedMessage) {
        return connectCallback(this._formatError(isDestroyedMessage, "ECONNECTION", false, "CONN"));
      }
    }
    const connectionTimeout = this.options.connectionTimeout || CONNECTION_TIMEOUT;
    this._connectionDeadline = (this._connectStartedAt || Date.now()) + connectionTimeout;
    let opts = {
      port: this.port,
      host: this.host,
      allowInternalNetworkInterfaces: this.allowInternalNetworkInterfaces,
      timeout: Math.min(this.options.dnsTimeout || DNS_TIMEOUT, connectionTimeout)
    };
    if (this.options.localAddress) {
      opts.localAddress = this.options.localAddress;
    }
    if (this.options.connection) {
      this._socket = this.options.connection;
      this._setupConnectionHandlers();
      if (this.secureConnection && !this.alreadySecured) {
        setImmediate(() => this._upgradeConnection((err) => {
          if (err) {
            this._onError(new Error("Error initiating TLS - " + (err.message || err)), "ETLS", false, "CONN");
            return;
          }
          this._onConnect();
        }));
      } else {
        setImmediate(() => this._onConnect());
      }
      return;
    } else if (this.options.socket) {
      this._socket = this.options.socket;
      return this._resolveAndConnect(opts, (_resolved) => {
        try {
          this._socket.connect(this.port, this.host, () => {
            if (this.secureConnection && !this.alreadySecured) {
              return this._upgradeConnection((err) => {
                if (err) {
                  this._onError(new Error("Error initiating TLS - " + (err.message || err)), "ETLS", false, "CONN");
                  return;
                }
                this._onConnect();
              });
            }
            this._onConnect();
          });
          this._setupConnectionHandlers();
        } catch (E) {
          setImmediate(() => this._onError(E, "ECONNECTION", false, "CONN"));
          return;
        }
      });
    } else {
      if (this.secureConnection) {
        Object.assign(opts, this.options.tls || {});
        if (this.servername && !opts.servername) {
          opts.servername = this.servername;
        }
      }
      return this._resolveAndConnect(opts, (resolved) => {
        let addresses = resolved._addresses || [];
        if (opts.localAddress) {
          const localFamily = import_node_net7.default.isIPv6(opts.localAddress) ? 6 : 4;
          const sameFamily = addresses.filter((addr) => import_node_net7.default.isIP(addr) === localFamily);
          addresses = sameFamily.length ? sameFamily : addresses;
        }
        if (addresses.length > 1) {
          const ipv6 = addresses.filter((addr) => import_node_net7.default.isIPv6(addr));
          const ipv4 = addresses.filter((addr) => !import_node_net7.default.isIPv6(addr));
          const ordered = shuffle(ipv6).concat(shuffle(ipv4));
          opts.host = this.host;
          opts.autoSelectFamily = true;
          if (!ipv6.length || !ipv4.length) {
            const remaining = this._connectionDeadline - Date.now();
            opts.autoSelectFamilyAttemptTimeout = Math.max(Math.floor(remaining / ordered.length), 10);
          }
          opts.lookup = ((hostname, lookupOptions, callback) => {
            if (lookupOptions && lookupOptions.all) {
              const all = ordered.map((address) => ({ address, family: import_node_net7.default.isIPv6(address) ? 6 : 4 }));
              return setImmediate(() => callback(null, all));
            }
            setImmediate(() => callback(null, ordered[0], import_node_net7.default.isIPv6(ordered[0]) ? 6 : 4));
          });
        } else if (addresses.length) {
          opts.host = addresses[0];
        }
        this._connectToHost(opts, this.secureConnection);
      });
    }
  }
  /**
   * Resolves the hostname and applies resolved values to opts,
   * then calls the provided callback with the resolved data
   *
   * @param opts Connection options (modified in place)
   * @param callback Called with resolved data on success
   * @internal
   */
  _resolveAndConnect(opts, callback) {
    return resolveHostname(opts, (err, resolved) => {
      if (err) {
        return setImmediate(() => this._onError(err, "EDNS", false, "CONN"));
      }
      this.logger.debug({
        tnx: "dns",
        source: opts.host,
        resolved: resolved.host,
        cached: !!resolved.cached
      }, "Resolved %s as %s [cache %s]", opts.host, resolved.host, resolved.cached ? "hit" : "miss");
      for (const key of Object.keys(resolved)) {
        if (key.charAt(0) !== "_" && resolved[key]) {
          opts[key] = resolved[key];
        }
      }
      callback(resolved);
    });
  }
  /**
   * Attempts to connect to the specified host address
   *
   * @param opts Connection options
   * @param secure Whether to use TLS
   * @internal
   */
  _connectToHost(opts, secure) {
    if (this._destroyed || this._closing) {
      return;
    }
    const connectFn = secure ? import_node_tls2.default.connect : import_node_net7.default.connect;
    try {
      this._socket = connectFn(opts, () => this._onConnect());
      this._setupConnectionHandlers();
    } catch (E) {
      setImmediate(() => this._onError(E, "ECONNECTION", false, "CONN"));
      return;
    }
  }
  /**
   * Sets up connection timeout and error handlers
   * @internal
   */
  _setupConnectionHandlers() {
    this._startPhase(Math.max((this._connectionDeadline || Date.now()) - Date.now(), 0), timeoutError("Connection timeout", "CONNECT_TIMEOUT"));
    this._socket.on("error", this._onConnectionSocketError);
  }
  /**
   * Starts the timer of a connection phase: connecting, waiting for the greeting or a TLS
   * upgrade. The phases follow one another, so starting one ends the one before
   *
   * @param timeout Time the phase may take
   * @param err Error to fail with when it takes longer
   * @internal
   */
  _startPhase(timeout, err) {
    this._clearPhase();
    this._phaseTimer = setTimeout(() => {
      this._phaseTimer = false;
      this._onError(err, "ETIMEDOUT", false, "CONN");
    }, timeout);
  }
  /**
   * Time the greeting or a STARTTLS upgrade may take: greetingTimeout, cut short by what is left
   * of connectionTimeout
   *
   * @internal
   */
  _remainingSetupTime() {
    return Math.min(this.options.greetingTimeout || GREETING_TIMEOUT, Math.max((this._connectionDeadline || Infinity) - Date.now(), 1));
  }
  /** @internal */
  _clearPhase() {
    clearTimeout(this._phaseTimer);
    this._phaseTimer = false;
  }
  /**
   * Sends QUIT
   */
  quit() {
    this._sendCommand("QUIT");
    this._responseActions.push(this.close);
  }
  /**
   * Closes the connection to the server
   */
  close() {
    this._clearPhase();
    this._responseActions = [];
    if (this._closing) {
      return;
    }
    this._closing = true;
    const closeMethod = this.stage === "init" ? "destroy" : "end";
    this.logger.debug({
      tnx: "smtp"
    }, 'Closing connection to the server using "%s"', closeMethod);
    const socket = this._socket && this._socket.socket || this._socket;
    if (this._currentDataStream) {
      try {
        this._currentDataStream.unpipe(this._socket);
      } catch (_E) {
      }
      this._currentDataStream = false;
    }
    if (this._pendingSend) {
      const { stream, onStreamError } = this._pendingSend;
      if (stream) {
        stream.removeListener("error", onStreamError);
        stream.on("error", TEARDOWN_NOOP);
        stream.destroy();
      }
      this._pendingSend = false;
    }
    if (socket && !socket.destroyed) {
      try {
        socket.setTimeout(0);
        socket.removeListener("data", this._onSocketData);
        socket.removeListener("timeout", this._onSocketTimeout);
        socket.removeListener("close", this._onSocketClose);
        socket.removeListener("end", this._onSocketEnd);
        socket.removeListener("error", this._onSocketError);
        socket.removeListener("error", this._onConnectionSocketError);
        socket.on("error", TEARDOWN_NOOP);
        socket[closeMethod]();
        if (closeMethod === "end") {
          const closeTimer = setTimeout(() => socket.destroy(), CLOSE_TIMEOUT);
          if (typeof closeTimer.unref === "function") {
            closeTimer.unref();
          }
          socket.once("close", () => clearTimeout(closeTimer));
        }
      } catch (_E) {
      }
    }
    this._destroy();
  }
  /**
   * Authenticate user
   */
  login(authData, callback) {
    const isDestroyedMessage = this._isDestroyedMessage("login");
    if (isDestroyedMessage) {
      return callback(this._formatError(isDestroyedMessage, "ECONNECTION", false, "API"));
    }
    this._auth = authData || {};
    this._authMethod = (this._auth.method || "").toString().trim().toUpperCase() || false;
    const canUseXOAuth2 = !!this._auth.oauth2 || this.customAuth.has("XOAUTH2");
    if (!this._authMethod && this._auth.oauth2 && !this._auth.credentials) {
      this._authMethod = "XOAUTH2";
    } else if (!this._authMethod || this._authMethod === "XOAUTH2" && !this._auth.oauth2) {
      const supported = this._supportedAuth.find((method) => method !== "XOAUTH2" || canUseXOAuth2);
      this._authMethod = (supported || "PLAIN").toUpperCase().trim();
    }
    if ((this._authMethod !== "XOAUTH2" || this.customAuth.has("XOAUTH2")) && (!this._auth.credentials || !this._auth.credentials.user || !this._auth.credentials.pass)) {
      if (this._auth.user && this._auth.pass || this.customAuth.has(this._authMethod)) {
        this._auth.credentials = {
          user: this._auth.user,
          pass: this._auth.pass,
          options: this._auth.options
        };
      } else {
        return callback(this._formatError('Missing credentials for "' + this._authMethod + '"', "EAUTH", false, "API"));
      }
    }
    if (this.customAuth.has(this._authMethod)) {
      const handler = this.customAuth.get(this._authMethod);
      let lastResponse;
      let returned = false;
      const resolve3 = () => {
        if (returned) {
          return;
        }
        returned = true;
        this.logger.info({
          tnx: "smtp",
          username: this._auth.user,
          action: "authenticated",
          method: this._authMethod
        }, "User %s authenticated", JSON.stringify(this._auth.user));
        this.authenticated = true;
        callback(null, true);
      };
      const reject = (err) => {
        if (returned) {
          return;
        }
        returned = true;
        callback(this._formatError(err, "EAUTH", lastResponse, "AUTH " + this._authMethod));
      };
      const sendCommand = (cmd, done) => {
        let promise;
        if (!done) {
          promise = new Promise((resolve4, reject2) => {
            done = callbackPromise(resolve4, reject2);
          });
        }
        this._responseActions.push((str) => {
          lastResponse = str;
          let codes = str.match(/^(\d+)(?:\s(\d+\.\d+\.\d+))?\s/);
          let data = {
            command: cmd,
            response: str
          };
          if (codes) {
            data.status = Number(codes[1]) || 0;
            if (codes[2]) {
              data.code = codes[2];
            }
            data.text = str.substr(codes[0].length);
          } else {
            data.text = str;
            data.status = 0;
          }
          done(null, data);
        });
        setImmediate(() => this._sendCommand(cmd, maskAuthCommand(cmd)));
        return promise;
      };
      const handlerResponse = handler({
        auth: this._auth,
        method: this._authMethod,
        extensions: [].concat(this._supportedExtensions),
        authMethods: [].concat(this._supportedAuth),
        maxAllowedSize: this._maxAllowedSize || false,
        sendCommand,
        resolve: resolve3,
        reject
      });
      if (handlerResponse && typeof handlerResponse.catch === "function") {
        handlerResponse.then(resolve3).catch(reject);
      }
      return;
    }
    switch (this._authMethod) {
      case "XOAUTH2":
        this._handleXOauth2Token(false, callback);
        return;
      case "LOGIN":
        this._responseActions.push((str) => {
          this._actionAUTH_LOGIN_USER(str, callback);
        });
        this._sendCommand("AUTH LOGIN");
        return;
      case "PLAIN":
        this._responseActions.push((str) => {
          this._actionAUTHComplete(str, callback);
        });
        this._sendCommand(
          "AUTH PLAIN " + Buffer.from(
            //this._auth.user+'\u0000'+
            "\0" + // skip authorization identity as it causes problems with some servers
            this._auth.credentials.user + "\0" + this._auth.credentials.pass,
            "utf-8"
          ).toString("base64"),
          // log entry without passwords
          "AUTH PLAIN " + Buffer.from(
            //this._auth.user+'\u0000'+
            "\0" + // skip authorization identity as it causes problems with some servers
            this._auth.credentials.user + "\0/* secret */",
            "utf-8"
          ).toString("base64")
        );
        return;
      case "CRAM-MD5":
        this._responseActions.push((str) => {
          this._actionAUTH_CRAM_MD5(str, callback);
        });
        this._sendCommand("AUTH CRAM-MD5");
        return;
    }
    return callback(this._formatError('Unknown authentication method "' + this._authMethod + '"', "EAUTH", false, "API"));
  }
  /**
   * Sends a message
   *
   * @param envelope Envelope object, {from: addr, to: [addr]}
   * @param message String, Buffer or a Stream
   * @param done Callback to return once sending is completed
   */
  send(envelope, message, done) {
    let returned = false;
    const callback = (err, info) => {
      if (returned) {
        return;
      }
      returned = true;
      if (this._pendingSend && this._pendingSend.callback === callback) {
        this._pendingSend = false;
      }
      done(err, info);
    };
    if (!message) {
      return callback(this._formatError("Empty message", "EMESSAGE", false, "API"));
    }
    const isDestroyedMessage = this._isDestroyedMessage("send message");
    if (isDestroyedMessage) {
      return callback(this._formatError(isDestroyedMessage, "ECONNECTION", false, "API"));
    }
    if (this._maxAllowedSize && envelope.size > this._maxAllowedSize) {
      setImmediate(() => {
        callback(this._formatError("Message size larger than allowed " + this._maxAllowedSize, "EMESSAGE", false, "MAIL FROM"));
      });
      return;
    }
    const pendingSend = {
      callback,
      stream: false,
      onStreamError: (err) => callback(this._formatError(err, "ESTREAM", false, "API"))
    };
    if (typeof message.on === "function") {
      pendingSend.stream = message;
      pendingSend.stream.on("error", pendingSend.onStreamError);
    }
    this._pendingSend = pendingSend;
    const startTime = Date.now();
    this._setEnvelope(envelope, (err, info) => {
      if (err) {
        if (typeof message.destroy === "function") {
          message.destroy();
        }
        return callback(err);
      }
      const envelopeTime = Date.now();
      const stream = this._createSendStream((err2, str) => {
        if (err2) {
          return callback(err2);
        }
        const result = info;
        result.envelopeTime = envelopeTime - startTime;
        result.messageTime = Date.now() - envelopeTime;
        result.messageSize = stream.outByteCount;
        result.response = str;
        return callback(null, result);
      });
      if (typeof message.pipe === "function") {
        message.pipe(stream);
      } else {
        stream.write(message);
        stream.end();
      }
    });
  }
  /**
   * Resets connection state
   *
   * @param callback Callback to return once connection is reset
   */
  reset(callback) {
    const isDestroyedMessage = this._isDestroyedMessage("reset");
    if (isDestroyedMessage) {
      return callback(this._formatError(isDestroyedMessage, "ECONNECTION", false, "API"));
    }
    this._sendCommand("RSET");
    this._responseActions.push((str) => {
      if (str.charAt(0) !== "2") {
        return callback(this._formatError("Could not reset session state. response=" + str, "EPROTOCOL", str, "RSET"));
      }
      this._envelope = false;
      return callback(null, true);
    });
  }
  /**
   * Connection listener that is run when the connection to
   * the server is opened
   *
   * @event
   * @internal
   */
  _onConnect() {
    const socket = this._socket;
    this._clearPhase();
    this.logger.info({
      tnx: "network",
      localAddress: socket.localAddress,
      localPort: socket.localPort,
      remoteAddress: socket.remoteAddress,
      remotePort: socket.remotePort
    }, "%s established to %s:%s", this.secure ? "Secure connection" : "Connection", socket.remoteAddress, socket.remotePort);
    if (this._destroyed) {
      this.close();
      return;
    }
    this.stage = "connected";
    socket.removeListener("data", this._onSocketData);
    socket.removeListener("timeout", this._onSocketTimeout);
    socket.removeListener("close", this._onSocketClose);
    socket.removeListener("end", this._onSocketEnd);
    socket.removeListener("error", this._onConnectionSocketError);
    socket.removeListener("error", this._onSocketError);
    socket.on("error", this._onSocketError);
    socket.on("data", this._onSocketData);
    socket.once("close", this._onSocketClose);
    socket.once("end", this._onSocketEnd);
    socket.setTimeout(this.options.socketTimeout || SOCKET_TIMEOUT);
    socket.on("timeout", this._onSocketTimeout);
    if (typeof socket.setKeepAlive === "function") {
      socket.setKeepAlive(true, KEEPALIVE_DELAY);
    }
    if (typeof socket.setNoDelay === "function") {
      socket.setNoDelay(true);
    }
    this._startPhase(this._remainingSetupTime(), timeoutError("Greeting never received", "GREETING_TIMEOUT"));
    this._responseActions.push(this._actionGreeting);
    socket.resume();
  }
  /**
   * Ends the session after a 421 reply. The replies queued for commands sent along with the
   * answered one are not going to come, so the message in flight is failed here
   *
   * @param str The 421 reply
   * @internal
   */
  _onServerClosing(str) {
    if (this._destroyed) {
      return;
    }
    const pendingSend = this._pendingSend;
    const envelope = this._envelope;
    this._responseActions = [];
    this.close();
    if (pendingSend) {
      pendingSend.callback(envelope && envelope.mailError || this._formatError("Server closed the connection", "ECONNECTION", str, "CONN"));
    }
  }
  /**
   * 'data' listener for data coming from the server
   *
   * @event
   * @param chunk Data chunk coming from the server
   * @internal
   */
  _onData(chunk) {
    if (this._destroyed || !chunk || !chunk.length) {
      return;
    }
    const maxResponseSize = this.options.maxResponseSize || MAX_RESPONSE_SIZE;
    const data = chunk.toString("binary");
    if (!data.includes("\n")) {
      this._remainder += data;
      if (this._remainder.length > maxResponseSize) {
        return this._onResponseTooLarge();
      }
      return;
    }
    const lines = (this._remainder + data).split(/\r?\n/);
    this._remainder = lines.pop();
    for (let i = 0, len = lines.length; i < len; i++) {
      if (this._responsePartial) {
        this._responseQueue[this._responseQueue.length - 1] += "\n" + lines[i];
      } else {
        this._responseQueue.push(lines[i]);
      }
      this._responsePartial = isPartialLine(lines[i]);
      if (this._responsePartial && this._responseQueue[this._responseQueue.length - 1].length > maxResponseSize) {
        return this._onResponseTooLarge();
      }
    }
    if (this._remainder.length > maxResponseSize) {
      return this._onResponseTooLarge();
    }
    if (this._responsePartial) {
      return;
    }
    this._processResponse();
  }
  /**
   * Drops a connection whose peer keeps extending a reply it never completes, releasing
   * whatever was buffered for that reply
   * @internal
   */
  _onResponseTooLarge() {
    this._remainder = "";
    this._responseQueue = [];
    this._responsePartial = false;
    this._onError(new Error("Server response exceeds maximum allowed size"), "EPROTOCOL", false, "CONN");
  }
  /**
   * 'error' listener for the socket
   *
   * @event
   * @param err Error object
   * @param type Error name
   * @param data Server response that triggered the error, false if there is none
   * @param command SMTP command that was in flight
   * @internal
   */
  _onError(err, type, data, command) {
    this._clearPhase();
    if (this._destroyed) {
      return;
    }
    err = this._formatError(err, type, data, command);
    if (isTransientError(err)) {
      this.logger.warn({ tnx: "smtp", err }, "%s", err.message);
    } else {
      this.logger.error({ tnx: "smtp", err }, "%s", err.message);
    }
    const pendingSend = this._pendingSend;
    this.emit("error", err);
    this.close();
    if (pendingSend) {
      pendingSend.callback(err);
    }
  }
  /** @internal */
  _formatError(message, type, response, command) {
    let err;
    if (/Error\]$/i.test(Object.prototype.toString.call(message))) {
      err = message;
    } else {
      err = new Error(message);
    }
    if (type && type !== "Error" && err.code !== ERR_ACCESS_DENIED) {
      if (err.code && err.code !== type && !err.originalCode) {
        err.originalCode = err.code;
      }
      err.code = type;
    }
    if (response) {
      err.response = response;
      err.message += ": " + response;
    }
    const responseCode = typeof response === "string" && Number((response.match(/^\d+/) || [])[0]) || false;
    if (responseCode) {
      err.responseCode = responseCode;
    }
    if (command) {
      err.command = command;
    }
    return err;
  }
  /**
   * 'close' listener for the socket
   *
   * @event
   * @internal
   */
  _onClose() {
    let serverResponse = false;
    if (this._remainder && this._remainder.trim()) {
      this.lastServerResponse = serverResponse = decodeServerResponse(this._remainder.trim());
      if (this.options.debug || this.options.transactionLog) {
        this.logger.debug({
          tnx: "server"
        }, serverResponse);
      }
    }
    this.logger.info({
      tnx: "network"
    }, "Connection closed");
    const failureResponse = typeof serverResponse === "string" && /^[45]\d{2}[ -]/.test(serverResponse) ? serverResponse : false;
    if (this.upgrading && !this._destroyed) {
      return this._onError(new Error("Connection closed unexpectedly"), "ETLS", failureResponse, "CONN");
    }
    if (!failureResponse && this._responseActions[0] === this._actionGreeting && this._connectCallback && !this._destroyed) {
      const connectCallback = this._connectCallback;
      this._connectCallback = false;
      const err = this._formatError(new Error("Connection closed unexpectedly"), "ECONNECTION", false, "CONN");
      this.logger.warn({ tnx: "network" }, err.message);
      connectCallback(err);
      this.close();
      return;
    }
    if (!failureResponse && this.stage === "connected" && !this._responseActions.length && !this._pendingSend && !this._destroyed && !this._closing) {
      this.logger.info({
        tnx: "network"
      }, "Server closed the idle connection");
      return this._destroy();
    }
    if (failureResponse || this._responseActions[0] !== this.close && !this._destroyed) {
      return this._onError(new Error("Connection closed unexpectedly"), "ECONNECTION", failureResponse, "CONN");
    }
    this._destroy();
  }
  /**
   * 'end' listener for the socket
   *
   * @event
   * @internal
   */
  _onEnd() {
    if (this._socket && !this._socket.destroyed) {
      this._socket.end();
    }
  }
  /**
   * 'timeout' listener for the socket
   *
   * @event
   * @internal
   */
  _onTimeout() {
    return this._onError(timeoutError("Timeout", "SOCKET_TIMEOUT"), "ETIMEDOUT", false, "CONN");
  }
  /**
   * Destroys the client, emits 'end'
   * @internal
   */
  _destroy() {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;
    this.destroyed = true;
    this._clearPhase();
    this.emit("end");
  }
  /**
   * Upgrades the connection to TLS
   *
   * @param callback Callback function to run when the connection
   *        has been secured
   * @internal
   */
  _upgradeConnection(callback) {
    const discarded = this._remainder.length + this._responseQueue.reduce((total, response) => total + response.length, 0);
    if (discarded) {
      this.logger.warn({
        tnx: "smtp",
        discarded
      }, "Discarded %s bytes received in plaintext after the STARTTLS response", discarded);
    }
    this._plaintextEhlo = false;
    this._remainder = "";
    this._responseQueue = [];
    this._responsePartial = false;
    const socketPlain = this._socket;
    socketPlain.removeListener("data", this._onSocketData);
    socketPlain.removeListener("timeout", this._onSocketTimeout);
    socketPlain.setTimeout(0);
    const opts = Object.assign({
      socket: socketPlain,
      host: this.host
    }, this.options.tls || {});
    if (this.servername && !opts.servername) {
      opts.servername = this.servername;
    }
    const removePlainSocketListeners = () => {
      socketPlain.removeListener("close", this._onSocketClose);
      socketPlain.removeListener("end", this._onSocketEnd);
      socketPlain.removeListener("error", this._onSocketError);
      socketPlain.removeListener("error", this._onConnectionSocketError);
    };
    this.upgrading = true;
    this._startPhase(this._remainingSetupTime(), timeoutError("TLS handshake timed out", "UPGRADE_TIMEOUT"));
    try {
      this._socket = import_node_tls2.default.connect(opts, () => {
        this._clearPhase();
        this.secure = true;
        this.upgrading = false;
        this._socket.on("data", this._onSocketData);
        removePlainSocketListeners();
        return callback(null, true);
      });
    } catch (err) {
      this._clearPhase();
      removePlainSocketListeners();
      return callback(err);
    }
    this._socket.on("error", this._onSocketError);
    this._socket.once("close", this._onSocketClose);
    this._socket.once("end", this._onSocketEnd);
    this._socket.setTimeout(this.options.socketTimeout || SOCKET_TIMEOUT);
    this._socket.on("timeout", this._onSocketTimeout);
    socketPlain.resume();
  }
  /**
   * Processes queued responses from the server
   * @internal
   */
  _processResponse() {
    if (!this._responseQueue.length) {
      return false;
    }
    const raw = (this._responseQueue.shift() || "").toString();
    if (!raw.trim()) {
      setImmediate(() => this._processResponse());
      return;
    }
    if (isPartialResponse(raw)) {
      this._responseQueue.unshift(raw);
      return;
    }
    const str = this.lastServerResponse = decodeServerResponse(raw);
    if (this.options.debug || this.options.transactionLog) {
      this.logger.debug({
        tnx: "server"
      }, str.replace(/\r?\n$/, ""));
    }
    const action = this._responseActions.shift();
    const closing = /^421[ -]/.test(str);
    if (typeof action === "function") {
      action.call(this, str);
      if (closing) {
        return this._onServerClosing(str);
      }
      setImmediate(() => this._processResponse());
    } else if (closing && !this._pendingSend && this.stage === "connected") {
      this.logger.info({
        tnx: "smtp"
      }, "Server closed the idle connection: %s", str);
      this.close();
    } else {
      return this._onError(new Error("Unexpected Response"), "EPROTOCOL", str, "CONN");
    }
  }
  /**
   * Send a command to the server, append \r\n
   *
   * @param str String to be sent to the server
   * @param logStr Optional string to be used for logging instead of the actual string
   * @internal
   */
  _sendCommand(str, logStr) {
    if (this._destroyed) {
      return;
    }
    const socket = this._socket;
    if (socket.destroyed) {
      return this.close();
    }
    if (this.options.debug || this.options.transactionLog) {
      this.logger.debug({
        tnx: "client"
      }, (logStr || str || "").toString().replace(/\r?\n$/, ""));
    }
    socket.write(Buffer.from(str + "\r\n", "utf-8"));
  }
  /**
   * Initiates a new message by submitting envelope data, starting with
   * MAIL FROM: command
   *
   * @param envelope Envelope object in the form of
   *        {from:'...', to:['...']}
   *        or
   *        {from:{address:'...',name:'...'}, to:[address:'...',name:'...']}
   * @param callback Callback to run once the envelope is processed
   * @internal
   */
  _setEnvelope(envelope, callback) {
    const args = [];
    let useSmtpUtf8 = false;
    this._envelope = envelope || {};
    this._envelope.from = (this._envelope.from && this._envelope.from.address || this._envelope.from || "").toString().trim();
    this._envelope.to = [].concat(this._envelope.to || []).map((to) => (to && to.address || to || "").toString().trim());
    if (!this._envelope.to.length) {
      return callback(this._formatError("No recipients defined", "EENVELOPE", false, "API"));
    }
    if (this._envelope.from && /[\r\n<>]/.test(this._envelope.from)) {
      return callback(this._formatError("Invalid sender " + JSON.stringify(this._envelope.from), "EENVELOPE", false, "API"));
    }
    if (/[\x80-\uFFFF]/.test(this._envelope.from)) {
      useSmtpUtf8 = true;
    }
    for (let i = 0, len = this._envelope.to.length; i < len; i++) {
      if (!this._envelope.to[i] || /[\r\n<>]/.test(this._envelope.to[i])) {
        return callback(this._formatError("Invalid recipient " + JSON.stringify(this._envelope.to[i]), "EENVELOPE", false, "API"));
      }
      if (/[\x80-\uFFFF]/.test(this._envelope.to[i])) {
        useSmtpUtf8 = true;
      }
    }
    this._envelope.rcptQueue = [].concat(this._envelope.to || []);
    this._envelope.rejected = [];
    this._envelope.rejectedErrors = [];
    this._envelope.accepted = [];
    if (this._envelope.dsn) {
      try {
        this._envelope.dsn = this._setDsnEnvelope(this._envelope.dsn);
      } catch (err) {
        return callback(this._formatError("Invalid DSN " + err.message, "EENVELOPE", false, "API"));
      }
    }
    if (this._envelope.requireTLSExtensionEnabled) {
      if (!this.secure) {
        return callback(this._formatError("REQUIRETLS can only be used over TLS connections (RFC 8689)", "EREQUIRETLS", false, "MAIL FROM"));
      }
      if (!this._supportedExtensions.includes("REQUIRETLS")) {
        return callback(this._formatError("Server does not support REQUIRETLS extension (RFC 8689)", "EREQUIRETLS", false, "MAIL FROM"));
      }
    }
    this._envelope.pipelined = this._supportedExtensions.includes("PIPELINING");
    this._responseActions.push((str) => {
      this._actionMAIL(str, callback);
    });
    if (useSmtpUtf8 && this._supportedExtensions.includes("SMTPUTF8")) {
      args.push("SMTPUTF8");
      this._usingSmtpUtf8 = true;
    }
    if (this._envelope.use8BitMime && this._supportedExtensions.includes("8BITMIME")) {
      args.push("BODY=8BITMIME");
      this._using8BitMime = true;
    }
    if (this._envelope.size && this._supportedExtensions.includes("SIZE")) {
      const sizeValue = Number(this._envelope.size) || 0;
      if (sizeValue > 0) {
        args.push("SIZE=" + sizeValue);
      }
    }
    if (this._envelope.dsn && this._supportedExtensions.includes("DSN")) {
      if (this._envelope.dsn.ret) {
        args.push("RET=" + encodeXText(this._envelope.dsn.ret));
      }
      if (this._envelope.dsn.envid) {
        args.push("ENVID=" + encodeXText(this._envelope.dsn.envid));
      }
    }
    if (this._envelope.requireTLSExtensionEnabled) {
      args.push("REQUIRETLS");
    }
    const mailFrom = "MAIL FROM:<" + this._envelope.from + ">" + (args.length ? " " + args.join(" ") : "");
    this._recipientQueue = [];
    if (!this._envelope.pipelined) {
      this._sendCommand(mailFrom);
      return;
    }
    const socket = this._socket;
    socket.cork();
    this._sendCommand(mailFrom);
    while (this._envelope.rcptQueue.length) {
      this._sendRcpt(this._envelope.rcptQueue.shift(), callback);
    }
    this._responseActions.push((str) => {
      this._actionDATA(str, callback);
    });
    this._sendCommand("DATA");
    socket.uncork();
  }
  /**
   * Sends RCPT TO for a recipient and queues the handler for the reply
   *
   * @param recipient Recipient address
   * @param callback Callback to run once the envelope is processed
   * @internal
   */
  _sendRcpt(recipient, callback) {
    this._recipientQueue.push(recipient);
    this._responseActions.push((str) => {
      this._actionRCPT(str, callback);
    });
    this._sendCommand("RCPT TO:<" + recipient + ">" + this._getDsnRcptToArgs());
  }
  /** @internal */
  _setDsnEnvelope(params) {
    let ret = (params.ret || params.return || "").toString().toUpperCase() || null;
    if (ret) {
      switch (ret) {
        case "HDRS":
        case "HEADERS":
          ret = "HDRS";
          break;
        case "FULL":
        case "BODY":
          ret = "FULL";
          break;
      }
    }
    if (ret && !["FULL", "HDRS"].includes(ret)) {
      throw new Error("ret: " + JSON.stringify(ret));
    }
    const envid = (params.envid || params.id || "").toString() || null;
    let notify = params.notify || null;
    if (notify) {
      if (typeof notify === "string") {
        notify = notify.split(",");
      }
      notify = notify.map((n) => n.trim().toUpperCase());
      const validNotify = ["NEVER", "SUCCESS", "FAILURE", "DELAY"];
      const invalidNotify = notify.filter((n) => !validNotify.includes(n));
      if (invalidNotify.length || notify.length > 1 && notify.includes("NEVER")) {
        throw new Error("notify: " + JSON.stringify(notify.join(",")));
      }
      notify = notify.join(",");
    }
    let orcpt = (params.recipient || params.orcpt || "").toString() || null;
    if (orcpt && orcpt.indexOf(";") < 0) {
      orcpt = "rfc822;" + orcpt;
    }
    return {
      ret,
      envid,
      notify,
      orcpt
    };
  }
  /** @internal */
  _getDsnRcptToArgs() {
    const envelope = this._envelope;
    const args = [];
    if (envelope.dsn && this._supportedExtensions.includes("DSN")) {
      if (envelope.dsn.notify) {
        args.push("NOTIFY=" + encodeXText(envelope.dsn.notify));
      }
      if (envelope.dsn.orcpt) {
        args.push("ORCPT=" + encodeXText(envelope.dsn.orcpt));
      }
    }
    return args.length ? " " + args.join(" ") : "";
  }
  /** @internal */
  _createSendStream(callback) {
    const envelope = this._envelope;
    const dataStream = new DataStream();
    if (this.options.lmtp) {
      envelope.accepted.forEach((recipient, i) => {
        const final = i === envelope.accepted.length - 1;
        this._responseActions.push((str) => {
          this._actionLMTPStream(recipient, final, str, callback);
        });
      });
    } else {
      this._responseActions.push((str) => {
        this._actionSMTPStream(str, callback);
      });
    }
    this._currentDataStream = dataStream;
    dataStream.pipe(this._socket, {
      end: false
    });
    if (this.options.debug) {
      const logStream = new import_node_stream13.PassThrough();
      logStream.on("readable", () => {
        let chunk;
        while (chunk = logStream.read()) {
          this.logger.debug({
            tnx: "message"
          }, chunk.toString("binary").replace(/\r?\n$/, ""));
        }
      });
      dataStream.pipe(logStream);
    }
    dataStream.once("end", () => {
      if (this._currentDataStream === dataStream) {
        this._currentDataStream = false;
      }
      this.logger.info({
        tnx: "message",
        inByteCount: dataStream.inByteCount,
        outByteCount: dataStream.outByteCount
      }, "<%s bytes encoded mime message (source size %s bytes)>", dataStream.outByteCount, dataStream.inByteCount);
    });
    return dataStream;
  }
  /** ACTIONS **/
  /**
   * Will be run after the connection is created and the server sends
   * a greeting. If the incoming message starts with 220 initiate
   * SMTP session by sending EHLO command
   *
   * @param str Message from the server
   * @internal
   */
  _actionGreeting(str) {
    this._clearPhase();
    if (str.substr(0, 3) !== "220") {
      this._onError(new Error("Invalid greeting. response=" + str), "EPROTOCOL", str, "CONN");
      return;
    }
    if (this.options.lmtp) {
      this._responseActions.push(this._actionLHLO);
      this._sendCommand("LHLO " + this.name);
    } else {
      this._responseActions.push(this._actionEHLO);
      this._sendCommand("EHLO " + this.name);
    }
  }
  /**
   * Handles server response for LHLO command. If it yielded in
   * error, emit 'error', otherwise treat this as an EHLO response
   *
   * @param str Message from the server
   * @internal
   */
  _actionLHLO(str) {
    if (str.charAt(0) !== "2") {
      this._onError(new Error("Invalid LHLO. response=" + str), "EPROTOCOL", str, "LHLO");
      return;
    }
    this._actionEHLO(str);
  }
  /**
   * Handles server response for EHLO command. If it yielded in
   * error, try HELO instead, otherwise initiate TLS negotiation
   * if STARTTLS is supported by the server or move into the
   * authentication phase.
   *
   * @param str Message from the server
   * @internal
   */
  _actionEHLO(str) {
    if (str.substr(0, 3) === "421") {
      this._onError(new Error("Server terminates connection. response=" + str), "ECONNECTION", str, "EHLO");
      return;
    }
    if (str.charAt(0) !== "2") {
      if (this.options.requireTLS) {
        this._onError(new Error("EHLO failed but HELO does not support required STARTTLS. response=" + str), "ECONNECTION", str, "EHLO");
        return;
      }
      this._responseActions.push(this._actionHELO);
      this._sendCommand("HELO " + this.name);
      return;
    }
    if (!this.secure && !this.options.ignoreTLS && (/[ -]STARTTLS\b/im.test(str) || this.options.requireTLS)) {
      this._plaintextEhlo = str;
      this._sendCommand("STARTTLS");
      this._responseActions.push(this._actionSTARTTLS);
      return;
    }
    this._parseEhloExtensions(str);
    this.emit("connect");
  }
  /**
   * Reads the extensions and the authentication mechanisms out of an EHLO response
   *
   * @param str EHLO response from the server
   * @internal
   */
  _parseEhloExtensions(str) {
    let match;
    this._ehloLines = str.split(/\r?\n/).map((line) => line.replace(/^\d+[ -]/, "").trim()).filter((line) => line).slice(1);
    if (/[ -]SMTPUTF8\b/im.test(str)) {
      this._supportedExtensions.push("SMTPUTF8");
    }
    if (/[ -]DSN\b/im.test(str)) {
      this._supportedExtensions.push("DSN");
    }
    if (/[ -]8BITMIME\b/im.test(str)) {
      this._supportedExtensions.push("8BITMIME");
    }
    if (/[ -]REQUIRETLS\b/im.test(str)) {
      this._supportedExtensions.push("REQUIRETLS");
    }
    if (/[ -]PIPELINING\b/im.test(str)) {
      this._supportedExtensions.push("PIPELINING");
    }
    if (/[ -]AUTH\b/i.test(str)) {
      this.allowsAuth = true;
    }
    const authMechanisms = /* @__PURE__ */ new Set();
    for (const line of this._ehloLines) {
      const authMatch = /^AUTH[\s=](.*)/i.exec(line);
      if (authMatch) {
        for (const mechanism of authMatch[1].split(/[\s=]+/)) {
          authMechanisms.add(mechanism.toUpperCase());
        }
      }
    }
    for (const mechanism of ["PLAIN", "LOGIN", "CRAM-MD5", "XOAUTH2"]) {
      if (authMechanisms.has(mechanism)) {
        this._supportedAuth.push(mechanism);
      }
    }
    if (match = str.match(/[ -]SIZE(?:[ \t]+(\d+))?/im)) {
      this._supportedExtensions.push("SIZE");
      this._maxAllowedSize = Number(match[1]) || 0;
    }
  }
  /**
   * Handles server response for HELO command. If it yielded in
   * error, emit 'error', otherwise move into the authentication phase.
   *
   * @param str Message from the server
   * @internal
   */
  _actionHELO(str) {
    if (str.charAt(0) !== "2") {
      this._onError(new Error("Invalid HELO. response=" + str), "EPROTOCOL", str, "HELO");
      return;
    }
    this.allowsAuth = true;
    this.emit("connect");
  }
  /**
   * Handles server response for STARTTLS command. If there's an error
   * try HELO instead, otherwise initiate TLS upgrade. If the upgrade
   * succeedes restart the EHLO
   *
   * @param str Message from the server
   * @internal
   */
  _actionSTARTTLS(str) {
    if (str.charAt(0) !== "2") {
      if (this.options.opportunisticTLS) {
        this.logger.info({
          tnx: "smtp"
        }, "Failed STARTTLS upgrade, continuing unencrypted");
        if (this._plaintextEhlo) {
          this._parseEhloExtensions(this._plaintextEhlo);
          this._plaintextEhlo = false;
          this.allowsAuth = false;
          this._supportedAuth = [];
        }
        this.emit("connect");
        return;
      }
      this._onError(new Error("Error upgrading connection with STARTTLS"), "ETLS", str, "STARTTLS");
      return;
    }
    this._upgradeConnection((err, secured) => {
      if (err) {
        this._onError(new Error("Error initiating TLS - " + (err.message || err)), "ETLS", false, "STARTTLS");
        return;
      }
      this.logger.info({
        tnx: "smtp"
      }, "Connection upgraded with STARTTLS");
      if (secured) {
        if (this.options.lmtp) {
          this._responseActions.push(this._actionLHLO);
          this._sendCommand("LHLO " + this.name);
        } else {
          this._responseActions.push(this._actionEHLO);
          this._sendCommand("EHLO " + this.name);
        }
      } else {
        this.emit("connect");
      }
    });
  }
  /**
   * Handle the response for AUTH LOGIN command. We are expecting
   * '334 VXNlcm5hbWU6' (base64 for 'Username:'). Data to be sent as
   * response needs to be base64 encoded username. We do not need
   * exact match but settle with 334 response in general as some
   * hosts invalidly use a longer message than VXNlcm5hbWU6
   *
   * @param str Message from the server
   * @param callback Callback to run once the authentication sequence completes
   * @internal
   */
  _actionAUTH_LOGIN_USER(str, callback) {
    if (!/^334[ -]/.test(str)) {
      callback(this._formatError('Invalid login sequence while waiting for "334 VXNlcm5hbWU6"', "EAUTH", str, "AUTH LOGIN"));
      return;
    }
    this._responseActions.push((str2) => {
      this._actionAUTH_LOGIN_PASS(str2, callback);
    });
    this._sendCommand(Buffer.from(this._auth.credentials.user + "", "utf-8").toString("base64"));
  }
  /**
   * Handle the response for AUTH CRAM-MD5 command. We are expecting
   * '334 <challenge string>'. Data to be sent as response needs to be
   * base64 decoded challenge string, MD5 hashed using the password as
   * a HMAC key, prefixed by the username and a space, and finally all
   * base64 encoded again.
   *
   * @param str Message from the server
   * @param callback Callback to run once the authentication sequence completes
   * @internal
   */
  _actionAUTH_CRAM_MD5(str, callback) {
    const challengeMatch = str.match(/^334\s+(.+)$/);
    if (!challengeMatch) {
      return callback(this._formatError("Invalid login sequence while waiting for server challenge string", "EAUTH", str, "AUTH CRAM-MD5"));
    }
    const base64decoded = Buffer.from(challengeMatch[1], "base64").toString("ascii");
    const hmacMD5 = import_node_crypto6.default.createHmac("md5", this._auth.credentials.pass);
    hmacMD5.update(base64decoded);
    const prepended = this._auth.credentials.user + " " + hmacMD5.digest("hex");
    this._responseActions.push((str2) => {
      this._actionAUTH_CRAM_MD5_PASS(str2, callback);
    });
    this._sendCommand(
      Buffer.from(prepended).toString("base64"),
      // hidden hash for logs
      Buffer.from(this._auth.credentials.user + " /* secret */").toString("base64")
    );
  }
  /**
   * Handles the response to CRAM-MD5 authentication, if there's no error,
   * the user can be considered logged in. Start waiting for a message to send
   *
   * @param str Message from the server
   * @param callback Callback to run once the authentication sequence completes
   * @internal
   */
  _actionAUTH_CRAM_MD5_PASS(str, callback) {
    if (!str.match(/^235\s+/)) {
      return callback(this._formatError('Invalid login sequence while waiting for "235"', "EAUTH", str, "AUTH CRAM-MD5"));
    }
    this.logger.info({
      tnx: "smtp",
      username: this._auth.user,
      action: "authenticated",
      method: this._authMethod
    }, "User %s authenticated", JSON.stringify(this._auth.user));
    this.authenticated = true;
    callback(null, true);
  }
  /**
   * Handle the response for AUTH LOGIN command. We are expecting
   * '334 UGFzc3dvcmQ6' (base64 for 'Password:'). Data to be sent as
   * response needs to be base64 encoded password.
   *
   * @param str Message from the server
   * @param callback Callback to run once the authentication sequence completes
   * @internal
   */
  _actionAUTH_LOGIN_PASS(str, callback) {
    if (!/^334[ -]/.test(str)) {
      return callback(this._formatError('Invalid login sequence while waiting for "334 UGFzc3dvcmQ6"', "EAUTH", str, "AUTH LOGIN"));
    }
    this._responseActions.push((str2) => {
      this._actionAUTHComplete(str2, callback);
    });
    this._sendCommand(
      Buffer.from((this._auth.credentials.pass || "").toString(), "utf-8").toString("base64"),
      // Hidden pass for logs
      Buffer.from("/* secret */", "utf-8").toString("base64")
    );
  }
  /**
   * Handles the response for authentication, if there's no error,
   * the user can be considered logged in. Start waiting for a message to send
   *
   * @param str Message from the server
   * @param isRetry True if this is a retry after a failed login, or the callback itself
   * @param [callback] Callback to run once the authentication sequence completes
   * @internal
   */
  _actionAUTHComplete(str, isRetry, callback) {
    if (!callback && typeof isRetry === "function") {
      callback = isRetry;
      isRetry = false;
    }
    if (str.substr(0, 3) === "334") {
      this._responseActions.push((str2) => {
        if (isRetry || this._authMethod !== "XOAUTH2") {
          this._actionAUTHComplete(str2, true, callback);
        } else {
          setImmediate(() => this._handleXOauth2Token(true, callback));
        }
      });
      this._sendCommand("");
      return;
    }
    if (str.charAt(0) !== "2") {
      this.logger.info({
        tnx: "smtp",
        username: this._auth.user,
        action: "authfail",
        method: this._authMethod
      }, "User %s failed to authenticate", JSON.stringify(this._auth.user));
      return callback(this._formatError("Invalid login", "EAUTH", str, "AUTH " + this._authMethod));
    }
    this.logger.info({
      tnx: "smtp",
      username: this._auth.user,
      action: "authenticated",
      method: this._authMethod
    }, "User %s authenticated", JSON.stringify(this._auth.user));
    this.authenticated = true;
    callback(null, true);
  }
  /**
   * Handle response for a MAIL FROM: command
   *
   * @param str Message from the server
   * @param callback Callback to run once the envelope is processed
   * @internal
   */
  _actionMAIL(str, callback) {
    const envelope = this._envelope;
    if (Number(str.charAt(0)) !== 2) {
      const message = this._usingSmtpUtf8 && /^550 /.test(str) && /[\x80-\uFFFF]/.test(envelope.from) ? "Internationalized mailbox name not allowed" : "Mail command failed";
      envelope.mailError = this._formatError(message, "EENVELOPE", str, "MAIL FROM");
    }
    this._advanceEnvelope(str, callback);
  }
  /**
   * Handle response for a RCPT TO: command
   *
   * @param str Message from the server
   * @param callback Callback to run once the envelope is processed
   * @internal
   */
  _actionRCPT(str, callback) {
    const envelope = this._envelope;
    let err;
    const curRecipient = this._recipientQueue.shift();
    if (Number(str.charAt(0)) !== 2) {
      const message = this._usingSmtpUtf8 && /^553 /.test(str) && /[\x80-\uFFFF]/.test(curRecipient) ? "Internationalized mailbox name not allowed" : "Recipient command failed";
      envelope.rejected.push(curRecipient);
      err = this._formatError(message, "EENVELOPE", str, "RCPT TO");
      err.recipient = curRecipient;
      envelope.rejectedErrors.push(err);
    } else {
      envelope.accepted.push(curRecipient);
    }
    this._advanceEnvelope(str, callback);
  }
  /**
   * Moves the envelope on after a reply to MAIL FROM or RCPT TO. A pipelined envelope sent every
   * command at once and is decided by the reply to DATA. Otherwise the commands go one at a
   * time: the next recipient, or once every reply is in, DATA or the error that ends the message
   *
   * @param str The reply that was handled
   * @param callback Callback to run once the envelope is processed
   * @internal
   */
  _advanceEnvelope(str, callback) {
    const envelope = this._envelope;
    if (envelope.pipelined) {
      return;
    }
    if (envelope.mailError) {
      return callback(envelope.mailError);
    }
    if (envelope.rcptQueue.length) {
      return this._sendRcpt(envelope.rcptQueue.shift(), callback);
    }
    if (this._recipientQueue.length) {
      return;
    }
    const err = this._envelopeError(str);
    if (err) {
      return callback(err);
    }
    this._responseActions.push((str2) => {
      this._actionDATA(str2, callback);
    });
    this._sendCommand("DATA");
  }
  /**
   * Decides how the envelope went once every reply to MAIL FROM and RCPT TO is in. Called after
   * the last RCPT TO reply, or with PIPELINING on the reply to the DATA command sent along
   *
   * @param str The reply being handled
   * @returns The error to fail the message with, or null when DATA can go ahead
   * @internal
   */
  _envelopeError(str) {
    const envelope = this._envelope;
    if (envelope.mailError) {
      return envelope.mailError;
    }
    if (envelope.accepted.length) {
      return null;
    }
    const deferred = envelope.rejectedErrors.find((rejectedErr) => rejectedErr.responseCode && rejectedErr.responseCode < 500);
    const lastRejected = envelope.rejectedErrors[envelope.rejectedErrors.length - 1];
    const reply2 = deferred?.response ?? (envelope.pipelined && lastRejected ? lastRejected.response : str);
    const err = this._formatError("Can't send mail - all recipients were rejected", "EENVELOPE", reply2, "RCPT TO");
    err.rejected = envelope.rejected;
    err.rejectedErrors = envelope.rejectedErrors;
    return err;
  }
  /**
   * Handle response for a DATA command
   *
   * @param str Message from the server
   * @param callback Callback to run once the envelope is processed
   * @internal
   */
  _actionDATA(str, callback) {
    const envelope = this._envelope;
    if (envelope.pipelined) {
      const err = this._envelopeError(str);
      if (err) {
        if (/^3/.test(str)) {
          if (envelope.mailError) {
            this.close();
            return callback(err);
          }
          this._responseActions.push(() => callback(err));
          this._sendCommand(".");
          return;
        }
        return callback(err);
      }
    }
    if (!/^[23]/.test(str)) {
      return callback(this._formatError("Data command failed", "EENVELOPE", str, "DATA"));
    }
    const response = {
      accepted: envelope.accepted,
      rejected: envelope.rejected
    };
    if (this._ehloLines && this._ehloLines.length) {
      response.ehlo = this._ehloLines;
    }
    if (envelope.rejectedErrors.length) {
      response.rejectedErrors = envelope.rejectedErrors;
    }
    callback(null, response);
  }
  /**
   * Handle response for a DATA stream when using SMTP
   * We expect a single response that defines if the sending succeeded or failed
   *
   * @param str Message from the server
   * @param callback Callback to run with the final send result
   * @internal
   */
  _actionSMTPStream(str, callback) {
    if (Number(str.charAt(0)) !== 2) {
      return callback(this._formatError("Message failed", "EMESSAGE", str, "DATA"));
    }
    return callback(null, str);
  }
  /**
   * Handle response for a DATA stream
   * We expect a separate response for every recipient. All recipients can either
   * succeed or fail separately
   *
   * @param recipient The recipient this response applies to
   * @param final Is this the final recipient?
   * @param str Message from the server
   * @param callback Callback to run with the final send result
   * @internal
   */
  _actionLMTPStream(recipient, final, str, callback) {
    const envelope = this._envelope;
    let err;
    if (Number(str.charAt(0)) !== 2) {
      err = this._formatError("Message failed for recipient " + recipient, "EMESSAGE", str, "DATA");
      err.recipient = recipient;
      envelope.rejected.push(recipient);
      envelope.rejectedErrors.push(err);
      for (let i = 0, len = envelope.accepted.length; i < len; i++) {
        if (envelope.accepted[i] === recipient) {
          envelope.accepted.splice(i, 1);
        }
      }
    }
    if (final) {
      return callback(null, str);
    }
  }
  /** @internal */
  _handleXOauth2Token(isRetry, callback) {
    this._auth.oauth2.getToken(isRetry, (err, accessToken) => {
      if (err) {
        this.logger.info({
          tnx: "smtp",
          username: this._auth.user,
          action: "authfail",
          method: this._authMethod
        }, "User %s failed to authenticate", JSON.stringify(this._auth.user));
        return callback(this._formatError(err, "EAUTH", false, "AUTH XOAUTH2"));
      }
      this._responseActions.push((str) => {
        this._actionAUTHComplete(str, isRetry, callback);
      });
      this._sendCommand(
        "AUTH XOAUTH2 " + this._auth.oauth2.buildXOAuth2Token(accessToken),
        //  Hidden for logs
        "AUTH XOAUTH2 " + this._auth.oauth2.buildXOAuth2Token("/* secret */")
      );
    });
  }
  /**
   *
   * @param command
   * @internal
   */
  _isDestroyedMessage(command) {
    if (this._destroyed) {
      return "Cannot " + command + " - smtp connection is already destroyed.";
    }
    if (this._socket) {
      if (this._socket.destroyed) {
        return "Cannot " + command + " - smtp connection socket is already destroyed.";
      }
      if (!this._socket.writable) {
        return "Cannot " + command + " - smtp connection socket is already half-closed.";
      }
    }
  }
  /** @internal */
  _getHostname() {
    let defaultHostname;
    try {
      defaultHostname = import_node_os2.default.hostname() || "";
    } catch (_err) {
      defaultHostname = "localhost";
    }
    if (!defaultHostname || defaultHostname.indexOf(".") < 0) {
      defaultHostname = "[127.0.0.1]";
    }
    if (defaultHostname.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
      defaultHostname = "[" + defaultHostname + "]";
    }
    return defaultHostname;
  }
};
var smtp_connection_default = SMTPConnection;

// node_modules/nodemailer/dist/esm/xoauth2/index.js
var import_node_stream14 = require("node:stream");
var import_node_crypto7 = __toESM(require("node:crypto"), 1);
var XOAuth2 = class extends import_node_stream14.Stream {
  constructor(options, logger) {
    super();
    this.options = options || {};
    this.configError = false;
    if (options && options.serviceClient) {
      if (!options.privateKey || !options.user) {
        const err = new Error('Options "privateKey" and "user" are required for service account!');
        err.code = EOAUTH2;
        this.configError = err;
      }
      const serviceRequestTimeout = Math.min(Math.max(Number(this.options.serviceRequestTimeout) || 0, 0), 3600);
      this.options.serviceRequestTimeout = serviceRequestTimeout || 5 * 60;
    }
    this.logger = getLogger({
      logger
    }, {
      component: this.options.component || "OAuth2"
    });
    this.provisionCallback = typeof this.options.provisionCallback === "function" ? this.options.provisionCallback : false;
    this.options.accessUrl = this.options.accessUrl || "https://accounts.google.com/o/oauth2/token";
    this.options.customHeaders = this.options.customHeaders || {};
    this.options.customParams = this.options.customParams || {};
    this.accessToken = this.options.accessToken || false;
    if (this.options.expires && Number(this.options.expires)) {
      this.expires = this.options.expires;
    } else {
      const timeout = Math.max(Number(this.options.timeout) || 0, 0);
      this.expires = timeout && Date.now() + timeout * 1e3 || 0;
    }
    this.renewing = false;
    this.renewalQueue = [];
  }
  /**
   * Returns or generates (if previous has expired) a XOAuth2 token
   *
   * @param renew If false then use cached access token (if available)
   * @param callback Callback function with error object and token string
   */
  getToken(renew, callback) {
    const done = callback;
    if (this.configError) {
      return done(this.configError);
    }
    if (!renew && this.accessToken && (!this.expires || this.expires > Date.now())) {
      this.logger.debug({
        tnx: "OAUTH2",
        user: this.options.user,
        action: "reuse"
      }, "Reusing existing access token for %s", this.options.user);
      return callback(null, this.accessToken);
    }
    if (!this.provisionCallback && !this.options.refreshToken && !this.options.serviceClient) {
      if (this.accessToken) {
        this.logger.debug({
          tnx: "OAUTH2",
          user: this.options.user,
          action: "reuse"
        }, "Reusing existing access token (no refresh capability) for %s", this.options.user);
        return callback(null, this.accessToken);
      }
      this.logger.error({
        tnx: "OAUTH2",
        user: this.options.user,
        action: "renew"
      }, "Cannot renew access token for %s: No refresh mechanism available", this.options.user);
      const err = new Error("Can't create new access token for user");
      err.code = EOAUTH2;
      return done(err);
    }
    if (this.renewing) {
      this.renewalQueue.push({ renew, callback: done });
      return;
    }
    this.renewing = true;
    const generateCallback = (err, accessToken) => {
      this.renewalQueue.forEach((item) => item.callback(err, accessToken));
      this.renewalQueue = [];
      this.renewing = false;
      if (err) {
        this.logger.error({
          err,
          tnx: "OAUTH2",
          user: this.options.user,
          action: "renew"
        }, "Failed generating new Access Token for %s", this.options.user);
      } else {
        this.logger.info({
          tnx: "OAUTH2",
          user: this.options.user,
          action: "renew"
        }, "Generated new Access Token for %s", this.options.user);
      }
      done(err, accessToken);
    };
    if (this.provisionCallback) {
      this.provisionCallback(this.options.user, !!renew, (err, accessToken, expires) => {
        if (!err && accessToken) {
          this.accessToken = accessToken;
          this.expires = expires || 0;
        }
        generateCallback(err, accessToken);
      });
    } else {
      this.generateToken(generateCallback);
    }
  }
  /**
   * Updates token values
   *
   * @param accessToken New access token
   * @param timeout Access token lifetime in seconds
   *
   * Emits 'token': { user: User email-address, accessToken: the new accessToken, timeout: TTL in seconds}
   */
  updateToken(accessToken, timeout) {
    this.accessToken = accessToken;
    timeout = Math.max(Number(timeout) || 0, 0);
    this.expires = timeout && Date.now() + timeout * 1e3 || 0;
    this.emit("token", {
      user: this.options.user,
      accessToken: accessToken || "",
      expires: this.expires
    });
  }
  /**
   * Generates a new XOAuth2 token with the credentials provided at initialization
   *
   * @param callback Callback function with error object and token string
   */
  generateToken(callback) {
    const done = callback;
    let urlOptions;
    let loggedUrlOptions;
    if (this.options.serviceClient) {
      const iat = Math.floor(Date.now() / 1e3);
      const tokenData = {
        iss: this.options.serviceClient,
        scope: this.options.scope || "https://mail.google.com/",
        sub: this.options.user,
        aud: this.options.accessUrl,
        iat,
        exp: iat + this.options.serviceRequestTimeout
      };
      let token;
      try {
        token = this.jwtSignRS256(tokenData);
      } catch (_err) {
        const err = new Error("Can't generate token. Check your auth options");
        err.code = EOAUTH2;
        return done(err);
      }
      urlOptions = {
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: token
      };
      loggedUrlOptions = {
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: tokenData
      };
    } else {
      if (!this.options.refreshToken) {
        const err = new Error("Can't create new access token for user");
        err.code = EOAUTH2;
        return done(err);
      }
      urlOptions = {
        client_id: this.options.clientId || "",
        client_secret: this.options.clientSecret || "",
        refresh_token: this.options.refreshToken,
        grant_type: "refresh_token"
      };
      loggedUrlOptions = {
        client_id: this.options.clientId || "",
        client_secret: (this.options.clientSecret || "").substr(0, 6) + "...",
        refresh_token: (this.options.refreshToken || "").substr(0, 6) + "...",
        grant_type: "refresh_token"
      };
    }
    const customParams = this.options.customParams || {};
    Object.assign(urlOptions, customParams);
    for (const key of Object.keys(customParams)) {
      const param = customParams[key];
      loggedUrlOptions[key] = (param === void 0 || param === null ? "" : String(param)).substr(0, 6) + "...";
    }
    this.logger.debug({
      tnx: "OAUTH2",
      user: this.options.user,
      action: "generate"
    }, "Requesting token using: %s", JSON.stringify(loggedUrlOptions));
    this.postRequest(this.options.accessUrl, urlOptions, this.options, (error2, body) => {
      let data;
      if (error2) {
        return done(error2);
      }
      try {
        data = JSON.parse(body.toString());
      } catch (E) {
        return done(E);
      }
      if (!data || typeof data !== "object") {
        this.logger.debug({
          tnx: "OAUTH2",
          user: this.options.user,
          action: "post"
        }, "Response: %s", (body || "").toString());
        const err2 = new Error("Invalid authentication response");
        err2.code = EOAUTH2;
        return done(err2);
      }
      const logData = Object.assign({}, data);
      if (logData.access_token) {
        logData.access_token = (logData.access_token || "").toString().substr(0, 6) + "...";
      }
      this.logger.debug({
        tnx: "OAUTH2",
        user: this.options.user,
        action: "post"
      }, "Response: %s", JSON.stringify(logData));
      if (data.error) {
        let errorMessage = data.error;
        if (data.error_description) {
          errorMessage += ": " + data.error_description;
        }
        if (data.error_uri) {
          errorMessage += " (" + data.error_uri + ")";
        }
        const err2 = new Error(errorMessage);
        err2.code = EOAUTH2;
        return done(err2);
      }
      if (data.access_token) {
        this.updateToken(data.access_token, data.expires_in);
        return callback(null, this.accessToken);
      }
      const err = new Error("No access token");
      err.code = EOAUTH2;
      return done(err);
    });
  }
  /**
   * Converts an access_token and user id into a base64 encoded XOAuth2 token
   *
   * @param [accessToken] Access token string
   * @return Base64 encoded token for IMAP or SMTP login
   */
  buildXOAuth2Token(accessToken) {
    const authData = ["user=" + (this.options.user || ""), "auth=Bearer " + (accessToken || this.accessToken), "", ""];
    return Buffer.from(authData.join(""), "utf-8").toString("base64");
  }
  /**
   * Custom POST request handler.
   * This is only needed to keep paths short in Windows, usually this module
   * is a dependency of a dependency and if it tries to require something
   * like the request module the paths get way too long to handle for Windows.
   * As we do only a simple POST request we do not actually require complicated
   * logic support (no redirects, no nothing) anyway.
   *
   * @param url Url to POST to
   * @param payload Payload to POST
   * @param params Client options, the customHeaders and tls values are used for the request
   * @param callback Callback function with (err, buff)
   */
  postRequest(url, payload, params, callback) {
    let returned = false;
    const chunks = [];
    let chunklen = 0;
    const fetchOptions = {
      method: "post",
      headers: params.customHeaders,
      body: payload,
      allowErrorResponse: true,
      // unset falls back to the fetch default, a stalled token endpoint would otherwise keep
      // `renewing` set and queue every later request
      timeout: params.requestTimeout
    };
    if (/^https:/i.test(url)) {
      fetchOptions.tls = Object.assign({ rejectUnauthorized: true }, params.tls || {});
    }
    const req = fetch_default(url, fetchOptions);
    req.on("readable", () => {
      let chunk;
      while ((chunk = req.read()) !== null) {
        chunks.push(chunk);
        chunklen += chunk.length;
      }
    });
    req.once("error", (err) => {
      if (returned) {
        return;
      }
      returned = true;
      return callback(err);
    });
    req.once("end", () => {
      if (returned) {
        return;
      }
      returned = true;
      return callback(null, Buffer.concat(chunks, chunklen));
    });
  }
  /**
   * Encodes a buffer or a string into Base64url format
   *
   * @param data The data to convert
   * @return The encoded string
   */
  toBase64URL(data) {
    if (typeof data === "string") {
      data = Buffer.from(data);
    }
    return data.toString("base64").replace(/[=]+/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }
  /**
   * Creates a JSON Web Token signed with RS256 (SHA256 + RSA)
   *
   * @param payload The payload to include in the generated token
   * @return The generated and signed token
   */
  jwtSignRS256(payload) {
    const signedPayload = ['{"alg":"RS256","typ":"JWT"}', JSON.stringify(payload)].map((val) => this.toBase64URL(val)).join(".");
    const signature = import_node_crypto7.default.createSign("RSA-SHA256").update(signedPayload).sign(this.options.privateKey);
    return signedPayload + "." + this.toBase64URL(signature);
  }
};
var xoauth2_default = XOAuth2;

// node_modules/nodemailer/dist/esm/smtp-pool/pool-resource.js
var import_node_events3 = require("node:events");
var PoolResource = class extends import_node_events3.EventEmitter {
  constructor(pool) {
    super();
    this.pool = pool;
    this.options = pool.options;
    this.logger = this.pool.logger;
    if (this.options.auth) {
      switch ((this.options.auth.type || "").toString().toUpperCase()) {
        case "OAUTH2": {
          const oauth2 = new xoauth2_default(this.options.auth, this.logger);
          oauth2.provisionCallback = this.pool.mailer && this.pool.mailer.get("oauth2_provision_cb") || oauth2.provisionCallback;
          this.auth = {
            type: "OAUTH2",
            user: this.options.auth.user,
            oauth2,
            method: "XOAUTH2"
          };
          oauth2.on("token", (token) => this.pool.mailer.emit("token", token));
          oauth2.on("error", (err) => this._fail(err));
          break;
        }
        default:
          if (!this.options.auth.user && !this.options.auth.pass) {
            break;
          }
          this.auth = {
            type: (this.options.auth.type || "").toString().toUpperCase() || "LOGIN",
            user: this.options.auth.user,
            credentials: {
              user: this.options.auth.user || "",
              pass: this.options.auth.pass,
              options: this.options.auth.options
            },
            method: (this.options.auth.method || "").trim().toUpperCase() || this.options.authMethod || false
          };
      }
    }
    this._connection = false;
    this._connected = false;
    this.messages = 0;
    this.available = true;
    this._failed = false;
    this._sending = false;
    this._idleTimer = false;
  }
  /**
   * Emits 'error' for the first failure only. A dead resource can report the same failure more
   * than once (the connection error, then the send callback), the pool handles it once
   * @internal
   */
  _fail(err) {
    if (this._failed) {
      return;
    }
    this._failed = true;
    this.emit("error", err);
  }
  /**
   * Initiates a connection to the SMTP server
   *
   * @param callback Callback function to run once the connection is established or failed
   */
  connect(callback) {
    const connectStartedAt = Date.now();
    this.pool.getSocket(Object.assign({}, this.options, { connectStartedAt }), (err, socketOptions) => {
      if (err) {
        this._fail(err);
        return callback(err);
      }
      let returned = false;
      let options = this.options;
      if (socketOptions && socketOptions.connection) {
        this.logger.info({
          tnx: "proxy",
          remoteAddress: socketOptions.connection.remoteAddress,
          remotePort: socketOptions.connection.remotePort,
          destHost: options.host || "",
          destPort: options.port || "",
          action: "connected"
        }, "Using proxied socket from %s:%s to %s:%s", socketOptions.connection.remoteAddress, socketOptions.connection.remotePort, options.host || "", options.port || "");
        options = Object.assign(assign(false, options), socketOptions);
      }
      this.connection = new smtp_connection_default(options);
      this.connection._connectStartedAt = connectStartedAt;
      this.connection.on("error", (err2) => {
        if (this._sending) {
          return;
        }
        if (this._connected && isTransientError(err2)) {
          this.logger.info({
            tnx: "pool",
            cid: this.id
          }, "Connection #%s was closed by the server: %s", this.id, err2.message);
          return;
        }
        this._fail(err2);
        if (returned) {
          return;
        }
        returned = true;
        return callback(err2);
      });
      this.connection.once("end", () => {
        this.close();
        returned = true;
      });
      this.connection.connect((err2) => {
        if (returned) {
          return;
        }
        if (err2) {
          returned = true;
          return;
        }
        if (this.auth && (this.connection.allowsAuth || options.forceAuth)) {
          this.connection.login(this.auth, (err3) => {
            if (returned) {
              return;
            }
            returned = true;
            if (err3) {
              this.connection.close();
              this._fail(err3);
              return callback(err3);
            }
            this._connected = true;
            callback(null, true);
          });
        } else {
          returned = true;
          this._connected = true;
          return callback(null, true);
        }
      });
    });
  }
  /**
   * Sends an e-mail to be sent using the selected settings
   *
   * @param mail Mail object
   * @param callback Callback function
   */
  send(mail, callback) {
    if (!this._connected) {
      return this.connect((err) => {
        if (err) {
          return callback(err);
        }
        return this.send(mail, callback);
      });
    }
    const envelope = mail.message.getEnvelope();
    const messageId = mail.message.messageId();
    const recipients = [].concat(envelope.to || []);
    if (recipients.length > 3) {
      recipients.push("...and " + recipients.splice(2).length + " more");
    }
    this.logger.info({
      tnx: "send",
      messageId,
      cid: this.id
    }, "Sending message %s using #%s to <%s>", messageId, this.id, recipients.join(", "));
    if (mail.data.dsn) {
      envelope.dsn = mail.data.dsn;
    }
    if (mail.data.requireTLSExtensionEnabled) {
      envelope.requireTLSExtensionEnabled = mail.data.requireTLSExtensionEnabled;
    }
    this._sending = true;
    const reused = this.messages > 0;
    const messageStream = mail.message.createReadStream();
    this.connection.send(envelope, messageStream, (err, info) => {
      this._sending = false;
      this.messages++;
      if (err) {
        if (reused && messageStream.readableDidRead === false && isTransientError(err)) {
          this.logger.info({
            tnx: "pool",
            cid: this.id,
            messageId
          }, "Connection #%s was closed by the server before message %s was sent: %s", this.id, messageId, err.message);
          this.connection.close();
          return;
        }
        if ((err.code === EENVELOPE || err.code === EMESSAGE) && err.responseCode !== 421 && !this.connection._destroyed) {
          this.connection.reset((resetErr) => {
            if (resetErr) {
              this.connection.close();
              return;
            }
            this._release();
          });
          return callback(err);
        }
        this.connection.close();
        this._fail(err);
        return callback(err);
      }
      info.envelope = {
        from: envelope.from,
        to: envelope.to
      };
      info.messageId = messageId;
      setImmediate(() => this._release());
      callback(null, info);
    });
  }
  /**
   * Makes the connection available for the next message, or closes it once it has sent
   * maxMessages messages
   *
   * @internal
   */
  _release() {
    if (this.messages >= this.options.maxMessages) {
      const err = new Error("Resource exhausted");
      err.code = EMAXLIMIT;
      this.connection.close();
      this._fail(err);
      return;
    }
    this.pool._checkRateLimit(() => {
      this.available = true;
      this._startIdleTimer();
      this.emit("available");
    });
  }
  /** @internal */
  _startIdleTimer() {
    if (!this.options.idleTimeout || this.options.idleTimeout < 0) {
      return;
    }
    if (this._idleTimer && typeof this._idleTimer.refresh === "function") {
      this._idleTimer.refresh();
      return;
    }
    clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => {
      if (!this.available) {
        return;
      }
      this.logger.debug({
        tnx: "pool",
        cid: this.id
      }, "Closing connection #%s after it was idle for %sms", this.id, this.options.idleTimeout);
      this.available = false;
      this.connection.quit();
    }, this.options.idleTimeout);
    if (typeof this._idleTimer.unref === "function") {
      this._idleTimer.unref();
    }
  }
  /** @internal */
  _stopIdleTimer() {
    clearTimeout(this._idleTimer);
    this._idleTimer = false;
  }
  /**
   * Closes the connection
   */
  close() {
    this._connected = false;
    this._stopIdleTimer();
    if (this.auth && this.auth.oauth2) {
      this.auth.oauth2.removeAllListeners();
    }
    if (this.connection) {
      this.connection.close();
    }
    this.emit("close");
  }
};

// node_modules/nodemailer/dist/esm/well-known/services.js
var services = {
  "126": {
    "description": "126 Mail (NetEase)",
    "host": "smtp.126.com",
    "port": 465,
    "secure": true
  },
  "163": {
    "description": "163 Mail (NetEase)",
    "host": "smtp.163.com",
    "port": 465,
    "secure": true
  },
  "1und1": {
    "description": "1&1 Mail (German hosting provider)",
    "host": "smtp.1und1.de",
    "port": 465,
    "secure": true,
    "authMethod": "LOGIN"
  },
  "Aliyun": {
    "description": "Alibaba Cloud Mail",
    "domains": [
      "aliyun.com"
    ],
    "host": "smtp.aliyun.com",
    "port": 465,
    "secure": true
  },
  "AliyunQiye": {
    "description": "Alibaba Cloud Enterprise Mail",
    "host": "smtp.qiye.aliyun.com",
    "port": 465,
    "secure": true
  },
  "AOL": {
    "description": "AOL Mail",
    "domains": [
      "aol.com"
    ],
    "host": "smtp.aol.com",
    "port": 587
  },
  "Aruba": {
    "description": "Aruba PEC (Italian email provider)",
    "domains": [
      "aruba.it",
      "pec.aruba.it"
    ],
    "aliases": [
      "Aruba PEC"
    ],
    "host": "smtps.aruba.it",
    "port": 465,
    "secure": true,
    "authMethod": "LOGIN"
  },
  "Bluewin": {
    "description": "Bluewin (Swiss email provider)",
    "host": "smtpauths.bluewin.ch",
    "domains": [
      "bluewin.ch"
    ],
    "port": 465
  },
  "BOL": {
    "description": "BOL Mail (Brazilian provider)",
    "domains": [
      "bol.com.br"
    ],
    "host": "smtp.bol.com.br",
    "port": 587,
    "requireTLS": true
  },
  "DebugMail": {
    "description": "DebugMail (email testing service)",
    "host": "debugmail.io",
    "port": 25
  },
  "Disroot": {
    "description": "Disroot (privacy-focused provider)",
    "domains": [
      "disroot.org"
    ],
    "host": "disroot.org",
    "port": 587,
    "secure": false,
    "authMethod": "LOGIN"
  },
  "DynectEmail": {
    "description": "Dyn Email Delivery",
    "aliases": [
      "Dynect"
    ],
    "host": "smtp.dynect.net",
    "port": 25
  },
  "ElasticEmail": {
    "description": "Elastic Email",
    "aliases": [
      "Elastic Email"
    ],
    "host": "smtp.elasticemail.com",
    "port": 465,
    "secure": true
  },
  "Ethereal": {
    "description": "Ethereal Email (email testing service)",
    "aliases": [
      "ethereal.email"
    ],
    "host": "smtp.ethereal.email",
    "port": 587
  },
  "FastMail": {
    "description": "FastMail",
    "domains": [
      "fastmail.com",
      "fastmail.fm"
    ],
    "host": "smtp.fastmail.com",
    "port": 465,
    "secure": true
  },
  "Feishu Mail": {
    "description": "Feishu Mail (Lark)",
    "aliases": [
      "Feishu",
      "FeishuMail"
    ],
    "domains": [
      "www.feishu.cn"
    ],
    "host": "smtp.feishu.cn",
    "port": 465,
    "secure": true
  },
  "Forward Email": {
    "description": "Forward Email (email forwarding service)",
    "aliases": [
      "FE",
      "ForwardEmail"
    ],
    "domains": [
      "forwardemail.net"
    ],
    "host": "smtp.forwardemail.net",
    "port": 465,
    "secure": true
  },
  "GandiMail": {
    "description": "Gandi Mail",
    "aliases": [
      "Gandi",
      "Gandi Mail"
    ],
    "host": "mail.gandi.net",
    "port": 587
  },
  "Gmail": {
    "description": "Gmail",
    "aliases": [
      "Google Mail"
    ],
    "domains": [
      "gmail.com",
      "googlemail.com"
    ],
    "host": "smtp.gmail.com",
    "port": 465,
    "secure": true
  },
  "GmailWorkspace": {
    "description": "Gmail Workspace",
    "aliases": [
      "Google Workspace Mail"
    ],
    "host": "smtp-relay.gmail.com",
    "port": 465,
    "secure": true
  },
  "GMX": {
    "description": "GMX Mail",
    "domains": [
      "gmx.com",
      "gmx.net",
      "gmx.de"
    ],
    "host": "mail.gmx.com",
    "port": 587
  },
  "Godaddy": {
    "description": "GoDaddy Email (US)",
    "host": "smtpout.secureserver.net",
    "port": 25
  },
  "GodaddyAsia": {
    "description": "GoDaddy Email (Asia)",
    "host": "smtp.asia.secureserver.net",
    "port": 25
  },
  "GodaddyEurope": {
    "description": "GoDaddy Email (Europe)",
    "host": "smtp.europe.secureserver.net",
    "port": 25
  },
  "hot.ee": {
    "description": "Hot.ee (Estonian email provider)",
    "host": "mail.hot.ee"
  },
  "Hotmail": {
    "description": "Outlook.com / Hotmail",
    "aliases": [
      "Outlook",
      "Outlook.com",
      "Hotmail.com"
    ],
    "domains": [
      "hotmail.com",
      "outlook.com"
    ],
    "host": "smtp-mail.outlook.com",
    "port": 587
  },
  "iCloud": {
    "description": "iCloud Mail",
    "aliases": [
      "Me",
      "Mac"
    ],
    "domains": [
      "icloud.com",
      "me.com",
      "mac.com"
    ],
    "host": "smtp.mail.me.com",
    "port": 587
  },
  "Infomaniak": {
    "description": "Infomaniak Mail (Swiss hosting provider)",
    "host": "mail.infomaniak.com",
    "domains": [
      "ik.me",
      "ikmail.com",
      "etik.com"
    ],
    "port": 587
  },
  "KolabNow": {
    "description": "KolabNow (secure email service)",
    "domains": [
      "kolabnow.com"
    ],
    "aliases": [
      "Kolab"
    ],
    "host": "smtp.kolabnow.com",
    "port": 465,
    "secure": true,
    "authMethod": "LOGIN"
  },
  "Loopia": {
    "description": "Loopia (Swedish hosting provider)",
    "host": "mailcluster.loopia.se",
    "port": 465
  },
  "Loops": {
    "description": "Loops",
    "host": "smtp.loops.so",
    "port": 587
  },
  "mail.ee": {
    "description": "Mail.ee (Estonian email provider)",
    "host": "smtp.mail.ee"
  },
  "Mail.ru": {
    "description": "Mail.ru",
    "host": "smtp.mail.ru",
    "port": 465,
    "secure": true
  },
  "Mailcatch.app": {
    "description": "Mailcatch (email testing service)",
    "host": "sandbox-smtp.mailcatch.app",
    "port": 2525
  },
  "Maildev": {
    "description": "MailDev (local email testing)",
    "port": 1025,
    "ignoreTLS": true
  },
  "MailerSend": {
    "description": "MailerSend",
    "host": "smtp.mailersend.net",
    "port": 587
  },
  "Mailgun": {
    "description": "Mailgun",
    "host": "smtp.mailgun.org",
    "port": 465,
    "secure": true
  },
  "Mailjet": {
    "description": "Mailjet",
    "host": "in.mailjet.com",
    "port": 587
  },
  "Mailosaur": {
    "description": "Mailosaur (email testing service)",
    "host": "mailosaur.io",
    "port": 25
  },
  "MailSenpai": {
    "description": "MailSenpai (SMTP Senpai, EU)",
    "host": "relay.mailsenpai.com",
    "port": 2525,
    "secure": false
  },
  "Mailtrap": {
    "description": "Mailtrap",
    "host": "live.smtp.mailtrap.io",
    "port": 587
  },
  "Mandrill": {
    "description": "Mandrill (by Mailchimp)",
    "host": "smtp.mandrillapp.com",
    "port": 587
  },
  "Naver": {
    "description": "Naver Mail (Korean email provider)",
    "host": "smtp.naver.com",
    "port": 587
  },
  "OhMySMTP": {
    "description": "OhMySMTP (email delivery service)",
    "host": "smtp.ohmysmtp.com",
    "port": 587,
    "secure": false
  },
  "One": {
    "description": "One.com Email",
    "host": "send.one.com",
    "port": 465,
    "secure": true
  },
  "OpenMailBox": {
    "description": "OpenMailBox",
    "aliases": [
      "OMB",
      "openmailbox.org"
    ],
    "host": "smtp.openmailbox.org",
    "port": 465,
    "secure": true
  },
  "Outlook365": {
    "description": "Microsoft 365 / Office 365",
    "host": "smtp.office365.com",
    "port": 587,
    "secure": false
  },
  "Oveyon": {
    "description": "Oveyon",
    "host": "smtp.oveyon.com",
    "port": 587,
    "secure": false,
    "requireTLS": true
  },
  "Postmark": {
    "description": "Postmark",
    "aliases": [
      "PostmarkApp"
    ],
    "host": "smtp.postmarkapp.com",
    "port": 2525
  },
  "Proton": {
    "description": "Proton Mail",
    "aliases": [
      "ProtonMail",
      "Proton.me",
      "Protonmail.com",
      "Protonmail.ch"
    ],
    "domains": [
      "proton.me",
      "protonmail.com",
      "pm.me",
      "protonmail.ch"
    ],
    "host": "smtp.protonmail.ch",
    "port": 587,
    "requireTLS": true
  },
  "qiye.aliyun": {
    "description": "Alibaba Mail Enterprise Edition",
    "host": "smtp.mxhichina.com",
    "port": "465",
    "secure": true
  },
  "QQ": {
    "description": "QQ Mail",
    "domains": [
      "qq.com"
    ],
    "host": "smtp.qq.com",
    "port": 465,
    "secure": true
  },
  "QQex": {
    "description": "QQ Enterprise Mail",
    "aliases": [
      "QQ Enterprise"
    ],
    "domains": [
      "exmail.qq.com"
    ],
    "host": "smtp.exmail.qq.com",
    "port": 465,
    "secure": true
  },
  "Resend": {
    "description": "Resend",
    "host": "smtp.resend.com",
    "port": 465,
    "secure": true
  },
  "Runbox": {
    "description": "Runbox (Norwegian email provider)",
    "domains": [
      "runbox.com"
    ],
    "host": "smtp.runbox.com",
    "port": 465,
    "secure": true
  },
  "SendCloud": {
    "description": "SendCloud (Chinese email delivery)",
    "host": "smtp.sendcloud.net",
    "port": 2525
  },
  "SendGrid": {
    "description": "SendGrid",
    "host": "smtp.sendgrid.net",
    "port": 587
  },
  "SendinBlue": {
    "description": "Brevo (formerly Sendinblue)",
    "aliases": [
      "Brevo"
    ],
    "host": "smtp-relay.brevo.com",
    "port": 587
  },
  "SendPulse": {
    "description": "SendPulse",
    "host": "smtp-pulse.com",
    "port": 465,
    "secure": true
  },
  "SES": {
    "description": "AWS SES US East (N. Virginia)",
    "host": "email-smtp.us-east-1.amazonaws.com",
    "port": 465,
    "secure": true
  },
  "SES-AP-NORTHEAST-1": {
    "description": "AWS SES Asia Pacific (Tokyo)",
    "host": "email-smtp.ap-northeast-1.amazonaws.com",
    "port": 465,
    "secure": true
  },
  "SES-AP-NORTHEAST-2": {
    "description": "AWS SES Asia Pacific (Seoul)",
    "host": "email-smtp.ap-northeast-2.amazonaws.com",
    "port": 465,
    "secure": true
  },
  "SES-AP-NORTHEAST-3": {
    "description": "AWS SES Asia Pacific (Osaka)",
    "host": "email-smtp.ap-northeast-3.amazonaws.com",
    "port": 465,
    "secure": true
  },
  "SES-AP-SOUTH-1": {
    "description": "AWS SES Asia Pacific (Mumbai)",
    "host": "email-smtp.ap-south-1.amazonaws.com",
    "port": 465,
    "secure": true
  },
  "SES-AP-SOUTHEAST-1": {
    "description": "AWS SES Asia Pacific (Singapore)",
    "host": "email-smtp.ap-southeast-1.amazonaws.com",
    "port": 465,
    "secure": true
  },
  "SES-AP-SOUTHEAST-2": {
    "description": "AWS SES Asia Pacific (Sydney)",
    "host": "email-smtp.ap-southeast-2.amazonaws.com",
    "port": 465,
    "secure": true
  },
  "SES-CA-CENTRAL-1": {
    "description": "AWS SES Canada (Central)",
    "host": "email-smtp.ca-central-1.amazonaws.com",
    "port": 465,
    "secure": true
  },
  "SES-EU-CENTRAL-1": {
    "description": "AWS SES Europe (Frankfurt)",
    "host": "email-smtp.eu-central-1.amazonaws.com",
    "port": 465,
    "secure": true
  },
  "SES-EU-NORTH-1": {
    "description": "AWS SES Europe (Stockholm)",
    "host": "email-smtp.eu-north-1.amazonaws.com",
    "port": 465,
    "secure": true
  },
  "SES-EU-WEST-1": {
    "description": "AWS SES Europe (Ireland)",
    "host": "email-smtp.eu-west-1.amazonaws.com",
    "port": 465,
    "secure": true
  },
  "SES-EU-WEST-2": {
    "description": "AWS SES Europe (London)",
    "host": "email-smtp.eu-west-2.amazonaws.com",
    "port": 465,
    "secure": true
  },
  "SES-EU-WEST-3": {
    "description": "AWS SES Europe (Paris)",
    "host": "email-smtp.eu-west-3.amazonaws.com",
    "port": 465,
    "secure": true
  },
  "SES-SA-EAST-1": {
    "description": "AWS SES South America (S\xE3o Paulo)",
    "host": "email-smtp.sa-east-1.amazonaws.com",
    "port": 465,
    "secure": true
  },
  "SES-US-EAST-1": {
    "description": "AWS SES US East (N. Virginia)",
    "host": "email-smtp.us-east-1.amazonaws.com",
    "port": 465,
    "secure": true
  },
  "SES-US-EAST-2": {
    "description": "AWS SES US East (Ohio)",
    "host": "email-smtp.us-east-2.amazonaws.com",
    "port": 465,
    "secure": true
  },
  "SES-US-GOV-EAST-1": {
    "description": "AWS SES GovCloud (US-East)",
    "host": "email-smtp.us-gov-east-1.amazonaws.com",
    "port": 465,
    "secure": true
  },
  "SES-US-GOV-WEST-1": {
    "description": "AWS SES GovCloud (US-West)",
    "host": "email-smtp.us-gov-west-1.amazonaws.com",
    "port": 465,
    "secure": true
  },
  "SES-US-WEST-1": {
    "description": "AWS SES US West (N. California)",
    "host": "email-smtp.us-west-1.amazonaws.com",
    "port": 465,
    "secure": true
  },
  "SES-US-WEST-2": {
    "description": "AWS SES US West (Oregon)",
    "host": "email-smtp.us-west-2.amazonaws.com",
    "port": 465,
    "secure": true
  },
  "Seznam": {
    "description": "Seznam Email (Czech email provider)",
    "aliases": [
      "Seznam Email"
    ],
    "domains": [
      "seznam.cz",
      "email.cz",
      "post.cz",
      "spoluzaci.cz"
    ],
    "host": "smtp.seznam.cz",
    "port": 465,
    "secure": true
  },
  "SMTP2GO": {
    "description": "SMTP2GO",
    "host": "mail.smtp2go.com",
    "port": 2525
  },
  "Sparkpost": {
    "description": "SparkPost",
    "aliases": [
      "SparkPost",
      "SparkPost Mail"
    ],
    "domains": [
      "sparkpost.com"
    ],
    "host": "smtp.sparkpostmail.com",
    "port": 587,
    "secure": false
  },
  "Tipimail": {
    "description": "Tipimail (email delivery service)",
    "host": "smtp.tipimail.com",
    "port": 587
  },
  "TurboSMTP": {
    "description": "TurboSMTP",
    "host": "pro.turbo-smtp.com",
    "port": 465,
    "secure": true
  },
  "TurboSMTP-EU": {
    "description": "TurboSMTP (EU region)",
    "host": "pro.eu.turbo-smtp.com",
    "port": 465,
    "secure": true
  },
  "Tutanota": {
    "description": "Tutanota (Tuta Mail)",
    "domains": [
      "tutanota.com",
      "tuta.com",
      "tutanota.de",
      "tuta.io"
    ],
    "host": "smtp.tutanota.com",
    "port": 465,
    "secure": true
  },
  "Yahoo": {
    "description": "Yahoo Mail",
    "domains": [
      "yahoo.com"
    ],
    "host": "smtp.mail.yahoo.com",
    "port": 465,
    "secure": true
  },
  "Yandex": {
    "description": "Yandex Mail",
    "domains": [
      "yandex.ru"
    ],
    "host": "smtp.yandex.ru",
    "port": 465,
    "secure": true
  },
  "Zimbra": {
    "description": "Zimbra Mail Server",
    "aliases": [
      "Zimbra Collaboration"
    ],
    "host": "smtp.zimbra.com",
    "port": 587,
    "requireTLS": true
  },
  "Zoho": {
    "description": "Zoho Mail",
    "host": "smtp.zoho.com",
    "port": 465,
    "secure": true,
    "authMethod": "LOGIN"
  }
};

// node_modules/nodemailer/dist/esm/well-known/index.js
var normalized = {};
Object.keys(services).forEach((key) => {
  const service = services[key];
  const normalizedService = normalizeService(service);
  normalized[normalizeKey(key)] = normalizedService;
  [].concat(service.aliases || []).forEach((alias) => {
    normalized[normalizeKey(alias)] = normalizedService;
  });
  [].concat(service.domains || []).forEach((domain) => {
    normalized[normalizeKey(domain)] = normalizedService;
  });
});
function normalizeKey(key) {
  return key.replace(/[^a-zA-Z0-9.-]/g, "").toLowerCase();
}
function normalizeService(service) {
  const response = {};
  Object.keys(service).forEach((key) => {
    if (!["domains", "aliases"].includes(key)) {
      response[key] = service[key];
    }
  });
  return response;
}
function wellKnown(key) {
  key = normalizeKey(key.split("@").pop());
  return normalized[key] || false;
}

// node_modules/nodemailer/dist/esm/smtp-pool/index.js
var REQUEUE_BASE_DELAY = 50;
var REQUEUE_MAX_DELAY = 2e3;
var SMTPPool = class extends import_node_events4.EventEmitter {
  constructor(options) {
    super();
    options = options || {};
    if (typeof options === "string") {
      options = {
        url: options
      };
    }
    let urlData;
    let service = options.service;
    if (typeof options.getSocket === "function") {
      this.getSocket = options.getSocket;
    }
    if (options.url) {
      urlData = parseConnectionUrl(options.url);
      service = service || urlData.service;
    }
    this.options = assign(
      false,
      // create new object
      options,
      // regular options
      urlData,
      // url options
      service && wellKnown(service)
      // wellknown options
    );
    this.options.maxConnections = this.options.maxConnections || 5;
    this.options.maxMessages = this.options.maxMessages || 100;
    this.options.maxRequeues = typeof this.options.maxRequeues === "number" ? this.options.maxRequeues : 5;
    this.options.idleTimeout = typeof this.options.idleTimeout === "number" ? this.options.idleTimeout : 4 * 60 * 1e3;
    this.logger = getLogger(this.options, {
      component: this.options.component || "smtp-pool"
    });
    this.name = "SMTP (pool)";
    this.version = version + "[client:" + version + "]";
    this._rateLimit = {
      counter: 0,
      timeout: null,
      waiting: [],
      checkpoint: false,
      delta: Number(this.options.rateDelta) || 1e3,
      limit: Number(this.options.rateLimit) || 0
    };
    this._closed = false;
    this._queue = [];
    this._connections = [];
    this._connectionCounter = 0;
    this.idling = true;
    setImmediate(() => {
      if (this.idling) {
        this.emit("idle");
      }
    });
  }
  /**
   * Placeholder function for creating proxy sockets. This method immediatelly returns
   * without a socket
   *
   * @param options Connection options
   * @param callback Callback function to run with the socket keys
   */
  getSocket(options, callback) {
    setImmediate(() => callback(null, false));
  }
  /**
   * Queues an e-mail to be sent using the selected settings
   *
   * @param mail Mail object
   * @param callback Callback function
   */
  send(mail, callback) {
    if (this._closed) {
      const err = new Error("Connection pool was closed");
      err.code = ECONNECTION;
      setImmediate(() => callback(err));
      return false;
    }
    this._queue.push({
      mail,
      requeueAttempts: 0,
      callback
    });
    if (this.idling && this._queue.length >= this.options.maxConnections) {
      this.idling = false;
    }
    setImmediate(() => this._processMessages());
    return true;
  }
  /**
   * Closes all connections in the pool. If there is a message being sent, the connection
   * is closed later
   */
  close() {
    let connection;
    const len = this._connections.length;
    this._closed = true;
    this._clearRateLimit();
    if (!len && !this._queue.length) {
      return;
    }
    for (let i = len - 1; i >= 0; i--) {
      if (this._connections[i] && this._connections[i].available) {
        connection = this._connections[i];
        connection.close();
        this.logger.info({
          tnx: "connection",
          cid: connection.id,
          action: "removed"
        }, "Connection #%s removed", connection.id);
      }
    }
    if (len && !this._connections.length) {
      this.logger.debug({
        tnx: "connection"
      }, "All connections removed");
    }
    if (!this._queue.length) {
      return;
    }
    const invokeCallbacks = () => {
      if (!this._queue.length) {
        this.logger.debug({
          tnx: "connection"
        }, "Pending queue entries cleared");
        return;
      }
      const entry = this._queue.shift();
      if (entry && typeof entry.callback === "function") {
        try {
          entry.callback(new Error("Connection pool was closed"));
        } catch (E) {
          this.logger.error({
            err: E,
            tnx: "callback"
          }, "Callback error: %s", E.message);
        }
      }
      setImmediate(invokeCallbacks);
    };
    setImmediate(invokeCallbacks);
  }
  /**
   * Check the queue and available connections. If there is a message to be sent and there is
   * an available connection, then use this connection to send the mail
   * @internal
   */
  _processMessages() {
    if (this._closed) {
      return;
    }
    if (!this._queue.length) {
      if (!this.idling) {
        this.idling = true;
        this.emit("idle");
      }
      return;
    }
    let connection = this._connections.find((c) => c.available);
    if (!connection && this._connections.length < this.options.maxConnections) {
      connection = this._createConnection();
    }
    if (!connection) {
      this.idling = false;
      return;
    }
    if (!this.idling && this._queue.length < this.options.maxConnections) {
      this.idling = true;
      this.emit("idle");
    }
    const entry = connection.queueEntry = this._queue.shift();
    entry.messageId = (connection.queueEntry.mail.message.getHeader("message-id") || "").replace(/[<>\s]/g, "");
    connection.available = false;
    this.logger.debug({
      tnx: "pool",
      cid: connection.id,
      messageId: entry.messageId,
      action: "assign"
    }, "Assigned message <%s> to #%s (%s)", entry.messageId, connection.id, connection.messages + 1);
    if (this._rateLimit.limit) {
      this._rateLimit.counter++;
      if (!this._rateLimit.checkpoint) {
        this._rateLimit.checkpoint = Date.now();
      }
    }
    connection.send(entry.mail, (err, info) => {
      if (entry === connection.queueEntry) {
        try {
          entry.callback(err, info);
        } catch (E) {
          this.logger.error({
            err: E,
            tnx: "callback",
            cid: connection.id
          }, "Callback error for #%s: %s", connection.id, E.message);
        }
        connection.queueEntry = false;
      }
    });
  }
  /**
   * Creates a new pool resource
   * @internal
   */
  _createConnection() {
    const connection = new PoolResource(this);
    connection.id = ++this._connectionCounter;
    this.logger.info({
      tnx: "pool",
      cid: connection.id,
      action: "conection"
    }, "Created new pool resource #%s", connection.id);
    connection.on("available", () => {
      this.logger.debug({
        tnx: "connection",
        cid: connection.id,
        action: "available"
      }, "Connection #%s became available", connection.id);
      if (this._closed) {
        this.close();
      } else {
        this._processMessages();
      }
    });
    connection.once("error", (err) => {
      if (err.code !== EMAXLIMIT) {
        this.logger.warn({
          err,
          tnx: "pool",
          cid: connection.id
        }, "Pool Error for #%s: %s", connection.id, err.message);
      } else {
        this.logger.debug({
          tnx: "pool",
          cid: connection.id,
          action: "maxlimit"
        }, "Max messages limit exchausted for #%s", connection.id);
      }
      if (connection.queueEntry) {
        try {
          connection.queueEntry.callback(err);
        } catch (E) {
          this.logger.error({
            err: E,
            tnx: "callback",
            cid: connection.id
          }, "Callback error for #%s: %s", connection.id, E.message);
        }
        connection.queueEntry = false;
      }
      this._removeConnection(connection);
      this._continueProcessing();
    });
    connection.once("close", () => {
      this.logger.info({
        tnx: "connection",
        cid: connection.id,
        action: "closed"
      }, "Connection #%s was closed", connection.id);
      this._removeConnection(connection);
      if (connection.queueEntry) {
        setTimeout(() => {
          let delay = 0;
          if (connection.queueEntry) {
            if (this._shouldRequeuOnConnectionClose(connection.queueEntry)) {
              delay = this._requeueEntryOnConnectionClose(connection);
            } else {
              this._failDeliveryOnConnectionClose(connection);
            }
          }
          if (delay) {
            setTimeout(() => this._continueProcessing(), delay);
          } else {
            this._continueProcessing();
          }
        }, 50);
      } else {
        if (!this._closed && this.idling && !this._connections.length) {
          this.emit("clear");
        }
        this._continueProcessing();
      }
    });
    this._connections.push(connection);
    return connection;
  }
  /** @internal */
  _shouldRequeuOnConnectionClose(queueEntry) {
    if (this.options.maxRequeues < 0) {
      return true;
    }
    return queueEntry.requeueAttempts < this.options.maxRequeues;
  }
  /** @internal */
  _failDeliveryOnConnectionClose(connection) {
    if (connection.queueEntry && connection.queueEntry.callback) {
      try {
        const err = new Error("Reached maximum number of retries after connection was closed");
        err.code = ECONNECTION;
        connection.queueEntry.callback(err);
      } catch (E) {
        this.logger.error({
          err: E,
          tnx: "callback",
          messageId: connection.queueEntry.messageId,
          cid: connection.id
        }, "Callback error for #%s: %s", connection.id, E.message);
      }
      connection.queueEntry = false;
    }
  }
  /** @internal */
  _requeueEntryOnConnectionClose(connection) {
    const delay = Math.min(REQUEUE_BASE_DELAY * 2 ** connection.queueEntry.requeueAttempts, REQUEUE_MAX_DELAY);
    connection.queueEntry.requeueAttempts += 1;
    this.logger.debug({
      tnx: "pool",
      cid: connection.id,
      messageId: connection.queueEntry.messageId,
      action: "requeue"
    }, "Re-queued message <%s> for #%s. Attempt: #%s", connection.queueEntry.messageId, connection.id, connection.queueEntry.requeueAttempts);
    this._queue.unshift(connection.queueEntry);
    connection.queueEntry = false;
    return delay;
  }
  /**
   * Continue to process message if the pool hasn't closed
   * @internal
   */
  _continueProcessing() {
    if (this._closed) {
      this.close();
    } else {
      setTimeout(() => this._processMessages(), 100);
    }
  }
  /**
   * Remove resource from pool
   *
   * @param connection The PoolResource to remove
   * @internal
   */
  _removeConnection(connection) {
    const index = this._connections.indexOf(connection);
    if (index !== -1) {
      this._connections.splice(index, 1);
    }
  }
  /**
   * Checks if connections have hit current rate limit and if so, queues the availability callback
   *
   * @param callback Callback function to run once rate limiter has been cleared
   * @internal
   */
  _checkRateLimit(callback) {
    if (!this._rateLimit.limit) {
      return callback();
    }
    const now = Date.now();
    if (this._rateLimit.counter < this._rateLimit.limit) {
      return callback();
    }
    this._rateLimit.waiting.push(callback);
    if (this._rateLimit.checkpoint <= now - this._rateLimit.delta) {
      return this._clearRateLimit();
    }
    if (!this._rateLimit.timeout) {
      this._rateLimit.timeout = setTimeout(() => this._clearRateLimit(), this._rateLimit.delta - (now - this._rateLimit.checkpoint));
      this._rateLimit.checkpoint = now;
    }
  }
  /**
   * Clears current rate limit limitation and runs paused callback
   * @internal
   */
  _clearRateLimit() {
    clearTimeout(this._rateLimit.timeout);
    this._rateLimit.timeout = null;
    this._rateLimit.counter = 0;
    this._rateLimit.checkpoint = false;
    while (this._rateLimit.waiting.length) {
      const cb = this._rateLimit.waiting.shift();
      setImmediate(cb);
    }
  }
  /**
   * Returns true if there are free slots in the queue
   */
  isIdle() {
    return this.idling;
  }
  verify(callback) {
    let promise;
    if (!callback) {
      promise = new Promise((resolve3, reject) => {
        callback = callbackPromise(resolve3, reject);
      });
    }
    const done = callback;
    const auth = new PoolResource(this).auth;
    const connectStartedAt = Date.now();
    this.getSocket(Object.assign({}, this.options, { connectStartedAt }), (err, socketOptions) => {
      if (err) {
        return done(err);
      }
      let options = this.options;
      if (socketOptions && socketOptions.connection) {
        this.logger.info({
          tnx: "proxy",
          remoteAddress: socketOptions.connection.remoteAddress,
          remotePort: socketOptions.connection.remotePort,
          destHost: options.host || "",
          destPort: options.port || "",
          action: "connected"
        }, "Using proxied socket from %s:%s to %s:%s", socketOptions.connection.remoteAddress, socketOptions.connection.remotePort, options.host || "", options.port || "");
        options = Object.assign(assign(false, options), socketOptions);
      }
      const connection = new smtp_connection_default(options);
      connection._connectStartedAt = connectStartedAt;
      let returned = false;
      connection.once("error", (err2) => {
        if (returned) {
          return;
        }
        returned = true;
        connection.close();
        return done(err2);
      });
      connection.once("end", () => {
        if (returned) {
          return;
        }
        returned = true;
        return done(new Error("Connection closed"));
      });
      const finalize = () => {
        if (returned) {
          return;
        }
        returned = true;
        connection.quit();
        return done(null, true);
      };
      connection.connect((err2) => {
        if (returned) {
          return;
        }
        if (err2) {
          returned = true;
          connection.close();
          return done(err2);
        }
        if (auth && (connection.allowsAuth || options.forceAuth)) {
          connection.login(auth, (err3) => {
            if (returned) {
              return;
            }
            if (err3) {
              returned = true;
              connection.close();
              return done(err3);
            }
            finalize();
          });
        } else if (!auth && connection.allowsAuth && options.forceAuth) {
          const err3 = new Error("Authentication info was not provided");
          err3.code = ENOAUTH;
          returned = true;
          connection.close();
          return done(err3);
        } else {
          finalize();
        }
      });
    });
    return promise;
  }
};
var smtp_pool_default = SMTPPool;

// node_modules/nodemailer/dist/esm/smtp-transport/index.js
var import_node_events5 = require("node:events");
var MESSAGE_AUTH_KEYS = ["type", "user", "pass", "accessToken", "refreshToken", "expires"];
var SMTPTransport = class extends import_node_events5.EventEmitter {
  constructor(options) {
    super();
    options = options || {};
    if (typeof options === "string") {
      options = {
        url: options
      };
    }
    let urlData;
    let service = options.service;
    if (typeof options.getSocket === "function") {
      this.getSocket = options.getSocket;
    }
    if (options.url) {
      urlData = parseConnectionUrl(options.url);
      service = service || urlData.service;
    }
    this.options = assign(
      false,
      // create new object
      options,
      // regular options
      urlData,
      // url options
      service && wellKnown(service)
      // wellknown options
    );
    this.logger = getLogger(this.options, {
      component: this.options.component || "smtp-transport"
    });
    this.name = "SMTP";
    this.version = version + "[client:" + version + "]";
    if (this.options.auth) {
      this.auth = this.getAuth({});
    }
  }
  /**
   * Placeholder function for creating proxy sockets. This method immediatelly returns
   * without a socket
   *
   * @param options Connection options
   * @param callback Callback function to run with the socket keys
   */
  getSocket(options, callback) {
    setImmediate(() => callback(null, false));
  }
  getAuth(authOpts) {
    if (!authOpts) {
      if (this.auth && this.auth.oauth2 && this.mailer) {
        this.auth.oauth2.provisionCallback = this.mailer.get("oauth2_provision_cb") || this.auth.oauth2.provisionCallback;
      }
      return this.auth;
    }
    const authData = Object.assign({}, this.options.auth && typeof this.options.auth === "object" ? this.options.auth : {});
    if (typeof authOpts === "object") {
      copyOwnKeys(authData, authOpts, (key) => !MESSAGE_AUTH_KEYS.includes(key));
    }
    if (Object.keys(authData).length === 0) {
      return false;
    }
    switch ((authData.type || "").toString().toUpperCase()) {
      case "OAUTH2": {
        if (!authData.service && !authData.user) {
          return false;
        }
        const oauth2 = new xoauth2_default(authData, this.logger);
        oauth2.provisionCallback = this.mailer && this.mailer.get("oauth2_provision_cb") || oauth2.provisionCallback;
        oauth2.on("token", (token) => this.mailer.emit("token", token));
        oauth2.on("error", (err) => this.emit("error", err));
        return {
          type: "OAUTH2",
          user: authData.user,
          oauth2,
          method: "XOAUTH2"
        };
      }
      default:
        return {
          type: (authData.type || "").toString().toUpperCase() || "LOGIN",
          user: authData.user,
          credentials: {
            user: authData.user || "",
            pass: authData.pass,
            options: authData.options
          },
          method: (authData.method || "").trim().toUpperCase() || this.options.authMethod || false
        };
    }
  }
  /**
   * Sends an e-mail using the selected settings
   *
   * @param mail Mail object
   * @param callback Callback function
   */
  send(mail, callback) {
    const connectStartedAt = Date.now();
    this.getSocket(Object.assign({}, this.options, { connectStartedAt }), (err, socketOptions) => {
      if (err) {
        return callback(err);
      }
      let returned = false;
      let options = this.options;
      if (socketOptions && socketOptions.connection) {
        this.logger.info({
          tnx: "proxy",
          remoteAddress: socketOptions.connection.remoteAddress,
          remotePort: socketOptions.connection.remotePort,
          destHost: options.host || "",
          destPort: options.port || "",
          action: "connected"
        }, "Using proxied socket from %s:%s to %s:%s", socketOptions.connection.remoteAddress, socketOptions.connection.remotePort, options.host || "", options.port || "");
        options = Object.assign(assign(false, options), socketOptions);
      }
      const connection = new smtp_connection_default(options);
      connection._connectStartedAt = connectStartedAt;
      let perCallAuth;
      const cleanupPerCallAuth = () => {
        if (perCallAuth && perCallAuth !== this.auth && perCallAuth.oauth2) {
          perCallAuth.oauth2.removeAllListeners();
        }
        perCallAuth = null;
      };
      connection.once("error", (err2) => {
        if (returned) {
          return;
        }
        returned = true;
        cleanupPerCallAuth();
        connection.close();
        return callback(err2);
      });
      const sendMessage = () => {
        const envelope = mail.message.getEnvelope();
        const messageId = mail.message.messageId();
        const recipients = [].concat(envelope.to || []);
        if (recipients.length > 3) {
          recipients.push("...and " + recipients.splice(2).length + " more");
        }
        if (mail.data.dsn) {
          envelope.dsn = mail.data.dsn;
        }
        if (mail.data.requireTLSExtensionEnabled) {
          envelope.requireTLSExtensionEnabled = mail.data.requireTLSExtensionEnabled;
        }
        this.logger.info({
          tnx: "send",
          messageId
        }, "Sending message %s to <%s>", messageId, recipients.join(", "));
        connection.send(envelope, mail.message.createReadStream(), (err2, info) => {
          if (returned) {
            return;
          }
          returned = true;
          cleanupPerCallAuth();
          connection.close();
          if (err2) {
            this.logger.error({
              err: err2,
              tnx: "send"
            }, "Send error for %s: %s", messageId, err2.message);
            return callback(err2);
          }
          info.envelope = {
            from: envelope.from,
            to: envelope.to
          };
          info.messageId = messageId;
          try {
            return callback(null, info);
          } catch (E) {
            this.logger.error({
              err: E,
              tnx: "callback"
            }, "Callback error for %s: %s", messageId, E.message);
          }
        });
      };
      connection.connect((err2) => {
        if (returned) {
          return;
        }
        if (err2) {
          returned = true;
          connection.close();
          return callback(err2);
        }
        perCallAuth = this.getAuth(mail.data.auth);
        if (perCallAuth && (connection.allowsAuth || options.forceAuth)) {
          connection.login(perCallAuth, (err3) => {
            cleanupPerCallAuth();
            if (returned) {
              return;
            }
            if (err3) {
              returned = true;
              connection.close();
              return callback(err3);
            }
            sendMessage();
          });
        } else {
          sendMessage();
        }
      });
    });
  }
  verify(callback) {
    let promise;
    if (!callback) {
      promise = new Promise((resolve3, reject) => {
        callback = callbackPromise(resolve3, reject);
      });
    }
    const done = callback;
    const connectStartedAt = Date.now();
    this.getSocket(Object.assign({}, this.options, { connectStartedAt }), (err, socketOptions) => {
      if (err) {
        return done(err);
      }
      let options = this.options;
      if (socketOptions && socketOptions.connection) {
        this.logger.info({
          tnx: "proxy",
          remoteAddress: socketOptions.connection.remoteAddress,
          remotePort: socketOptions.connection.remotePort,
          destHost: options.host || "",
          destPort: options.port || "",
          action: "connected"
        }, "Using proxied socket from %s:%s to %s:%s", socketOptions.connection.remoteAddress, socketOptions.connection.remotePort, options.host || "", options.port || "");
        options = Object.assign(assign(false, options), socketOptions);
      }
      const connection = new smtp_connection_default(options);
      connection._connectStartedAt = connectStartedAt;
      let returned = false;
      let perCallAuth;
      const cleanupPerCallAuth = () => {
        if (perCallAuth && perCallAuth !== this.auth && perCallAuth.oauth2) {
          perCallAuth.oauth2.removeAllListeners();
        }
        perCallAuth = null;
      };
      connection.once("error", (err2) => {
        if (returned) {
          return;
        }
        returned = true;
        cleanupPerCallAuth();
        connection.close();
        return done(err2);
      });
      connection.once("end", () => {
        if (returned) {
          return;
        }
        returned = true;
        cleanupPerCallAuth();
        return done(new Error("Connection closed"));
      });
      const finalize = () => {
        if (returned) {
          return;
        }
        returned = true;
        cleanupPerCallAuth();
        connection.quit();
        return done(null, true);
      };
      connection.connect((err2) => {
        if (returned) {
          return;
        }
        if (err2) {
          returned = true;
          connection.close();
          return done(err2);
        }
        perCallAuth = this.getAuth({});
        if (perCallAuth && (connection.allowsAuth || options.forceAuth)) {
          connection.login(perCallAuth, (err3) => {
            cleanupPerCallAuth();
            if (returned) {
              return;
            }
            if (err3) {
              returned = true;
              connection.close();
              return done(err3);
            }
            finalize();
          });
        } else if (!perCallAuth && connection.allowsAuth && options.forceAuth) {
          const err3 = new Error("Authentication info was not provided");
          err3.code = ENOAUTH;
          returned = true;
          cleanupPerCallAuth();
          connection.close();
          return done(err3);
        } else {
          finalize();
        }
      });
    });
    return promise;
  }
  /**
   * Releases resources
   */
  close() {
    if (this.auth && this.auth.oauth2) {
      this.auth.oauth2.removeAllListeners();
    }
    this.emit("close");
  }
};
var smtp_transport_default = SMTPTransport;

// node_modules/nodemailer/dist/esm/sendmail-transport/index.js
var import_node_child_process = require("node:child_process");
var import_node_stream15 = require("node:stream");
var STDIN_ERROR_EXIT_WAIT = 1e3;
var SendmailTransport = class {
  constructor(options) {
    options = options || {};
    this._spawn = import_node_child_process.spawn;
    this.options = options;
    this.name = "Sendmail";
    this.version = version;
    this.path = "sendmail";
    this.args = false;
    this.logger = getLogger(this.options, {
      component: this.options.component || "sendmail"
    });
    if (typeof options === "string") {
      this.path = options;
    } else if (typeof options === "object") {
      if (options.path) {
        this.path = options.path;
      }
      if (Array.isArray(options.args)) {
        this.args = options.args;
      }
    }
    this.winbreak = ["win", "windows", "dos", "\r\n"].includes((options.newline || "").toString().toLowerCase());
  }
  /**
   * <p>Compiles a mailcomposer message and forwards it to handler that sends it.</p>
   *
   * @param mail MailComposer object
   * @param done Callback function to run when the sending is completed
   */
  send(mail, done) {
    mail.message.keepBcc = true;
    const envelope = mail.message.getEnvelope();
    const messageId = mail.message.messageId();
    let returned;
    const hasInvalidAddresses = [].concat(envelope.from || []).concat(envelope.to || []).some((addr) => /^"?-/.test(addr));
    if (hasInvalidAddresses) {
      const err = new Error("Can not send mail. Invalid envelope addresses.");
      err.code = ESENDMAIL;
      return done(err);
    }
    const args = this.args ? ["-i"].concat(this.args).concat(envelope.to) : ["-i"].concat(envelope.from ? ["-f", envelope.from] : []).concat(envelope.to);
    const callback = (err) => {
      if (returned) {
        return;
      }
      returned = true;
      if (typeof done === "function") {
        if (err) {
          return done(err);
        }
        return done(null, {
          envelope,
          messageId,
          response: "Messages queued for delivery"
        });
      }
    };
    let sendmail;
    try {
      sendmail = this._spawn(this.path, args);
    } catch (E) {
      this.logger.error({
        err: E,
        tnx: "spawn",
        messageId
      }, "Error occurred while spawning sendmail. %s", E.message);
      return callback(E);
    }
    if (sendmail) {
      let stream;
      const messageWritten = () => !!stream && stream.readableEnded;
      let stdinError = null;
      const release = () => {
        if (stream && !messageWritten()) {
          stream.destroy();
        }
      };
      const fail2 = (err) => {
        release();
        callback(err);
      };
      sendmail.on("error", (err) => {
        this.logger.error({
          err,
          tnx: "spawn",
          messageId
        }, "Error occurred when sending message %s. %s", messageId, err.message);
        fail2(err);
      });
      const onExit = (code, signal) => {
        let err = null;
        if (code) {
          err = new Error(code === 127 ? "Sendmail command not found, process exited with code " + code : "Sendmail exited with code " + code);
        } else if (signal) {
          err = new Error("Sendmail was terminated by " + signal);
        } else if (!messageWritten()) {
          err = new Error("Sendmail exited before the message was written");
        } else if (stdinError) {
          err = stdinError;
        }
        if (!err) {
          return callback();
        }
        err.code = err.code || ESENDMAIL;
        this.logger.error({
          err,
          tnx: "stdin",
          messageId
        }, "Error sending message %s to sendmail. %s", messageId, err.message);
        fail2(err);
      };
      sendmail.once("exit", onExit);
      sendmail.once("close", onExit);
      sendmail.stdin.on("error", (err) => {
        this.logger.error({
          err,
          tnx: "stdin",
          messageId
        }, "Error occurred when piping message %s to sendmail. %s", messageId, err.message);
        if (stdinError) {
          return;
        }
        stdinError = err;
        release();
        const exitTimer = setTimeout(() => fail2(err), STDIN_ERROR_EXIT_WAIT);
        sendmail.once("exit", () => clearTimeout(exitTimer));
      });
      const recipients = [].concat(envelope.to || []);
      if (recipients.length > 3) {
        recipients.push("...and " + recipients.splice(2).length + " more");
      }
      this.logger.info({
        tnx: "send",
        messageId
      }, "Sending message %s to <%s>", messageId, recipients.join(", "));
      const sourceStream = mail.message.createReadStream();
      stream = sourceStream;
      if (this.options.newline) {
        stream = (0, import_node_stream15.pipeline)(sourceStream, this.winbreak ? new LeWindows() : new LeUnix(), () => false);
      }
      stream.once("error", (err) => {
        this.logger.error({
          err,
          tnx: "stdin",
          messageId
        }, "Error occurred when generating message %s. %s", messageId, err.message);
        sendmail.kill("SIGINT");
        callback(err);
      });
      stream.pipe(sendmail.stdin);
    } else {
      const err = new Error("sendmail was not found");
      err.code = ESENDMAIL;
      return callback(err);
    }
  }
};
var sendmail_transport_default = SendmailTransport;

// node_modules/nodemailer/dist/esm/stream-transport/index.js
var StreamTransport = class {
  constructor(options) {
    options = options || {};
    this.options = options;
    this.name = "StreamTransport";
    this.version = version;
    this.logger = getLogger(this.options, {
      component: this.options.component || "stream-transport"
    });
    this.winbreak = ["win", "windows", "dos", "\r\n"].includes((options.newline || "").toString().toLowerCase());
  }
  /**
   * Compiles a mailcomposer message and forwards it to handler that sends it
   *
   * @param mail MailComposer object
   * @param done Callback function to run when the sending is completed
   */
  send(mail, done) {
    mail.message.keepBcc = true;
    const envelope = mail.message.getEnvelope();
    const messageId = mail.message.messageId();
    const recipients = [].concat(envelope.to || []);
    if (recipients.length > 3) {
      recipients.push("...and " + recipients.splice(2).length + " more");
    }
    this.logger.info({
      tnx: "send",
      messageId
    }, "Sending message %s to <%s> using %s line breaks", messageId, recipients.join(", "), this.winbreak ? "<CR><LF>" : "<LF>");
    setImmediate(() => {
      let stream;
      try {
        stream = mail.message.createReadStream();
        if (this.options.newline) {
          const sourceStream = stream;
          stream = sourceStream.pipe(this.winbreak ? new LeWindows() : new LeUnix());
          sourceStream.once("error", (err) => stream.emit("error", err));
        }
      } catch (E) {
        this.logger.error({
          err: E,
          tnx: "send",
          messageId
        }, "Creating send stream failed for %s. %s", messageId, E.message);
        return done(E);
      }
      if (!this.options.buffer) {
        stream.once("error", (err) => {
          this.logger.error({
            err,
            tnx: "send",
            messageId
          }, "Failed creating message for %s. %s", messageId, err.message);
        });
        return done(null, {
          envelope,
          messageId,
          message: stream
        });
      }
      const chunks = [];
      let chunklen = 0;
      stream.on("readable", () => {
        let chunk;
        while ((chunk = stream.read()) !== null) {
          chunks.push(chunk);
          chunklen += chunk.length;
        }
      });
      stream.once("error", (err) => {
        this.logger.error({
          err,
          tnx: "send",
          messageId
        }, "Failed creating message for %s. %s", messageId, err.message);
        return done(err);
      });
      stream.on("end", () => done(null, {
        envelope,
        messageId,
        message: Buffer.concat(chunks, chunklen)
      }));
    });
  }
};
var stream_transport_default = StreamTransport;

// node_modules/nodemailer/dist/esm/json-transport/index.js
var JSONTransport = class {
  constructor(options) {
    options = options || {};
    this.options = options;
    this.name = "JSONTransport";
    this.version = version;
    this.logger = getLogger(this.options, {
      component: this.options.component || "json-transport"
    });
  }
  /**
   * <p>Compiles a mailcomposer message and forwards it to handler that sends it.</p>
   *
   * @param mail MailComposer object
   * @param done Callback function to run when the sending is completed
   */
  send(mail, done) {
    mail.message.keepBcc = true;
    const envelope = mail.message.getEnvelope();
    const messageId = mail.message.messageId();
    const recipients = [].concat(envelope.to || []);
    if (recipients.length > 3) {
      recipients.push("...and " + recipients.splice(2).length + " more");
    }
    this.logger.info({
      tnx: "send",
      messageId
    }, "Composing JSON structure of %s to <%s>", messageId, recipients.join(", "));
    setImmediate(() => {
      mail.normalize((err, data) => {
        if (err) {
          this.logger.error({
            err,
            tnx: "send",
            messageId
          }, "Failed building JSON structure for %s. %s", messageId, err.message);
          return done(err);
        }
        delete data.envelope;
        delete data.normalizedHeaders;
        return done(null, {
          envelope,
          messageId,
          message: this.options.skipEncoding ? data : JSON.stringify(data)
        });
      });
    });
  }
};
var json_transport_default = JSONTransport;

// node_modules/nodemailer/dist/esm/ses-transport/index.js
var import_node_events6 = __toESM(require("node:events"), 1);
function tagSesError(err) {
  if (err && typeof err === "object" && !err.code) {
    err.code = ESES;
  }
  return err;
}
var SESTransport = class extends import_node_events6.default {
  constructor(options) {
    super();
    if (!options || !options.SES || !options.SES.sesClient) {
      const error2 = new Error("Missing SES configuration, expecting { sesClient, SendEmailCommand } from @aws-sdk/client-sesv2, see https://nodemailer.com/transports/ses/");
      error2.code = ECONFIG;
      throw error2;
    }
    this.options = options;
    this.ses = this.options.SES;
    this.name = "SESTransport";
    this.version = version;
    this.logger = getLogger(this.options, {
      component: this.options.component || "ses-transport"
    });
  }
  getRegion(cb) {
    if (this.ses.sesClient.config && typeof this.ses.sesClient.config.region === "function") {
      this.ses.sesClient.config.region().then((region) => cb(null, region), (err) => cb(err));
      return;
    }
    return cb(null, false);
  }
  /**
   * Compiles a mailcomposer message and forwards it to SES
   *
   * @param mail MailComposer object
   * @param callback Callback function to run when the sending is completed
   */
  send(mail, callback) {
    let fromHeader = mail.message._headers.find((header) => /^from$/i.test(header.key));
    if (fromHeader) {
      const mimeNode = new mime_node_default("text/plain");
      fromHeader = mimeNode._convertAddresses(mimeNode._parseAddresses(fromHeader.value));
    }
    const envelope = mail.message.getEnvelope();
    const messageId = mail.message.messageId();
    const recipients = [].concat(envelope.to || []);
    if (recipients.length > 3) {
      recipients.push("...and " + recipients.splice(2).length + " more");
    }
    this.logger.info({
      tnx: "send",
      messageId
    }, "Sending message %s to <%s>", messageId, recipients.join(", "));
    const getRawMessage = (next) => {
      if (!mail.data._dkim) {
        mail.data._dkim = {};
      }
      if (mail.data._dkim.skipFields && typeof mail.data._dkim.skipFields === "string") {
        mail.data._dkim.skipFields += ":date:message-id";
      } else {
        mail.data._dkim.skipFields = "date:message-id";
      }
      const sourceStream = mail.message.createReadStream();
      const stream = sourceStream.pipe(new LeWindows());
      const chunks = [];
      let chunklen = 0;
      stream.on("readable", () => {
        let chunk;
        while ((chunk = stream.read()) !== null) {
          chunks.push(chunk);
          chunklen += chunk.length;
        }
      });
      sourceStream.once("error", (err) => stream.emit("error", err));
      stream.once("error", (err) => next(err));
      stream.once("end", () => next(null, Buffer.concat(chunks, chunklen)));
    };
    setImmediate(() => getRawMessage((err, raw) => {
      if (err) {
        this.logger.error({
          err,
          tnx: "send",
          messageId
        }, "Failed creating message for %s. %s", messageId, err.message);
        return callback(err);
      }
      const sesMessage = copyOwnKeys({
        Content: {
          Raw: {
            // required
            Data: raw
            // required
          }
        },
        FromEmailAddress: fromHeader || envelope.from,
        Destination: {
          ToAddresses: envelope.to
        }
      }, mail.data.ses);
      this.getRegion((err2, region) => {
        if (err2 || !region) {
          region = "us-east-1";
        }
        let sendPromise;
        try {
          const command = new this.ses.SendEmailCommand(sesMessage);
          sendPromise = this.ses.sesClient.send(command);
        } catch (err3) {
          tagSesError(err3);
          this.logger.error({
            err: err3,
            tnx: "send"
          }, "Send error for %s: %s", messageId, err3.message);
          setImmediate(() => callback(err3));
          return;
        }
        sendPromise.then((data) => {
          if (region === "us-east-1") {
            region = "email";
          }
          const info = {
            envelope: {
              from: envelope.from,
              to: envelope.to
            },
            messageId: "<" + data.MessageId + (!/@/.test(data.MessageId) ? "@" + region + ".amazonses.com" : "") + ">",
            response: data.MessageId,
            raw
          };
          setImmediate(() => callback(null, info));
        }).catch((err3) => {
          tagSesError(err3);
          this.logger.error({
            err: err3,
            tnx: "send"
          }, "Send error for %s: %s", messageId, err3.message);
          setImmediate(() => callback(err3));
        });
      });
    }));
  }
  verify(callback) {
    let promise;
    if (!callback) {
      promise = new Promise((resolve3, reject) => {
        callback = callbackPromise(resolve3, reject);
      });
    }
    const done = callback;
    const cb = (err) => {
      if (err && !["InvalidParameterValue", "MessageRejected"].includes(err.code || err.Code || err.name)) {
        return done(tagSesError(err));
      }
      return done(null, true);
    };
    const sesMessage = {
      Content: {
        Raw: {
          Data: Buffer.from("From: <invalid@invalid>\r\nTo: <invalid@invalid>\r\n Subject: Invalid\r\n\r\nInvalid")
        }
      },
      FromEmailAddress: "invalid@invalid",
      Destination: {
        ToAddresses: ["invalid@invalid"]
      }
    };
    this.getRegion(() => {
      let sendPromise;
      try {
        const command = new this.ses.SendEmailCommand(sesMessage);
        sendPromise = this.ses.sesClient.send(command);
      } catch (err) {
        setImmediate(() => cb(err));
        return;
      }
      sendPromise.then(() => setImmediate(() => cb(null))).catch((err) => setImmediate(() => cb(err)));
    });
    return promise;
  }
};
var ses_transport_default = SESTransport;

// node_modules/nodemailer/dist/esm/nodemailer.js
var etherealApi = () => (process.env.ETHEREAL_API || "https://api.nodemailer.com").replace(/\/+$/, "");
var etherealWeb = () => (process.env.ETHEREAL_WEB || "https://ethereal.email").replace(/\/+$/, "");
var etherealApiKey = () => (process.env.ETHEREAL_API_KEY || "").replace(/\s*/g, "") || null;
var etherealCache = () => ["true", "yes", "y", "1"].includes((process.env.ETHEREAL_CACHE || "yes").toString().trim().toLowerCase());
var testAccount = false;
function createTransport(transporter, defaults) {
  let options;
  if (
    // provided transporter is a configuration object, not transporter plugin
    typeof transporter === "object" && typeof transporter.send !== "function" || // provided transporter looks like a connection url
    typeof transporter === "string" && /^(smtps?|direct):/i.test(transporter)
  ) {
    const urlConfig = typeof transporter === "string" ? transporter : transporter.url;
    if (urlConfig) {
      const parsed = parseConnectionUrl(urlConfig);
      options = typeof transporter === "object" ? assign(false, copyOwnKeys({}, transporter, (key) => key === "url"), parsed) : parsed;
    } else {
      options = transporter;
    }
    if (options.pool) {
      transporter = new smtp_pool_default(options);
    } else if (options.sendmail) {
      transporter = new sendmail_transport_default(options);
    } else if (options.streamTransport) {
      transporter = new stream_transport_default(options);
    } else if (options.jsonTransport) {
      transporter = new json_transport_default(options);
    } else if (options.SES) {
      const ses = options.SES;
      if (ses.ses && ses.aws) {
        const error2 = new Error("Using legacy SES configuration, expecting @aws-sdk/client-sesv2, see https://nodemailer.com/transports/ses/");
        error2.code = ECONFIG;
        throw error2;
      }
      transporter = new ses_transport_default(options);
    } else {
      transporter = new smtp_transport_default(options);
    }
  }
  return new mailer_default(transporter, options, defaults);
}
function createTestAccount(apiUrl, callback) {
  let promise;
  if (!callback && typeof apiUrl === "function") {
    callback = apiUrl;
    apiUrl = false;
  }
  if (!callback) {
    promise = new Promise((resolve3, reject) => {
      callback = callbackPromise(resolve3, reject);
    });
  }
  const done = callback;
  if (etherealCache() && testAccount) {
    setImmediate(() => done(null, testAccount));
    return promise;
  }
  apiUrl = apiUrl || etherealApi();
  const chunks = [];
  let chunklen = 0;
  const requestHeaders = {};
  const requestBody = {
    requestor: name,
    version
  };
  const apiKey = etherealApiKey();
  if (apiKey) {
    requestHeaders.Authorization = "Bearer " + apiKey;
  }
  const fetchOptions = {
    contentType: "application/json",
    method: "POST",
    headers: requestHeaders,
    body: Buffer.from(JSON.stringify(requestBody))
  };
  if (/^https:/i.test(apiUrl)) {
    fetchOptions.tls = { rejectUnauthorized: true };
  }
  const req = fetch_default(apiUrl + "/user", fetchOptions);
  req.on("readable", () => {
    let chunk;
    while ((chunk = req.read()) !== null) {
      chunks.push(chunk);
      chunklen += chunk.length;
    }
  });
  req.once("error", (err) => done(err));
  req.once("end", () => {
    const res = Buffer.concat(chunks, chunklen);
    let data;
    try {
      data = JSON.parse(res.toString());
    } catch (E) {
      return done(E);
    }
    if (data.status !== "success" || data.error) {
      return done(new Error(data.error || "Request failed"));
    }
    delete data.status;
    testAccount = data;
    done(null, testAccount);
  });
  return promise;
}
function getTestMessageUrl(info) {
  if (!info || !info.response) {
    return false;
  }
  const infoProps = /* @__PURE__ */ new Map();
  const response = info.response.toString();
  if (response.length > 2 && response.charAt(response.length - 1) === "]") {
    const open = response.indexOf("[", response.lastIndexOf("]", response.length - 2) + 1);
    if (open >= 0 && open < response.length - 2) {
      const props = response.substring(open + 1, response.length - 1);
      props.replace(/\b([A-Z0-9]+)=([^\s]+)/g, (m, key, value) => {
        infoProps.set(key, value);
        return m;
      });
    }
  }
  if (infoProps.has("STATUS") && infoProps.has("MSGID")) {
    return (testAccount && testAccount.web || etherealWeb()) + "/message/" + infoProps.get("MSGID");
  }
  return false;
}
var nodemailer = {
  createTransport,
  createTestAccount,
  getTestMessageUrl
};
var nodemailer_default = nodemailer;

// local/email-runtime.mjs
var DAY = 864e5;
var secret = () => (0, import_node_crypto8.randomBytes)(32).toString("hex");
var hash = (value) => (0, import_node_crypto8.createHash)("sha256").update(value).digest("hex");
var reply = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-store",
    ...headers
  }
});
var fail = (status, message) => {
  const error2 = new Error(message);
  error2.status = status;
  throw error2;
};
function emailAddress(value) {
  if (typeof value !== "string") fail(422, "\u8BF7\u8F93\u5165\u6709\u6548\u7684\u90AE\u7BB1\u5730\u5740");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(
    email
  ) || email.split("@")[0].length > 64 || email.includes("..") || email.startsWith(".") || email.split("@")[0].endsWith("."))
    fail(422, "\u8BF7\u8F93\u5165\u6709\u6548\u7684\u90AE\u7BB1\u5730\u5740");
  return email;
}
function validateEmailConfig(value) {
  const { host, port, user, password, from, publicOrigin, otpSecret } = value || {};
  if (typeof host !== "string" || !/^[a-zA-Z0-9.-]+$/.test(host) || ![465, 587].includes(port) || typeof user !== "string" || !user || /[\r\n]/.test(user) || typeof password !== "string" || !password || /[\r\n]/.test(password) || !/^[a-f0-9]{64}$/.test(otpSecret))
    throw new Error("\u90AE\u4EF6\u914D\u7F6E\u683C\u5F0F\u65E0\u6548");
  emailAddress(from);
  const origin = new URL(publicOrigin);
  if (origin.protocol !== "https:" || origin.origin !== publicOrigin)
    throw new Error("\u90AE\u4EF6\u7AD9\u70B9\u5730\u5740\u5FC5\u987B\u662F HTTPS origin");
  return value;
}
async function loadEmailConfig(directory) {
  try {
    const filename = import_node_path3.default.join(directory, "email.json"), stat = await import_promises.default.lstat(filename);
    if (!stat.isFile() || stat.mode & 63)
      throw new Error("\u90AE\u4EF6\u914D\u7F6E\u5FC5\u987B\u4E3A\u6743\u9650 600 \u7684\u666E\u901A\u6587\u4EF6");
    return validateEmailConfig(JSON.parse(await import_promises.default.readFile(filename, "utf8")));
  } catch (error2) {
    if (error2.code === "ENOENT") return null;
    throw new Error("\u90AE\u4EF6\u914D\u7F6E\u4E0D\u53EF\u7528\uFF0C\u8BF7\u68C0\u67E5\u683C\u5F0F\u548C\u6743\u9650");
  }
}
function createSmtpSender(config) {
  validateEmailConfig(config);
  const transport = nodemailer_default.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: true,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 1e4,
    greetingTimeout: 1e4,
    socketTimeout: 15e3,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false
  });
  return {
    async send(message) {
      const result = await transport.sendMail({
        from: { name: "\u8F6E\u5230", address: config.from },
        ...message
      });
      if (!result.accepted?.length) throw new Error("\u90AE\u4EF6\u670D\u52A1\u672A\u63A5\u53D7\u6295\u9012");
    },
    close() {
      transport.close();
    }
  };
}
function createEmailRuntime(db, {
  config = null,
  send,
  now = () => /* @__PURE__ */ new Date(),
  base: base2 = "/",
  autoStart = true,
  intervalMs = 1e4
} = {}) {
  const sql = db.sqlite;
  if (config) validateEmailConfig(config);
  const smtp = config && !send ? createSmtpSender(config) : null;
  const deliver = send || ((message) => smtp.send(message));
  const available = Boolean(config);
  const cookieName = "dorm_email_session";
  let running = null, stopped = false, timer;
  const stamp = () => now().toISOString();
  const transaction = (fn) => {
    sql.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      sql.exec("COMMIT");
      return result;
    } catch (error2) {
      sql.exec("ROLLBACK");
      throw error2;
    }
  };
  if (available)
    transaction(() => {
      const activated = sql.prepare(
        "UPDATE email_entry_policy SET required=1,activated_at=? WHERE id=1 AND required=0"
      ).run(stamp());
      if (activated.changes) sql.exec("DELETE FROM email_sessions");
    });
  const registrationRequired = () => Boolean(
    sql.prepare("SELECT required FROM email_entry_policy WHERE id=1").get()?.required
  );
  const cookie = (token, age = 30 * 86400) => `${cookieName}=${token}; Path=${base2}; HttpOnly; SameSite=Strict; Max-Age=${age}${config?.publicOrigin.startsWith("https:") ? "; Secure" : ""}`;
  function session(request) {
    const token = (request.headers.get("Cookie") || "").split(";").map((v) => v.trim()).find((v) => v.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
    if (!/^[a-f0-9]{64}$/.test(token || "")) return null;
    return sql.prepare(
      "SELECT a.*,s.token_hash AS session_hash,s.created_at AS verified_at,s.expires_at AS session_expires FROM email_sessions s JOIN email_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>?"
    ).get(hash(token), stamp()) || null;
  }
  const required = (request) => {
    const who = session(request);
    if (!who) fail(401, "\u8BF7\u5148\u7528\u90AE\u7BB1\u9A8C\u8BC1\u7801\u767B\u5F55");
    return who;
  };
  async function input(request, fields) {
    const text = await request.text();
    if (text.length > 4096) fail(413, "\u63D0\u4EA4\u5185\u5BB9\u8FC7\u957F");
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      fail(422, "\u8BF7\u68C0\u67E5\u63D0\u4EA4\u5185\u5BB9");
    }
    if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).some((k) => !fields.includes(k)))
      fail(422, "\u8BF7\u68C0\u67E5\u63D0\u4EA4\u5185\u5BB9");
    return data;
  }
  function mutationOrigin(request) {
    if (request.headers.get("X-Dorm-Email") !== "1")
      fail(403, "\u8BF7\u4ECE\u7F51\u7AD9\u9875\u9762\u6267\u884C\u6B64\u64CD\u4F5C");
    const origin = request.headers.get("Origin");
    if (origin && origin !== (config?.publicOrigin || new URL(request.url).origin))
      fail(403, "\u8BF7\u6C42\u6765\u6E90\u65E0\u6548");
  }
  function memberToken(token) {
    if (!/^[a-f0-9]{64}$/i.test(token || "")) fail(401, "\u8BF7\u5148\u8FDB\u5165\u8981\u7ED1\u5B9A\u7684\u5BBF\u820D");
    const digest = hash(token), at = stamp();
    const scoped = sql.prepare(
      `SELECT s.user_id,s.dorm_id,0 AS creator_verified FROM member_sessions s
      JOIN users u ON u.id=s.user_id JOIN dorm_members m ON m.user_id=s.user_id AND m.dorm_id=s.dorm_id AND m.is_active=1
      JOIN dormitories d ON d.id=s.dorm_id AND d.is_demo=0 WHERE s.token_hash=? AND s.expires_at>? AND u.current_dorm_id=s.dorm_id`
    ).get(digest, at);
    const full = scoped || sql.prepare(
      `SELECT s.user_id,u.current_dorm_id AS dorm_id,
      CASE WHEN m.role='admin' AND d.admin_user_id=s.user_id THEN 1 ELSE 0 END AS creator_verified FROM sessions s
      JOIN users u ON u.id=s.user_id JOIN dorm_members m ON m.user_id=u.id AND m.dorm_id=u.current_dorm_id AND m.is_active=1
      JOIN dormitories d ON d.id=m.dorm_id AND d.is_demo=0 WHERE s.token_hash=? AND s.expires_at>?`
    ).get(digest, at);
    if (!full) fail(401, "\u5F53\u524D\u5BBF\u820D\u8EAB\u4EFD\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u8FDB\u5165");
    return { ...full, token_hash: digest };
  }
  function bind(who, token, expectedMember) {
    if (now().getTime() - Date.parse(who.verified_at) > 10 * 6e4)
      fail(401, "\u7ED1\u5B9A\u8EAB\u4EFD\u524D\u8BF7\u91CD\u65B0\u9A8C\u8BC1\u90AE\u7BB1");
    const member = memberToken(token);
    if (expectedMember !== void 0 && member.user_id !== expectedMember)
      fail(409, "\u8FD9\u4EFD\u8BBE\u5907\u51ED\u8BC1\u5C5E\u4E8E\u5176\u4ED6\u6210\u5458\uFF0C\u8BF7\u4F7F\u7528\u539F\u8EAB\u4EFD\u51ED\u8BC1\u6216\u91CD\u65B0\u52A0\u5165");
    const owner = sql.prepare("SELECT admin_user_id FROM dormitories WHERE id=?").get(member.dorm_id);
    if (owner.admin_user_id === member.user_id && !member.creator_verified)
      fail(403, "\u521B\u5EFA\u8005\u8BF7\u5728\u6301\u6709\u7BA1\u7406\u6743\u9650\u7684\u8BBE\u5907\u4E0A\u7ED1\u5B9A\u90AE\u7BB1\uFF0C\u6216\u5148\u6062\u590D\u7BA1\u7406\u6743\u9650");
    const linked = sql.prepare(
      "SELECT * FROM email_members WHERE user_id=? OR (account_id=? AND dorm_id=?)"
    ).all(member.user_id, who.id, member.dorm_id);
    if (linked.some(
      (row) => row.account_id !== who.id || row.user_id !== member.user_id
    ))
      fail(409, "\u8BE5\u8EAB\u4EFD\u6216\u5F53\u524D\u90AE\u7BB1\u5DF2\u7ED1\u5B9A\u5176\u4ED6\u6210\u5458");
    transaction(() => {
      sql.prepare(
        "INSERT INTO email_members(account_id,user_id,dorm_id,creator_verified,bound_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET creator_verified=MAX(creator_verified,excluded.creator_verified)"
      ).run(
        who.id,
        member.user_id,
        member.dorm_id,
        member.creator_verified,
        stamp()
      );
      sql.prepare(
        "DELETE FROM member_sessions WHERE user_id=? AND token_hash<>?"
      ).run(member.user_id, member.token_hash);
      sql.prepare("DELETE FROM sessions WHERE user_id=? AND token_hash<>?").run(member.user_id, member.token_hash);
      const fullSession = Number(
        Boolean(
          sql.prepare("SELECT 1 FROM sessions WHERE token_hash=?").get(member.token_hash)
        )
      );
      sql.prepare(
        `UPDATE ${fullSession ? "sessions" : "member_sessions"} SET expires_at=MIN(expires_at,?) WHERE token_hash=?`
      ).run(who.session_expires, member.token_hash);
      sql.prepare(
        "INSERT INTO email_grants(token_hash,email_session_hash,full_session) VALUES (?,?,?) ON CONFLICT(token_hash) DO UPDATE SET email_session_hash=excluded.email_session_hash"
      ).run(member.token_hash, who.session_hash, fullSession);
    });
  }
  function rooms(who) {
    return sql.prepare(
      `SELECT d.id,d.name,d.invite_code,u.id AS member_id,u.nickname,mm.marker_id,
      CASE WHEN em.creator_verified=1 AND d.admin_user_id=u.id AND m.role='admin' THEN 1 ELSE 0 END AS is_creator
      FROM email_members em JOIN dormitories d ON d.id=em.dorm_id AND d.is_demo=0
      JOIN dorm_members m ON m.dorm_id=em.dorm_id AND m.user_id=em.user_id AND m.is_active=1
      JOIN users u ON u.id=em.user_id AND u.current_dorm_id=em.dorm_id
      LEFT JOIN member_marks mm ON mm.dorm_id=em.dorm_id AND mm.user_id=em.user_id WHERE em.account_id=? ORDER BY em.bound_at DESC`
    ).all(who.id);
  }
  function grant(who, dormId) {
    const room = rooms(who).find((r) => r.id === dormId);
    if (!room) fail(403, "\u8BE5\u90AE\u7BB1\u6CA1\u6709\u8FD9\u4E2A\u5BBF\u820D\u7684\u6709\u6548\u8EAB\u4EFD");
    const token = secret(), digest = hash(token), at = stamp(), expires = who.session_expires;
    const full = Number(room.is_creator);
    transaction(() => {
      const old = sql.prepare(
        `SELECT g.token_hash,g.full_session FROM email_grants g LEFT JOIN member_sessions m ON m.token_hash=g.token_hash
        LEFT JOIN sessions s ON s.token_hash=g.token_hash WHERE g.email_session_hash=? AND COALESCE(m.user_id,s.user_id)=?`
      ).all(who.session_hash, room.member_id);
      for (const row of old)
        sql.prepare(
          `DELETE FROM ${row.full_session ? "sessions" : "member_sessions"} WHERE token_hash=?`
        ).run(row.token_hash);
      for (const row of old)
        sql.prepare("DELETE FROM email_grants WHERE token_hash=?").run(row.token_hash);
      if (full)
        sql.prepare(
          "INSERT INTO sessions(token_hash,user_id,created_at,expires_at,kind) VALUES (?,?,?,?,'account')"
        ).run(digest, room.member_id, at, expires);
      else
        sql.prepare(
          "INSERT INTO member_sessions(token_hash,user_id,dorm_id,created_at,expires_at) VALUES (?,?,?,?,?)"
        ).run(digest, room.member_id, room.id, at, expires);
      sql.prepare(
        "INSERT INTO email_grants(token_hash,email_session_hash,full_session) VALUES (?,?,?)"
      ).run(digest, who.session_hash, full);
    });
    return {
      ...room,
      access_token: token,
      member: {
        user_id: room.member_id,
        nickname: room.nickname,
        marker_id: room.marker_id
      },
      is_creator: Boolean(full)
    };
  }
  function logout(who, insideTransaction = false) {
    if (!who) return;
    const remove = () => {
      for (const row of sql.prepare("SELECT * FROM email_grants WHERE email_session_hash=?").all(who.session_hash))
        sql.prepare(
          `DELETE FROM ${row.full_session ? "sessions" : "member_sessions"} WHERE token_hash=?`
        ).run(row.token_hash);
      sql.prepare("DELETE FROM email_sessions WHERE token_hash=?").run(who.session_hash);
    };
    if (insideTransaction) remove();
    else transaction(remove);
  }
  async function route(request) {
    const pathname = new URL(request.url).pathname, method = request.method;
    if (pathname === "/email/config" && method === "GET")
      return reply({
        available,
        registration_required: registrationRequired()
      });
    if (pathname === "/email/me" && method === "GET") {
      const who2 = session(request);
      return reply(
        who2 ? {
          logged_in: true,
          email: who2.email,
          mail_enabled: Boolean(who2.mail_enabled),
          rooms: rooms(who2)
        } : { logged_in: false }
      );
    }
    if (method !== "POST") fail(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    mutationOrigin(request);
    if (pathname === "/email/code") {
      if (!available) fail(503, "\u90AE\u7BB1\u670D\u52A1\u5C1A\u672A\u914D\u7F6E");
      const data = await input(request, ["email"]), email = emailAddress(data.email), at = stamp();
      const client = (0, import_node_crypto8.createHmac)("sha256", config.otpSecret).update(request.headers.get("X-Dorm-Client") || "unknown").digest("hex");
      const id = secret(), code = String((0, import_node_crypto8.randomInt)(0, 1e6)).padStart(6, "0");
      const digest = (0, import_node_crypto8.createHmac)("sha256", config.otpSecret).update(`${id}:${email}:${code}`).digest("hex");
      transaction(() => {
        const recent = sql.prepare(
          "SELECT COUNT(*) AS n,MAX(created_at) AS last FROM email_challenges WHERE email=? AND created_at>?"
        ).get(email, new Date(now().getTime() - 36e5).toISOString());
        const ips = sql.prepare(
          "SELECT COUNT(*) AS n FROM email_challenges WHERE client_hash=? AND created_at>?"
        ).get(client, new Date(now().getTime() - 36e5).toISOString());
        const total = sql.prepare(
          "SELECT COUNT(*) AS n FROM email_challenges WHERE created_at>?"
        ).get(new Date(now().getTime() - 36e5).toISOString());
        if (recent.n >= 5 || ips.n >= 30 || total.n >= 100 || recent.last && now().getTime() - Date.parse(recent.last) < 6e4)
          fail(429, "\u9A8C\u8BC1\u7801\u53D1\u9001\u8FC7\u4E8E\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5");
        sql.prepare("UPDATE email_challenges SET consumed=1 WHERE email=?").run(email);
        sql.prepare(
          "INSERT INTO email_challenges(id,email,code_hash,client_hash,created_at,expires_at) VALUES (?,?,?,?,?,?)"
        ).run(
          id,
          email,
          digest,
          client,
          at,
          new Date(now().getTime() + 10 * 6e4).toISOString()
        );
      });
      try {
        await deliver({
          to: email,
          subject: "\u8F6E\u5230 \xB7 \u90AE\u7BB1\u9A8C\u8BC1\u7801",
          text: `\u4F60\u7684\u9A8C\u8BC1\u7801\u662F\uFF1A${code}

10 \u5206\u949F\u5185\u6709\u6548\uFF0C\u4EC5\u53EF\u4F7F\u7528\u4E00\u6B21\u3002\u7528\u4E8E\u6CE8\u518C\u6216\u767B\u5F55\u8F6E\u5230\u3002
\u5982\u679C\u4E0D\u662F\u4F60\u672C\u4EBA\u64CD\u4F5C\uFF0C\u8BF7\u5FFD\u7565\u6B64\u90AE\u4EF6\u3002`
        });
      } catch {
        sql.prepare("UPDATE email_challenges SET consumed=1 WHERE id=?").run(id);
        fail(503, "\u9A8C\u8BC1\u7801\u90AE\u4EF6\u6682\u65F6\u53D1\u9001\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5");
      }
      sql.prepare("UPDATE email_challenges SET ready=1 WHERE id=?").run(id);
      return reply({ challenge_id: id, expires_in: 600, retry_after: 60 }, 202);
    }
    if (pathname === "/email/verify") {
      if (!available) fail(503, "\u90AE\u7BB1\u670D\u52A1\u5C1A\u672A\u914D\u7F6E");
      const data = await input(request, [
        "email",
        "challenge_id",
        "code",
        "mail_enabled"
      ]), email = emailAddress(data.email);
      if (!/^[a-f0-9]{64}$/.test(data.challenge_id || "") || !/^\d{6}$/.test(data.code || "") || typeof data.mail_enabled !== "boolean")
        fail(422, "\u8BF7\u8F93\u5165\u516D\u4F4D\u9A8C\u8BC1\u7801");
      const record = sql.prepare("SELECT * FROM email_challenges WHERE id=? AND email=?").get(data.challenge_id, email);
      const invalid = () => fail(401, "\u9A8C\u8BC1\u7801\u9519\u8BEF\u6216\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u83B7\u53D6");
      if (!record || !record.ready || record.consumed || record.attempts >= 5 || record.expires_at <= stamp())
        invalid();
      sql.prepare("UPDATE email_challenges SET attempts=attempts+1 WHERE id=?").run(record.id);
      const digest = (0, import_node_crypto8.createHmac)("sha256", config.otpSecret).update(`${record.id}:${email}:${data.code}`).digest();
      if (!(0, import_node_crypto8.timingSafeEqual)(digest, Buffer.from(record.code_hash, "hex")))
        invalid();
      const token = secret();
      transaction(() => {
        const used = sql.prepare(
          "UPDATE email_challenges SET consumed=1 WHERE id=? AND consumed=0 AND expires_at>?"
        ).run(record.id, stamp());
        if (!used.changes) invalid();
        const previous = session(request);
        if (previous && previous.email !== email) logout(previous, true);
        sql.prepare(
          "INSERT OR IGNORE INTO email_accounts(email,mail_enabled,mail_enabled_at,created_at) VALUES (?,?,?,?)"
        ).run(email, Number(data.mail_enabled), stamp(), stamp());
        const account = sql.prepare("SELECT id FROM email_accounts WHERE email=?").get(email);
        sql.prepare(
          "INSERT INTO email_sessions(token_hash,account_id,created_at,expires_at) VALUES (?,?,?,?)"
        ).run(
          hash(token),
          account.id,
          stamp(),
          new Date(now().getTime() + 30 * DAY).toISOString()
        );
        if (previous?.email === email) {
          sql.prepare(
            "UPDATE email_grants SET email_session_hash=? WHERE email_session_hash=?"
          ).run(hash(token), previous.session_hash);
          sql.prepare("DELETE FROM email_sessions WHERE token_hash=?").run(previous.session_hash);
        }
      });
      return reply({ ok: true }, 200, { "Set-Cookie": cookie(token) });
    }
    const who = required(request);
    if (pathname === "/email/logout") {
      logout(who);
      return reply({ ok: true }, 200, { "Set-Cookie": cookie("", 0) });
    }
    if (pathname === "/email/bind") {
      const data = await input(request, ["member_token", "member_id"]);
      bind(who, data.member_token, data.member_id);
      return reply({ ok: true });
    }
    if (pathname === "/email/enter") {
      const data = await input(request, ["dorm_id"]);
      return reply(grant(who, data.dorm_id));
    }
    if (pathname === "/email/preferences") {
      const data = await input(request, ["mail_enabled"]);
      if (typeof data.mail_enabled !== "boolean")
        fail(422, "\u8BF7\u9009\u62E9\u90AE\u4EF6\u63D0\u9192\u72B6\u6001");
      if (Boolean(who.mail_enabled) === data.mail_enabled)
        return reply({ ok: true });
      sql.prepare(
        "UPDATE email_accounts SET mail_enabled=?,mail_enabled_at=? WHERE id=?"
      ).run(Number(data.mail_enabled), stamp(), who.id);
      if (!data.mail_enabled)
        sql.prepare(
          "UPDATE email_jobs SET status='cancelled' WHERE account_id=? AND status IN ('pending','sending')"
        ).run(who.id);
      return reply({ ok: true });
    }
    if (pathname === "/email/test") {
      if (!available || !who.mail_enabled) fail(409, "\u8BF7\u5148\u5F00\u542F\u90AE\u4EF6\u63D0\u9192");
      const recent = sql.prepare(
        "SELECT id FROM email_jobs WHERE account_id=? AND kind='test' AND created_at>?"
      ).get(who.id, new Date(now().getTime() - 6e4).toISOString());
      if (recent) fail(429, "\u6D4B\u8BD5\u90AE\u4EF6\u5DF2\u63D0\u4EA4\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5");
      sql.prepare(
        "INSERT INTO email_jobs(account_id,kind,next_attempt_at,created_at) VALUES (?,'test',?,?)"
      ).run(who.id, stamp(), stamp());
      kick();
      return reply({ queued: true }, 202);
    }
    fail(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
  }
  function hasEmailGrant(request) {
    const token = /^Bearer ([a-f0-9]{64})$/i.exec(
      request.headers.get("Authorization") || ""
    )?.[1];
    if (!token) return false;
    return Boolean(
      sql.prepare(
        `SELECT 1 FROM email_grants g
      JOIN email_sessions e ON e.token_hash=g.email_session_hash AND e.expires_at>?
      LEFT JOIN member_sessions m ON m.token_hash=g.token_hash
      LEFT JOIN sessions s ON s.token_hash=g.token_hash
      JOIN email_members em ON em.account_id=e.account_id AND em.user_id=COALESCE(m.user_id,s.user_id)
      WHERE g.token_hash=?`
      ).get(stamp(), hash(token))
    );
  }
  function guardEntry(request) {
    if (!registrationRequired()) return;
    const url = new URL(request.url), p = url.pathname;
    if (["/chores/push/config", "/chores/native/config"].includes(p)) return;
    if (request.method === "GET" && p.startsWith("/chores/calendar/")) return;
    if (!/^\/(chores|guest|auth|dorms|duties|notifications|push)(\/|$)/.test(p))
      return;
    if (request.method === "GET" && [
      "/guest/dorm",
      "/guest/tasks",
      "/chores/board",
      "/chores/activity"
    ].includes(p)) {
      const code = url.searchParams.get("invite_code");
      if (!code || sql.prepare(
        "SELECT 1 FROM dormitories WHERE invite_code=? AND is_demo=1"
      ).get(code.trim().toUpperCase()))
        return;
      if (p === "/guest/dorm" && !request.headers.has("Authorization") && session(request))
        return;
    }
    if (!hasEmailGrant(request))
      fail(428, "\u65B0\u7248\u9700\u8981\u5148\u9A8C\u8BC1\u90AE\u7BB1\uFF0C\u518D\u7ED1\u5B9A\u6216\u6062\u590D\u4F60\u7684\u5BBF\u820D\u8EAB\u4EFD");
  }
  async function wrap2(request, dispatch) {
    try {
      const p = new URL(request.url).pathname;
      if (p.startsWith("/email/")) return await route(request);
      if (request.method === "POST" && (p === "/chores/claim" || p === "/guest/create" || p === "/guest/recover")) {
        let who = session(request);
        if (registrationRequired() || who) {
          mutationOrigin(request);
          who = required(request);
        }
        if (p === "/guest/recover" && who) {
          const data = await request.clone().json().catch(() => ({}));
          const conflict = sql.prepare(
            `SELECT 1 FROM dormitories d JOIN email_members em ON em.dorm_id=d.id
            WHERE d.invite_code=? AND ((em.user_id=d.admin_user_id AND em.account_id<>?) OR (em.account_id=? AND em.user_id<>d.admin_user_id))`
          ).get(
            String(data.invite_code || "").trim().toUpperCase(),
            who.id,
            who.id
          );
          if (conflict) fail(403, "\u8BF7\u4F7F\u7528\u8BE5\u5BBF\u820D\u521B\u5EFA\u8005\u7ED1\u5B9A\u7684\u90AE\u7BB1\u6062\u590D\u7BA1\u7406\u6743\u9650");
        }
        if (p === "/chores/claim") {
          const data = await request.clone().json().catch(() => ({}));
          const member = sql.prepare(
            `SELECT u.id,d.id AS dorm_id,d.admin_user_id FROM users u JOIN dorm_members m ON m.user_id=u.id AND m.is_active=1
            JOIN dormitories d ON d.id=m.dorm_id AND d.is_demo=0 WHERE d.invite_code=? AND u.nickname=?`
          ).get(
            String(data.invite_code || "").trim().toUpperCase(),
            String(data.nickname || "").trim()
          );
          if (member) {
            const existing = sql.prepare("SELECT account_id FROM email_members WHERE user_id=?").get(member.id);
            if (existing && existing.account_id !== who?.id)
              fail(403, "\u6B64\u6210\u5458\u5DF2\u7ED1\u5B9A\u90AE\u7BB1\uFF0C\u8BF7\u4F7F\u7528\u672C\u4EBA\u7684\u90AE\u7BB1\u767B\u5F55");
            if (existing) return reply(grant(who, member.dorm_id), 201);
            if (who && sql.prepare(
              "SELECT 1 FROM email_members WHERE account_id=? AND dorm_id=?"
            ).get(who.id, member.dorm_id))
              fail(403, "\u8FD9\u4E2A\u90AE\u7BB1\u5DF2\u7ED1\u5B9A\u672C\u5BBF\u820D\u5176\u4ED6\u8EAB\u4EFD\uFF0C\u4E0D\u80FD\u5207\u6362\u4E3A\u5BA4\u53CB");
            if (who && member.admin_user_id === member.id)
              fail(403, "\u521B\u5EFA\u8005\u8BF7\u5148\u5728\u539F\u8BBE\u5907\u7ED1\u5B9A\u90AE\u7BB1\uFF0C\u6216\u6062\u590D\u7BA1\u7406\u6743\u9650\u540E\u518D\u7ED1\u5B9A");
          }
        }
        if (who && p !== "/guest/create" && now().getTime() - Date.parse(who.verified_at) > 10 * 6e4)
          fail(401, "\u7ED1\u5B9A\u5BBF\u820D\u8EAB\u4EFD\u524D\u8BF7\u91CD\u65B0\u9A8C\u8BC1\u90AE\u7BB1");
        const result = await dispatch(
          request,
          who && p === "/guest/create" ? { accountId: who.id, sessionHash: who.session_hash } : void 0
        );
        if (who && p === "/guest/create" && !result.ok && !session(request))
          fail(401, "\u90AE\u7BB1\u767B\u5F55\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u9A8C\u8BC1\u540E\u521B\u5EFA\u5BBF\u820D");
        if (who && result.ok && p !== "/guest/create") {
          const data = await result.clone().json();
          try {
            bind(who, data.access_token);
          } catch (error2) {
            const digest = hash(data.access_token);
            sql.prepare(
              `DELETE FROM ${p === "/guest/recover" ? "sessions" : "member_sessions"} WHERE token_hash=?`
            ).run(digest);
            throw error2;
          }
        }
        return result;
      }
      if (registrationRequired() && ["/auth/register", "/auth/login"].includes(p))
        fail(409, "\u65B0\u8D26\u53F7\u8BF7\u4F7F\u7528\u90AE\u7BB1\u9A8C\u8BC1\u7801\u6CE8\u518C");
      guardEntry(request);
      return await dispatch(request);
    } catch (error2) {
      return reply(
        {
          detail: {
            message: error2.status ? error2.message : "\u90AE\u7BB1\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5"
          }
        },
        error2.status || 500
      );
    }
  }
  function enqueue() {
    sql.prepare(
      `INSERT OR IGNORE INTO email_jobs(account_id,reminder_id,next_attempt_at,created_at)
      SELECT a.id,r.id,?,? FROM chore_reminders r JOIN email_members em ON em.user_id=r.target_member_id AND em.dorm_id=r.dorm_id
      JOIN email_accounts a ON a.id=em.account_id AND a.mail_enabled=1
      JOIN dorm_members m ON m.user_id=em.user_id AND m.dorm_id=em.dorm_id AND m.is_active=1
      JOIN users u ON u.id=em.user_id AND u.current_dorm_id=em.dorm_id
      JOIN dormitories d ON d.id=r.dorm_id AND d.is_demo=0
      WHERE r.created_at>=em.bound_at AND r.created_at>=a.mail_enabled_at AND r.created_at>?
      AND NOT EXISTS(SELECT 1 FROM email_jobs j WHERE j.account_id=a.id AND j.reminder_id=r.id)
      ORDER BY r.id LIMIT 256`
    ).run(stamp(), stamp(), new Date(now().getTime() - DAY).toISOString());
  }
  function eligible(job) {
    const account = sql.prepare("SELECT * FROM email_accounts WHERE id=? AND mail_enabled=1").get(job.account_id);
    if (!account) return null;
    if (job.kind === "test") return { account };
    const r = sql.prepare(
      `SELECT r.*,u.nickname,d.name AS dorm_name,t.key AS task_key,t.status AS task_status,c.enabled AS category_enabled,
      s.preference_version,s.task_ids,p.version AS plan_version,p.enabled AS plan_enabled FROM chore_reminders r
      JOIN email_members em ON em.user_id=r.target_member_id AND em.dorm_id=r.dorm_id AND em.account_id=?
      JOIN dorm_members m ON m.user_id=em.user_id AND m.dorm_id=em.dorm_id AND m.is_active=1
      JOIN users u ON u.id=em.user_id AND u.current_dorm_id=em.dorm_id JOIN dormitories d ON d.id=em.dorm_id AND d.is_demo=0
      LEFT JOIN chore_tasks t ON t.id=r.task_id LEFT JOIN chore_categories c ON c.dorm_id=t.dorm_id AND c.key=t.key
      LEFT JOIN chore_scheduled_reminders s ON s.reminder_id=r.id LEFT JOIN chore_reminder_preferences p ON p.id=s.preference_id
      WHERE r.id=? AND r.created_at>=em.bound_at AND r.created_at>=?`
    ).get(job.account_id, job.reminder_id, account.mail_enabled_at);
    if (!r || r.read_at || r.task_id && (r.task_status !== "pending" || !r.category_enabled))
      return null;
    if (r.source === "scheduled" && (!r.plan_enabled || r.plan_version !== r.preference_version))
      return null;
    if (r.source === "scheduled") {
      const pending = sql.prepare(
        `SELECT t.name FROM chore_tasks t JOIN chore_categories c ON c.dorm_id=t.dorm_id AND c.key=t.key
        WHERE t.id IN (SELECT value FROM json_each(?)) AND t.dorm_id=? AND t.assignee_id=? AND t.status='pending' AND c.enabled=1 ORDER BY t.key`
      ).all(r.task_ids || "[]", r.dorm_id, r.target_member_id);
      if (!pending.length) return null;
      r.task_content_snapshot = pending.map((t) => t.name).join("\u3001") + "\u8FD8\u6CA1\u5B8C\u6210\uFF0C\u505A\u5B8C\u8BB0\u5F97\u6253\u5361\u3002";
    }
    return { account, reminder: r };
  }
  async function run() {
    if (!available) return;
    enqueue();
    const due = sql.prepare(
      "SELECT * FROM email_jobs WHERE (status='pending' AND next_attempt_at<=?) OR (status='sending' AND lease_until<?) ORDER BY id LIMIT 16"
    ).all(stamp(), stamp());
    for (const job of due) {
      if (stopped) break;
      const data = eligible(job);
      const daily = sql.prepare(
        "SELECT COUNT(*) AS n,MAX(accepted_at) AS last FROM email_jobs WHERE account_id=? AND kind='reminder' AND accepted_at>?"
      ).get(job.account_id, new Date(now().getTime() - DAY).toISOString());
      if (!data || Date.parse(job.created_at) < now().getTime() - DAY || job.kind === "reminder" && (daily.n >= 50 || daily.last && now().getTime() - Date.parse(daily.last) < 6e4)) {
        sql.prepare(
          "UPDATE email_jobs SET status='cancelled',lease_until=NULL WHERE id=?"
        ).run(job.id);
        continue;
      }
      const claim = sql.prepare(
        "UPDATE email_jobs SET status='sending',attempts=attempts+1,lease_until=? WHERE id=? AND ((status='pending' AND next_attempt_at<=?) OR (status='sending' AND lease_until<?))"
      ).run(
        new Date(now().getTime() + 6e4).toISOString(),
        job.id,
        stamp(),
        stamp()
      );
      if (Number(claim.changes) !== 1) continue;
      const r = data.reminder;
      const subject = r ? r.source === "scheduled" ? `\u8F6E\u5230 \xB7 \u7CFB\u7EDF\u503C\u65E5\u63D0\u9192` : `\u8F6E\u5230 \xB7 ${r.sender_name_snapshot}\u50AC\u4FC3\u4F60${r.task_name_snapshot}` : "\u8F6E\u5230 \xB7 \u6D4B\u8BD5\u90AE\u4EF6";
      const text = r ? `${r.nickname}\uFF0C${r.source === "scheduled" ? "\u7CFB\u7EDF\u63D0\u9192\uFF1A\u4F60\u6709\u672A\u5B8C\u6210\u7684\u503C\u65E5\u3002" : `${r.sender_name_snapshot}\u63D0\u9192\u4F60${r.task_name_snapshot}\u3002`}

${r.task_content_snapshot}

${r.source === "scheduled" ? "\u53D1\u8D77\u4EBA\uFF1A\u7CFB\u7EDF\u81EA\u52A8\u63D0\u9192" : `\u53D1\u8D77\u4EBA\uFF1A${r.sender_name_snapshot}`}
\u5BBF\u820D\uFF1A${r.dorm_name}` : "\u8FD9\u662F\u4E00\u6761\u6D4B\u8BD5\u90AE\u4EF6\u3002\u4F60\u5DF2\u5F00\u542F\u8F6E\u5230\u90AE\u4EF6\u63D0\u9192\u3002";
      try {
        await deliver({
          to: data.account.email,
          subject,
          text: `${text}

\u6253\u5F00\u8F6E\u5230\uFF1A${config.publicOrigin}${base2}${r?.task_key === "water" ? "water" : ""}
\u53EF\u5728\u300C\u90AE\u7BB1\u8D26\u53F7 \u2192 \u90AE\u4EF6\u63D0\u9192\u300D\u4E2D\u5173\u95ED\u3002`,
          messageId: `<dorm-email-${job.id}@${new URL(config.publicOrigin).hostname}>`
        });
        sql.prepare(
          "UPDATE email_jobs SET status='accepted',accepted_at=?,lease_until=NULL WHERE id=?"
        ).run(stamp(), job.id);
      } catch {
        const attempts = job.attempts + 1;
        sql.prepare(
          "UPDATE email_jobs SET status=?,next_attempt_at=?,lease_until=NULL WHERE id=?"
        ).run(
          attempts >= 4 ? "failed" : "pending",
          new Date(
            now().getTime() + [6e4, 3e5, 9e5, 18e5][Math.min(attempts - 1, 3)]
          ).toISOString(),
          job.id
        );
      }
    }
    sql.prepare("DELETE FROM email_challenges WHERE created_at<?").run(new Date(now().getTime() - DAY).toISOString());
    for (const row of sql.prepare(
      "SELECT token_hash AS session_hash FROM email_sessions WHERE expires_at<=?"
    ).all(stamp()))
      logout(row);
  }
  function drain() {
    if (stopped) return Promise.resolve();
    if (!running)
      running = run().finally(() => {
        running = null;
      });
    return running;
  }
  function kick() {
    void drain().catch(() => console.error("\u90AE\u4EF6\u961F\u5217\u6682\u65F6\u5904\u7406\u5931\u8D25\uFF0C\u5C06\u7A0D\u540E\u91CD\u8BD5"));
  }
  if (autoStart && available) {
    timer = setInterval(kick, intervalMs);
    timer.unref();
    kick();
  }
  return {
    wrap: wrap2,
    drain,
    available,
    async close() {
      stopped = true;
      clearInterval(timer);
      await running;
      smtp?.close();
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createEmailRuntime,
  createSmtpSender,
  loadEmailConfig,
  validateEmailConfig
});
