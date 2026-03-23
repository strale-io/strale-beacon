/**
 * Schema drift detection — compares actual API responses to the OpenAPI spec.
 *
 * Makes real GET requests to documented public endpoints and checks whether
 * the response shape matches what the spec promises. Reports specific
 * mismatches: missing keys, extra keys, wrong types.
 */

import type { CheckDefinition, CheckResult, ScanContext, Probe } from "./types";
import { beaconFetch } from "./fetch";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EndpointCandidate {
  path: string;
  responseSchema: Record<string, unknown> | null;
}

interface SchemaMismatch {
  field: string;
  expected: string;
  actual: string;
  severity: "missing" | "extra" | "type_mismatch";
}

interface EndpointResult {
  path: string;
  url: string;
  status: number;
  matched: boolean;
  mismatches: SchemaMismatch[];
  matchedKeys: number;
}

// ─── $ref resolution ─────────────────────────────────────────────────────────

function resolveRef(spec: Record<string, unknown>, ref: string): Record<string, unknown> | null {
  // Handle JSON Pointer: "#/components/schemas/Foo"
  if (!ref.startsWith("#/")) return null;
  const parts = ref.substring(2).split("/");
  let current: unknown = spec;
  for (const part of parts) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[part];
  }
  return (current && typeof current === "object") ? current as Record<string, unknown> : null;
}

/** Recursively resolve all $ref in a schema object (up to 5 levels deep) */
function resolveSchema(spec: Record<string, unknown>, schema: Record<string, unknown>, depth = 0): Record<string, unknown> {
  if (depth > 5) return schema;

  if (schema["$ref"] && typeof schema["$ref"] === "string") {
    const resolved = resolveRef(spec, schema["$ref"]);
    if (resolved) return resolveSchema(spec, resolved, depth + 1);
    return schema;
  }

  const result: Record<string, unknown> = { ...schema };

  // Resolve properties
  if (result.properties && typeof result.properties === "object") {
    const props: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(result.properties as Record<string, unknown>)) {
      if (val && typeof val === "object") {
        const valObj = val as Record<string, unknown>;
        if (valObj["$ref"] && typeof valObj["$ref"] === "string") {
          const resolved = resolveRef(spec, valObj["$ref"]);
          props[key] = resolved ? resolveSchema(spec, resolved, depth + 1) : valObj;
        } else {
          props[key] = resolveSchema(spec, valObj, depth + 1);
        }
      } else {
        props[key] = val;
      }
    }
    result.properties = props;
  }

  // Resolve items (for arrays)
  if (result.items && typeof result.items === "object") {
    const items = result.items as Record<string, unknown>;
    if (items["$ref"] && typeof items["$ref"] === "string") {
      const resolved = resolveRef(spec, items["$ref"]);
      result.items = resolved ? resolveSchema(spec, resolved, depth + 1) : items;
    } else {
      result.items = resolveSchema(spec, items, depth + 1);
    }
  }

  // Resolve allOf/oneOf/anyOf
  for (const combiner of ["allOf", "oneOf", "anyOf"]) {
    if (Array.isArray(result[combiner])) {
      result[combiner] = (result[combiner] as Array<Record<string, unknown>>).map((s) =>
        resolveSchema(spec, s, depth + 1)
      );
    }
  }

  // Flatten allOf into a single object with merged properties
  if (Array.isArray(result.allOf)) {
    const merged: Record<string, unknown> = {};
    for (const sub of result.allOf as Array<Record<string, unknown>>) {
      if (sub.properties && typeof sub.properties === "object") {
        Object.assign(merged, sub.properties);
      }
    }
    if (Object.keys(merged).length > 0) {
      result.properties = { ...(result.properties as Record<string, unknown> || {}), ...merged };
    }
  }

  return result;
}

// ─── Endpoint selection ──────────────────────────────────────────────────────

function selectEndpoints(spec: Record<string, unknown>): EndpointCandidate[] {
  const paths = spec.paths as Record<string, Record<string, unknown>> | undefined;
  if (!paths) return [];

  // Check which endpoints require auth
  const globalSecurity = spec.security as Array<Record<string, unknown>> | undefined;
  const hasGlobalAuth = globalSecurity && globalSecurity.length > 0;

  const candidates: EndpointCandidate[] = [];

  for (const [path, methods] of Object.entries(paths)) {
    const getOp = methods.get as Record<string, unknown> | undefined;
    if (!getOp) continue;

    // Skip if endpoint has path parameters (we can't guess IDs)
    if (/\{[^}]+\}/.test(path)) continue;

    // Check auth requirements
    const endpointSecurity = getOp.security as Array<Record<string, unknown>> | undefined;
    const requiresAuth = endpointSecurity
      ? endpointSecurity.length > 0 && !endpointSecurity.some((s) => Object.keys(s).length === 0)
      : hasGlobalAuth;

    // Skip if requires auth
    if (requiresAuth) continue;

    // Get response schema for 200
    const responses = getOp.responses as Record<string, Record<string, unknown>> | undefined;
    if (!responses) continue;

    const ok = responses["200"] || responses["201"] || responses["default"];
    if (!ok) continue;

    let responseSchema: Record<string, unknown> | null = null;

    // OpenAPI 3.x: response.content.application/json.schema
    const content = ok.content as Record<string, Record<string, unknown>> | undefined;
    if (content) {
      const jsonContent = content["application/json"];
      if (jsonContent?.schema) {
        responseSchema = resolveSchema(spec, jsonContent.schema as Record<string, unknown>);
      }
    }

    // Swagger 2.x: response.schema
    if (!responseSchema && ok.schema) {
      responseSchema = resolveSchema(spec, ok.schema as Record<string, unknown>);
    }

    candidates.push({ path, responseSchema });
  }

  // Prefer endpoints likely to work: /health, /status, /capabilities, then shorter paths
  candidates.sort((a, b) => {
    const priorityPaths = ["/health", "/status", "/capabilities", "/info", "/version"];
    const aPri = priorityPaths.findIndex((p) => a.path.includes(p));
    const bPri = priorityPaths.findIndex((p) => b.path.includes(p));
    if (aPri !== -1 && bPri === -1) return -1;
    if (bPri !== -1 && aPri === -1) return 1;
    if (aPri !== -1 && bPri !== -1) return aPri - bPri;
    return a.path.length - b.path.length;
  });

  return candidates.slice(0, 5);
}

// ─── Schema comparison ───────────────────────────────────────────────────────

function getSchemaType(schema: Record<string, unknown>): string {
  if (schema.type) return String(schema.type);
  if (schema.properties) return "object";
  if (schema.items) return "array";
  if (schema.allOf || schema.oneOf || schema.anyOf) return "object";
  return "unknown";
}

function getActualType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function compareSchema(
  schema: Record<string, unknown>,
  actual: unknown,
  prefix = "",
  depth = 0
): SchemaMismatch[] {
  if (depth > 2) return []; // Only check 2 levels deep
  const mismatches: SchemaMismatch[] = [];

  const expectedType = getSchemaType(schema);
  const actualType = getActualType(actual);

  // Type-level mismatch (integer and number are compatible in JSON)
  const typesCompatible =
    expectedType === actualType ||
    expectedType === "unknown" ||
    (expectedType === "integer" && actualType === "number") ||
    (expectedType === "number" && actualType === "number");

  if (!typesCompatible) {
    // Array vs object containing array is common — check if response wraps in pagination
    if (expectedType === "array" && actualType === "object") {
      // Check if the object contains an array (common pagination wrapper)
      const obj = actual as Record<string, unknown>;
      const hasArray = Object.values(obj).some(Array.isArray);
      if (!hasArray) {
        mismatches.push({
          field: prefix || "(root)",
          expected: expectedType,
          actual: actualType,
          severity: "type_mismatch",
        });
      }
    } else {
      mismatches.push({
        field: prefix || "(root)",
        expected: expectedType,
        actual: actualType,
        severity: "type_mismatch",
      });
    }
    return mismatches;
  }

  // Object property comparison
  if (expectedType === "object" && actualType === "object" && schema.properties) {
    const specProps = schema.properties as Record<string, Record<string, unknown>>;
    const actualObj = actual as Record<string, unknown>;
    const specKeys = new Set(Object.keys(specProps));
    const actualKeys = new Set(Object.keys(actualObj));

    // Missing keys (in spec but not in response)
    for (const key of specKeys) {
      if (!actualKeys.has(key)) {
        // Check if it's a required field
        const required = Array.isArray(schema.required) && (schema.required as string[]).includes(key);
        mismatches.push({
          field: prefix ? `${prefix}.${key}` : key,
          expected: `${getSchemaType(specProps[key])} (${required ? "required" : "optional"})`,
          actual: "missing",
          severity: "missing",
        });
      }
    }

    // Extra keys (in response but not in spec)
    for (const key of actualKeys) {
      if (!specKeys.has(key)) {
        mismatches.push({
          field: prefix ? `${prefix}.${key}` : key,
          expected: "not documented",
          actual: getActualType(actualObj[key]),
          severity: "extra",
        });
      }
    }

    // Recurse into matching keys
    for (const key of specKeys) {
      if (actualKeys.has(key) && depth < 2) {
        const childPath = prefix ? `${prefix}.${key}` : key;
        mismatches.push(...compareSchema(specProps[key], actualObj[key], childPath, depth + 1));
      }
    }
  }

  // Array item comparison (check first element)
  if (expectedType === "array" && actualType === "array" && schema.items) {
    const arr = actual as unknown[];
    if (arr.length > 0) {
      const itemSchema = schema.items as Record<string, unknown>;
      mismatches.push(...compareSchema(itemSchema, arr[0], `${prefix}[0]`, depth + 1));
    }
  }

  return mismatches;
}

// ─── Main handler ────────────────────────────────────────────────────────────

function toProbe(url: string, result: { ok: boolean; status: number; headers: Record<string, string>; body: string; error?: string }): Probe {
  return {
    url,
    method: "GET",
    status: result.status || null,
    contentType: result.headers["content-type"] || null,
    snippet: result.body ? result.body.substring(0, 200) : null,
    error: result.error || null,
  };
}

export async function checkSchemaDrift(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const probes: Probe[] = [];

  // No spec available
  if (!ctx.openapiSpec) {
    return {
      check_id: check.id,
      name: check.name,
      status: "pass",
      finding: "Schema drift check requires an OpenAPI spec. No spec was found — see the OpenAPI discovery check.",
      recommendation: "",
      weight: check.weight,
      probes: [],
      detectionMethod: check.how_we_check,
      confidence: "high",
      foundButUnrecognized: false,
    };
  }

  const spec = ctx.openapiSpec;

  // Select endpoints to test
  const candidates = selectEndpoints(spec);

  if (candidates.length === 0) {
    // Check if there are endpoints but they all require auth
    const paths = spec.paths as Record<string, Record<string, unknown>> | undefined;
    const totalGetEndpoints = paths
      ? Object.values(paths).filter((m) => m.get).length
      : 0;

    return {
      check_id: check.id,
      name: check.name,
      status: "pass",
      finding: totalGetEndpoints > 0
        ? `OpenAPI spec has ${totalGetEndpoints} GET endpoint(s) but all require authentication or path parameters. Schema drift check needs at least one public parameterless GET endpoint.`
        : "OpenAPI spec found but no GET endpoints documented. Schema drift check skipped.",
      recommendation: "",
      weight: check.weight,
      probes: [],
      detectionMethod: check.how_we_check,
      confidence: "high",
      foundButUnrecognized: false,
    };
  }

  // Determine base URL
  let apiBase = ctx.baseUrl;
  const servers = spec.servers as Array<Record<string, unknown>> | undefined;
  if (servers && servers.length > 0 && typeof servers[0].url === "string") {
    const serverUrl = servers[0].url;
    if (serverUrl.startsWith("http")) {
      apiBase = serverUrl.replace(/\/$/, "");
    } else if (serverUrl.startsWith("/")) {
      apiBase = ctx.baseUrl + serverUrl.replace(/\/$/, "");
    }
  }

  // Make requests and compare
  const endpointResults: EndpointResult[] = [];
  let hasSchemas = false;

  const totalDocumented = (spec.paths ? Object.values(spec.paths as Record<string, Record<string, unknown>>).filter((m) => m.get).length : 0);

  for (const candidate of candidates) {
    const url = apiBase + candidate.path;
    const result = await beaconFetch(url, { timeoutMs: 10_000 });
    probes.push(toProbe(url, result));

    if (!result.ok || !result.headers["content-type"]?.includes("json")) {
      // 4xx responses likely mean the endpoint requires parameters we don't have — skip, not drift
      endpointResults.push({
        path: candidate.path,
        url,
        status: result.status,
        matched: true, // Not counted as drift — we couldn't test it
        mismatches: [],
        matchedKeys: 0,
      });
      continue;
    }

    let responseJson: unknown;
    try {
      responseJson = JSON.parse(result.body);
    } catch {
      endpointResults.push({
        path: candidate.path,
        url,
        status: result.status,
        matched: false,
        mismatches: [{ field: "(body)", expected: "valid JSON", actual: "parse error", severity: "type_mismatch" }],
        matchedKeys: 0,
      });
      continue;
    }

    if (!candidate.responseSchema) {
      // No schema to compare against
      endpointResults.push({
        path: candidate.path,
        url,
        status: result.status,
        matched: true, // Can't fail if there's nothing to compare
        mismatches: [],
        matchedKeys: 0,
      });
      continue;
    }

    hasSchemas = true;
    const mismatches = compareSchema(candidate.responseSchema, responseJson);

    const significantMismatches = mismatches.filter((m) => m.severity === "missing" || m.severity === "type_mismatch");
    const extraKeys = mismatches.filter((m) => m.severity === "extra");

    // Count matched keys
    const specProps = candidate.responseSchema.properties as Record<string, unknown> | undefined;
    const actualObj = responseJson && typeof responseJson === "object" && !Array.isArray(responseJson)
      ? responseJson as Record<string, unknown>
      : null;
    const matchedKeys = specProps && actualObj
      ? Object.keys(specProps).filter((k) => k in actualObj).length
      : 0;

    endpointResults.push({
      path: candidate.path,
      url,
      status: result.status,
      matched: significantMismatches.length === 0,
      mismatches,
      matchedKeys,
    });
  }

  if (!hasSchemas) {
    return {
      check_id: check.id,
      name: check.name,
      status: "warn",
      finding: `OpenAPI spec found but no response schemas documented for the ${candidates.length} tested endpoint(s). Without response schemas, schema drift cannot be detected.`,
      recommendation: check.recommendation,
      weight: check.weight,
      probes,
      detectionMethod: check.how_we_check,
      confidence: "high",
      foundButUnrecognized: false,
      fix: check.fix,
    };
  }

  // Build finding text
  const lines: string[] = [`Tested ${candidates.length} of ${totalDocumented} documented GET endpoints.`];
  let significantDrift = false;
  let minorDrift = false;

  for (const er of endpointResults) {
    const sigMismatches = er.mismatches.filter((m) => m.severity === "missing" || m.severity === "type_mismatch");
    const extras = er.mismatches.filter((m) => m.severity === "extra");

    if (sigMismatches.length > 0) {
      significantDrift = true;
      const details = sigMismatches.slice(0, 3).map((m) =>
        m.severity === "missing"
          ? `'${m.field}' documented but missing from response`
          : `'${m.field}' expected ${m.expected}, got ${m.actual}`
      ).join("; ");
      lines.push(`✗ GET ${er.path} — drift detected: ${details}.${extras.length > 0 ? ` Also ${extras.length} undocumented key(s).` : ""}`);
    } else if (extras.length > 0) {
      minorDrift = true;
      lines.push(`~ GET ${er.path} — spec matches but response has ${extras.length} undocumented key(s): ${extras.slice(0, 3).map((m) => m.field).join(", ")}${extras.length > 3 ? "..." : ""}.`);
    } else if (er.matched && er.matchedKeys > 0) {
      lines.push(`✓ GET ${er.path} — matches spec (${er.matchedKeys} keys match).`);
    } else if (er.matched && er.status !== 200) {
      lines.push(`– GET ${er.path} — HTTP ${er.status}, skipped (likely requires parameters).`);
    } else if (er.matched) {
      lines.push(`✓ GET ${er.path} — response received, no schema to compare.`);
    } else {
      lines.push(`? GET ${er.path} — HTTP ${er.status}, could not compare.`);
    }
  }

  const finding = lines.join("\n");

  if (significantDrift) {
    return {
      check_id: check.id,
      name: check.name,
      status: "fail",
      finding,
      recommendation: check.recommendation,
      weight: check.weight,
      probes,
      detectionMethod: check.how_we_check,
      confidence: "high",
      foundButUnrecognized: false,
      fix: check.fix,
      details: { endpointResults },
    };
  }

  if (minorDrift) {
    return {
      check_id: check.id,
      name: check.name,
      status: "warn",
      finding,
      recommendation: "Your API responses contain keys not documented in the OpenAPI spec. While this won't break agents, it means your spec is incomplete — agents won't know about these fields.",
      weight: check.weight,
      probes,
      detectionMethod: check.how_we_check,
      confidence: "high",
      foundButUnrecognized: false,
      fix: check.fix,
      details: { endpointResults },
    };
  }

  return {
    check_id: check.id,
    name: check.name,
    status: "pass",
    finding,
    recommendation: "",
    weight: check.weight,
    probes,
    detectionMethod: check.how_we_check,
    confidence: "high",
    foundButUnrecognized: false,
    details: { endpointResults },
  };
}
