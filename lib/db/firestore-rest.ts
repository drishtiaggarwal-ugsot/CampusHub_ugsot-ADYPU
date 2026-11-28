import { firebaseConfig } from '@/lib/firebase';

type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { stringValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

type FirestoreDocument = {
  name?: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
};

export type FirestoreFilter = {
  column: string;
  op: '==' | '!=' | '>=' | '<=' | 'in' | 'contains' | 'like' | 'ilike' | 'not-null';
  value: unknown;
};

export const FIREBASE_DATABASE_ID =
  process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || 'default';

const BASE_URL = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${FIREBASE_DATABASE_ID}/documents`;
const QUERY_URL = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${FIREBASE_DATABASE_ID}/documents:runQuery`;

let probeCache: { checkedAt: number; available: boolean } | null = null;
const PROBE_TTL_MS = 30_000;

export function resetFirestoreProbeCache() {
  probeCache = null;
}

function buildHeaders(idToken?: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }
  return headers;
}

function withApiKey(url: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}key=${encodeURIComponent(firebaseConfig.apiKey)}`;
}

/**
 * Fast, non-hanging check to verify whether the `(default)` Firestore database exists
 * in the configured Firebase project. Never blocks for 30s like the gRPC client SDK.
 */
export async function isFirestoreAvailable(idToken?: string | null): Promise<boolean> {
  const now = Date.now();
  if (probeCache && now - probeCache.checkedAt < PROBE_TTL_MS) {
    return probeCache.available;
  }

  try {
    const res = await fetch(withApiKey(`${BASE_URL}/profiles?pageSize=1`), {
      method: 'GET',
      headers: buildHeaders(idToken),
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    });

    // 200 (ok) or 403 (database exists, rules restrict anonymous read) means Firestore DB exists.
    // 404 NOT_FOUND with "database (default) does not exist" means DB has not been provisioned yet.
    if (res.status === 404) {
      const text = await res.text().catch(() => '');
      const missingDb = text.includes('does not exist') || text.includes('NOT_FOUND');
      const available = !missingDb;
      probeCache = { checkedAt: now, available };
      return available;
    }

    const available = res.ok || res.status === 401 || res.status === 403;
    probeCache = { checkedAt: now, available };
    return available;
  } catch {
    probeCache = { checkedAt: now, available: false };
    return false;
  }
}

export function encodeFirestoreValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((item) => encodeFirestoreValue(item)) } };
  }
  if (typeof value === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        fields[k] = encodeFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

export function decodeFirestoreValue(val: FirestoreValue | undefined): unknown {
  if (!val) return null;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return val.doubleValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('stringValue' in val) return val.stringValue;
  if ('arrayValue' in val) {
    return (val.arrayValue.values ?? []).map((item) => decodeFirestoreValue(item));
  }
  if ('mapValue' in val) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val.mapValue.fields ?? {})) {
      out[k] = decodeFirestoreValue(v);
    }
    return out;
  }
  return null;
}

export function decodeFirestoreDocument(doc: FirestoreDocument): Record<string, unknown> {
  const docId = doc.name ? doc.name.split('/').pop() || '' : '';
  const result: Record<string, unknown> = { id: docId };
  for (const [k, v] of Object.entries(doc.fields ?? {})) {
    result[k] = decodeFirestoreValue(v);
  }
  return result;
}

function encodeFields(data: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) {
      fields[k] = encodeFirestoreValue(v);
    }
  }
  return fields;
}

export async function firestoreGetDoc(
  collectionName: string,
  docId: string,
  idToken?: string | null,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(withApiKey(`${BASE_URL}/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}`), {
      method: 'GET',
      headers: buildHeaders(idToken),
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const doc = (await res.json()) as FirestoreDocument;
    return decodeFirestoreDocument(doc);
  } catch {
    return null;
  }
}

export async function firestoreSetDoc(
  collectionName: string,
  docId: string,
  data: Record<string, unknown>,
  idToken?: string | null,
  merge = true,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const fields = encodeFields(data);
    let url = `${BASE_URL}/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}`;
    if (merge) {
      const maskParams = Object.keys(fields)
        .map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
        .join('&');
      if (maskParams) url += `?${maskParams}`;
    }

    const res = await fetch(withApiKey(url), {
      method: 'PATCH',
      headers: buildHeaders(idToken),
      body: JSON.stringify({ fields }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      return { ok: false, error: errText };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Firestore write failed' };
  }
}

export async function firestoreAddDoc(
  collectionName: string,
  data: Record<string, unknown>,
  idToken?: string | null,
): Promise<{ ok: boolean; doc?: Record<string, unknown>; error?: string }> {
  try {
    const payload: Record<string, unknown> = { ...data };
    const providedId = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : null;
    if (providedId) {
      const setRes = await firestoreSetDoc(collectionName, providedId, payload, idToken, false);
      if (!setRes.ok) return { ok: false, error: setRes.error };
      return { ok: true, doc: { ...payload, id: providedId } };
    }

    const res = await fetch(withApiKey(`${BASE_URL}/${encodeURIComponent(collectionName)}`), {
      method: 'POST',
      headers: buildHeaders(idToken),
      body: JSON.stringify({ fields: encodeFields(payload) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      return { ok: false, error: errText };
    }
    const created = (await res.json()) as FirestoreDocument;
    return { ok: true, doc: decodeFirestoreDocument(created) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Firestore insert failed' };
  }
}

export async function firestoreDeleteDoc(
  collectionName: string,
  docId: string,
  idToken?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(withApiKey(`${BASE_URL}/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}`), {
      method: 'DELETE',
      headers: buildHeaders(idToken),
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok && res.status !== 404) {
      const errText = await res.text().catch(() => res.statusText);
      return { ok: false, error: errText };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Firestore delete failed' };
  }
}

function applyInMemoryFilters(
  rows: Record<string, unknown>[],
  filters: FirestoreFilter[],
  orderBy?: { column: string; ascending: boolean },
  limitVal?: number,
): Record<string, unknown>[] {
  let data = [...rows];
  for (const filter of filters) {
    data = data.filter((item) => {
      const val = item[filter.column];
      switch (filter.op) {
        case '==':
          return val === filter.value;
        case '!=':
          return val !== filter.value;
        case 'in':
          return Array.isArray(filter.value) && filter.value.includes(val);
        case 'contains':
          return Array.isArray(val) && Array.isArray(filter.value) && filter.value.every((v) => val.includes(v));
        case 'ilike': {
          const needle = String(filter.value).replace(/%/g, '').toLowerCase();
          return typeof val === 'string' && val.toLowerCase().includes(needle);
        }
        case 'like': {
          const needle = String(filter.value).replace(/%/g, '');
          return typeof val === 'string' && val.includes(needle);
        }
        case '>=':
          if (val === undefined || val === null) return false;
          if (typeof val === 'number' && typeof filter.value === 'number') return val >= filter.value;
          return String(val) >= String(filter.value);
        case '<=':
          if (val === undefined || val === null) return false;
          if (typeof val === 'number' && typeof filter.value === 'number') return val <= filter.value;
          return String(val) <= String(filter.value);
        case 'not-null':
          return val !== undefined && val !== null;
        default:
          return true;
      }
    });
  }

  if (orderBy) {
    data.sort((a, b) => {
      const aVal = a[orderBy.column];
      const bVal = b[orderBy.column];
      if (aVal === bVal) return 0;
      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;
      if (orderBy.ascending) return aVal < bVal ? -1 : 1;
      return aVal > bVal ? -1 : 1;
    });
  }

  if (limitVal !== undefined) {
    data = data.slice(0, limitVal);
  }

  return data;
}

export async function firestoreListCollection(
  collectionName: string,
  idToken?: string | null,
  pageSize = 300,
): Promise<Record<string, unknown>[]> {
  const docs: Record<string, unknown>[] = [];
  let pageToken: string | undefined;
  const maxPages = 10;

  for (let page = 0; page < maxPages; page++) {
    let url = `${BASE_URL}/${encodeURIComponent(collectionName)}?pageSize=${pageSize}`;
    if (pageToken) {
      url += `&pageToken=${encodeURIComponent(pageToken)}`;
    }
    const res = await fetch(withApiKey(url), {
      method: 'GET',
      headers: buildHeaders(idToken),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      if (res.status === 404) return docs;
      const text = await res.text().catch(() => res.statusText);
      console.warn(`Unable to list collection ${collectionName}: HTTP ${res.status}`, text);
      return docs;
    }
    const payload = (await res.json()) as { documents?: FirestoreDocument[]; nextPageToken?: string };
    for (const doc of payload.documents ?? []) {
      docs.push(decodeFirestoreDocument(doc));
    }
    if (!payload.nextPageToken) break;
    pageToken = payload.nextPageToken;
  }

  return docs;
}

export async function firestoreQuery(
  collectionName: string,
  filters: FirestoreFilter[],
  orderBy?: { column: string; ascending: boolean },
  limitVal?: number,
  idToken?: string | null,
): Promise<Record<string, unknown>[]> {
  // Support single and multiple structured equality/range filters on server
  const structuredWhereFilters = filters.filter(
    (f) => f.op === '==' || f.op === '!=' || f.op === '>=' || f.op === '<=' || (f.op === 'in' && Array.isArray(f.value) && f.value.length > 0 && f.value.length <= 10),
  );
  const canUseServerQuery =
    structuredWhereFilters.length === filters.length &&
    structuredWhereFilters.length >= 1 &&
    structuredWhereFilters.length <= 5;

  if (canUseServerQuery) {
    try {
      const structuredQuery: Record<string, unknown> = {
        from: [{ collectionId: collectionName }],
      };

      const opMap: Record<string, string> = {
        '==': 'EQUAL',
        '!=': 'NOT_EQUAL',
        '>=': 'GREATER_THAN_OR_EQUAL',
        '<=': 'LESS_THAN_OR_EQUAL',
        in: 'IN',
      };

      const toFieldFilter = (f: FirestoreFilter) => ({
        fieldFilter: {
          field: { fieldPath: f.column },
          op: opMap[f.op] || 'EQUAL',
          value: encodeFirestoreValue(f.value),
        },
      });

      if (structuredWhereFilters.length === 1) {
        structuredQuery.where = toFieldFilter(structuredWhereFilters[0]);
      } else {
        structuredQuery.where = {
          compositeFilter: {
            op: 'AND',
            filters: structuredWhereFilters.map(toFieldFilter),
          },
        };
      }

      if (orderBy) {
        structuredQuery.orderBy = [
          {
            field: { fieldPath: orderBy.column },
            direction: orderBy.ascending ? 'ASCENDING' : 'DESCENDING',
          },
        ];
      }

      if (limitVal !== undefined) {
        structuredQuery.limit = limitVal;
      }

      const res = await fetch(withApiKey(QUERY_URL), {
        method: 'POST',
        headers: buildHeaders(idToken),
        body: JSON.stringify({ structuredQuery }),
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const rows = (await res.json()) as Array<{ document?: FirestoreDocument }>;
        return rows
          .filter((r) => r.document)
          .map((r) => decodeFirestoreDocument(r.document!));
      }

      // If server query failed (e.g. index needed for orderBy), retry without server orderBy and sort in memory
      if (orderBy && structuredWhereFilters.length === 1) {
        delete structuredQuery.orderBy;
        const retryRes = await fetch(withApiKey(QUERY_URL), {
          method: 'POST',
          headers: buildHeaders(idToken),
          body: JSON.stringify({ structuredQuery }),
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        });
        if (retryRes.ok) {
          const rows = (await retryRes.json()) as Array<{ document?: FirestoreDocument }>;
          const decoded = rows
            .filter((r) => r.document)
            .map((r) => decodeFirestoreDocument(r.document!));
          return applyInMemoryFilters(decoded, [], orderBy, limitVal);
        }
      }
    } catch {
      // Fall back to collection list + in-memory filter
    }
  }

  const allDocs = await firestoreListCollection(collectionName, idToken);
  return applyInMemoryFilters(allDocs, filters, orderBy, limitVal);
}
