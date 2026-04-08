const pino = require("pino");
const { AsyncLocalStorage } = require("async_hooks");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const SERVICE_NAME = "affiliate-backend";

const messagePreferenceOrder = [
  "message",
  "msg",
  "error_stack",
  "error",
  "reason",
  "detail",
  "details",
];

const LOGGER_FILE = __filename;
const NODE_MODULES_SNIPPET = `${path.sep}node_modules${path.sep}`;

const als = new AsyncLocalStorage();

const skipMessageKeys = new Set(["service_name", "reqId", "caller"]);

const baseLogger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: { service_name: SERVICE_NAME },
  timestamp: pino.stdTimeFunctions.isoTime,
});

function getCallerFromStack() {
  const previous = Error.prepareStackTrace;
  Error.prepareStackTrace = (_, structured) => structured;
  const err = new Error();
  Error.captureStackTrace(err, getCallerFromStack);
  const callSites = err.stack || [];
  Error.prepareStackTrace = previous;
  for (const site of callSites) {
    if (!site || typeof site.getFileName !== "function") continue;
    const file = site.getFileName();
    if (!file || file === LOGGER_FILE) continue;
    if (file.includes(NODE_MODULES_SNIPPET)) continue;
    const relPath = path.relative(process.cwd(), file);
    const normalizedRelPath = relPath.split(path.sep).join("/");
    const projectRoot = path.basename(process.cwd());
    const callerPath =
      relPath && !relPath.startsWith("..")
        ? `${projectRoot}/${normalizedRelPath}`
        : normalizedRelPath || file.split(path.sep).join("/");
    const line = site.getLineNumber();
    return line ? `${callerPath}:${line}` : callerPath;
  }
  return "";
}

function ensureContextAttrs(attrs = {}, context = {}) {
  const payload = { ...attrs };
  if (payload.request_id && !payload.reqId) {
    payload.reqId = payload.request_id;
  }
  delete payload.request_id;
  const { reqId, requestId, caller, jobRunId } = context;
  const effectiveReqId = reqId || requestId;
  if (!payload.reqId && effectiveReqId) {
    payload.reqId = effectiveReqId;
  }
  if (!payload.caller) {
    payload.caller = caller || getCallerFromStack() || "";
  }
  if (!payload.job_run_id && jobRunId) {
    payload.job_run_id = jobRunId;
  }
  return payload;
}

function stringifyValue(value) {
  if (value === null) return "null";
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`;
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (err) {
      return String(value);
    }
  }
  return String(value);
}

function buildAttrMessage(payload) {
  const parts = [];
  for (const [key, value] of Object.entries(payload)) {
    if (skipMessageKeys.has(key)) continue;
    if (typeof value === "undefined") continue;
    const rendered = stringifyValue(value);
    if (rendered === "") continue;
    parts.push(`${key}=${rendered}`);
  }
  return parts.join(", ");
}

function emit(level, msg, attrs = {}) {
  const store = als.getStore() || {};
  const context = {
    reqId: store.reqId || store.requestId || attrs.reqId || attrs.request_id,
    requestId: store.requestId,
    caller: attrs.caller || store.caller,
    jobRunId: attrs.job_run_id || store.jobRunId,
  };
  const { message, attrs: payload } = resolveLogPayload(
    msg,
    ensureContextAttrs(attrs, context),
  );
  payload.message = message;
  if (baseLogger[level]) {
    baseLogger[level](payload, message);
  } else {
    baseLogger.info(payload, message);
  }
}

const logger = {
  debug: (m, a) => emit("debug", m, a),
  info: (m, a) => emit("info", m, a),
  warn: (m, a) => emit("warn", m, a),
  error: (m, a) => emit("error", m, a),
  fatal: (m, a) => emit("fatal", m, a),
};

function isMsgDefinition(candidate) {
  return (
    candidate &&
    typeof candidate === "object" &&
    (typeof candidate.text === "string" ||
      typeof candidate.message === "string")
  );
}

function normalizeLogArgs(args) {
  const [first, second, third] = args;
  if (args.length === 0) {
    return { msgDef: null, attrs: {}, level: "info" };
  }
  if (args.length === 1) {
    if (typeof first === "string" || isMsgDefinition(first)) {
      return { msgDef: first, attrs: {}, level: "info" };
    }
    if (first && typeof first === "object") {
      return { msgDef: null, attrs: first, level: "info" };
    }
    return { msgDef: null, attrs: {}, level: "info" };
  }
  if (args.length === 2) {
    if (typeof first === "string" && typeof second === "string") {
      return { msgDef: first, attrs: {}, level: second };
    }
    if (typeof second === "string" && !isMsgDefinition(first)) {
      return {
        msgDef: typeof first === "string" ? first : null,
        attrs: first && typeof first === "object" ? first : {},
        level: second,
      };
    }
    return { msgDef: first, attrs: second || {}, level: "info" };
  }
  return {
    msgDef: first,
    attrs: second || {},
    level: typeof third === "string" ? third : "info",
  };
}

function resolveLogPayload(msgDef, attrs = {}) {
  const payload = { ...attrs };
  let defMessage = "";
  let chosenMessage = "";
  if (typeof msgDef === "string") {
    defMessage = msgDef;
  } else if (isMsgDefinition(msgDef)) {
    if (typeof msgDef.text === "string") {
      defMessage = msgDef.text;
    } else if (typeof msgDef.message === "string") {
      defMessage = msgDef.message;
    }
    if (typeof msgDef.key === "string") {
      payload.msg_key = msgDef.key;
    }
  }

  let attrMessage = "";
  for (const key of messagePreferenceOrder) {
    const candidate = payload[key];
    if (typeof candidate === "string" && candidate.trim()) {
      attrMessage = candidate.trim();
      break;
    }
  }

  if (defMessage && attrMessage) {
    chosenMessage =
      attrMessage === defMessage || defMessage.includes(attrMessage)
        ? defMessage
        : `${defMessage} | ${attrMessage}`;
  } else if (attrMessage) {
    chosenMessage = attrMessage;
  } else if (defMessage) {
    chosenMessage = defMessage;
  } else {
    chosenMessage = "log.event";
  }

  const appended = buildAttrMessage(payload);
  const finalMessage =
    appended && chosenMessage
      ? `${chosenMessage} | ${appended}`
      : chosenMessage;

  return { message: finalMessage, attrs: payload };
}

function logMsg(...args) {
  const { msgDef, attrs, level } = normalizeLogArgs(args);
  emit(level, msgDef, attrs);
}

const requestIdMiddleware = (req, res, next) => {
  const headers = req.headers || {};
  const incoming = headers["x-request-id"];
  const requestId =
    typeof incoming === "string" && incoming.trim() ? incoming : uuidv4();
  const callerHeader =
    headers["x-caller"] ??
    headers["caller"] ??
    headers["x-caller-id"] ??
    headers["caller-id"];
  const jobRunIdHeader =
    headers["x-job-run-id"] ??
    headers["job-run-id"] ??
    headers["x-job_run_id"] ??
    headers["job_run_id"];

  res.setHeader("X-Request-ID", requestId);
  req.requestId = requestId;

  const context = {
    reqId: requestId,
    requestId,
    caller: typeof callerHeader === "string" ? callerHeader : undefined,
    jobRunId: typeof jobRunIdHeader === "string" ? jobRunIdHeader : undefined,
  };

  als.enterWith(context);

  const injectContext = (attrs) => ensureContextAttrs(attrs, context);

  req.logEx = {
    debug: (m, a) => logger.debug(m, injectContext(a)),
    info: (m, a) => logger.info(m, injectContext(a)),
    warn: (m, a) => logger.warn(m, injectContext(a)),
    error: (m, a) => logger.error(m, injectContext(a)),
    fatal: (m, a) => logger.fatal(m, injectContext(a)),
  };

  req.logMsg = (...args) => {
    const { msgDef, attrs, level } = normalizeLogArgs(args);
    emit(level, msgDef, injectContext(attrs));
  };

  // Back-compat alias
  req.log = req.logEx;

  next();
};

const getRequestId = () => {
  const store = als.getStore();
  return store?.reqId || store?.requestId;
};

const withRequestIdHeader = (headers = {}) => {
  const rid = getRequestId();
  return rid ? { ...headers, "X-Request-ID": rid } : headers;
};

module.exports = {
  logger,
  logMsg,
  requestIdMiddleware,
  getRequestId,
  withRequestIdHeader,
};
