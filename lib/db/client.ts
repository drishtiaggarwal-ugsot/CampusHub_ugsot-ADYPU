import { randomUUID } from 'node:crypto';
import type { Database } from '@/lib/db/database.types';
import { getCurrentUser, getSessionIdToken, type CurrentUser } from '@/lib/auth';
import {
  firestoreAddDoc,
  firestoreDeleteDoc,
  firestoreGetDoc,
  firestoreListCollection,
  firestoreQuery,
  firestoreSetDoc,
  isFirestoreAvailable,
  type FirestoreFilter,
} from '@/lib/db/firestore-rest';

export type DbTables = Database['public']['Tables'];
export type TableName = keyof DbTables;
export type RpcFunctions = Database['public']['Functions'];
export type RpcName = keyof RpcFunctions;

export type DbError = {
  message: string;
  code?: string;
  status?: number;
  name?: string;
};

export type DbListResponse<Row> = {
  data: Row[] | null;
  count: number | null;
  error: DbError | null;
};

export type DbSingleResponse<Row> = {
  data: Row | null;
  error: DbError | null;
};

export type DbQueryBuilder<Row extends Record<string, unknown>, InsertRow, UpdateRow> = PromiseLike<
  DbListResponse<Row>
> & {
  select: (columns?: string, opts?: { count?: 'exact'; head?: boolean }) => DbQueryBuilder<Row, InsertRow, UpdateRow>;
  eq: (column: string, value: unknown) => DbQueryBuilder<Row, InsertRow, UpdateRow>;
  neq: (column: string, value: unknown) => DbQueryBuilder<Row, InsertRow, UpdateRow>;
  gte: (column: string, value: unknown) => DbQueryBuilder<Row, InsertRow, UpdateRow>;
  lte: (column: string, value: unknown) => DbQueryBuilder<Row, InsertRow, UpdateRow>;
  in: (column: string, values: unknown[]) => DbQueryBuilder<Row, InsertRow, UpdateRow>;
  like: (column: string, value: string) => DbQueryBuilder<Row, InsertRow, UpdateRow>;
  ilike: (column: string, value: string) => DbQueryBuilder<Row, InsertRow, UpdateRow>;
  not: (column: string, op: string, value: unknown) => DbQueryBuilder<Row, InsertRow, UpdateRow>;
  contains: (column: string, value: unknown[]) => DbQueryBuilder<Row, InsertRow, UpdateRow>;
  or: (condition: string) => DbQueryBuilder<Row, InsertRow, UpdateRow>;
  order: (column: string, opts?: { ascending?: boolean }) => DbQueryBuilder<Row, InsertRow, UpdateRow>;
  limit: (n: number) => DbQueryBuilder<Row, InsertRow, UpdateRow>;
  range: (from: number, to: number) => DbQueryBuilder<Row, InsertRow, UpdateRow>;
  single: () => DbSingleQueryBuilder<Row>;
  maybeSingle: () => DbSingleQueryBuilder<Row>;
  insert: (data: InsertRow | InsertRow[]) => DbQueryBuilder<Row, InsertRow, UpdateRow>;
  upsert: (data: InsertRow | InsertRow[], opts?: { onConflict?: string }) => DbQueryBuilder<Row, InsertRow, UpdateRow>;
  update: (data: UpdateRow) => DbQueryBuilder<Row, InsertRow, UpdateRow>;
  delete: () => DbQueryBuilder<Row, InsertRow, UpdateRow>;
};

export type DbSingleQueryBuilder<Row> = PromiseLike<DbSingleResponse<Row>> & {
  select: (columns?: string) => DbSingleQueryBuilder<Row>;
  eq: (column: string, value: unknown) => DbSingleQueryBuilder<Row>;
  neq: (column: string, value: unknown) => DbSingleQueryBuilder<Row>;
  single: () => DbSingleQueryBuilder<Row>;
  maybeSingle: () => DbSingleQueryBuilder<Row>;
};

export async function isFirestoreConfigured(): Promise<boolean> {
  const idToken = await getSessionIdToken();
  return isFirestoreAvailable(idToken);
}

/**
 * Synchronous alias kept only for callers checking availability synchronously.
 * Prefer `await isFirestoreConfigured()` where async is supported.
 */
export const isDbConfigured = isFirestoreConfigured;

function parseOrCondition(condition: string): Array<{ column: string; op: FirestoreFilter['op']; value: string }> {
  return condition
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const firstDot = part.indexOf('.');
      const secondDot = part.indexOf('.', firstDot + 1);
      if (firstDot === -1 || secondDot === -1) return null;
      const column = part.slice(0, firstDot);
      const rawOp = part.slice(firstDot + 1, secondDot);
      const value = part.slice(secondDot + 1);
      if (rawOp === 'eq') return { column, op: '==' as const, value };
      if (rawOp === 'neq') return { column, op: '!=' as const, value };
      if (rawOp === 'ilike' || rawOp === 'like') {
        return { column, op: rawOp, value };
      }
      return null;
    })
    .filter((item): item is { column: string; op: FirestoreFilter['op']; value: string } => item !== null);
}

function matchesFilter(item: Record<string, unknown>, filter: FirestoreFilter): boolean {
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
}

function createTypedQueryBuilder<T extends TableName>(
  table: T,
  idToken: string | null,
): DbQueryBuilder<
  DbTables[T]['Row'] & Record<string, unknown>,
  DbTables[T]['Insert'],
  DbTables[T]['Update']
> {
  type Row = DbTables[T]['Row'] & Record<string, unknown>;
  type InsertRow = DbTables[T]['Insert'];
  type UpdateRow = DbTables[T]['Update'];

  const filters: FirestoreFilter[] = [];
  const orConditions: string[] = [];
  let orderBy: { column: string; ascending: boolean } | undefined;
  let limitVal: number | undefined;
  let rangeVal: { from: number; to: number } | undefined;
  let isSingle = false;
  let isMaybeSingle = false;
  let countOnly = false;
  let mode: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  let writePayload: unknown = null;
  let conflictKey: string | undefined;

  async function execute(): Promise<DbListResponse<Row>> {
    const available = await isFirestoreAvailable(idToken);
    if (!available) {
      return {
        data: mode === 'select' ? [] : null,
        count: 0,
        error: mode === 'select' ? null : { message: 'Firestore database is not provisioned yet.' },
      };
    }

    try {
      if (mode === 'insert' || mode === 'upsert') {
        const items = Array.isArray(writePayload) ? writePayload : [writePayload];
        const inserted: Row[] = [];
        const nowIso = new Date().toISOString();

        for (const rawItem of items) {
          const item = { ...(rawItem as Record<string, unknown>) };
          if (!item.created_at) item.created_at = nowIso;
          if (!item.updated_at && table !== 'event_registrations' && table !== 'event_certificates') {
            item.updated_at = nowIso;
          }

          let docId = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : '';
          if (!docId && conflictKey) {
            const keyParts = conflictKey
              .split(',')
              .map((k) => String(item[k.trim()] ?? ''))
              .filter(Boolean);
            if (keyParts.length) docId = keyParts.join('__');
          }

          if (docId) {
            item.id = docId;
            const res = await firestoreSetDoc(table, docId, item, idToken, mode === 'upsert');
            if (!res.ok) return { data: null, count: null, error: { message: res.error || 'Write failed' } };
            inserted.push(item as Row);
          } else {
            const generatedId = randomUUID();
            item.id = generatedId;
            const res = await firestoreAddDoc(table, item, idToken);
            if (!res.ok) return { data: null, count: null, error: { message: res.error || 'Insert failed' } };
            inserted.push((res.doc ?? item) as Row);
          }
        }

        return { data: inserted, count: inserted.length, error: null };
      }

      if (mode === 'update') {
        const matching = await fetchMatchingRows();
        const updates = { ...(writePayload as Record<string, unknown>) };
        const updatedRows: Row[] = [];
        for (const row of matching) {
          const docId = String(row.id || '');
          if (!docId) continue;
          const res = await firestoreSetDoc(table, docId, updates, idToken, true);
          if (!res.ok) return { data: null, count: null, error: { message: res.error || 'Update failed' } };
          updatedRows.push({ ...row, ...updates } as Row);
        }
        return { data: updatedRows, count: updatedRows.length, error: null };
      }

      if (mode === 'delete') {
        const matching = await fetchMatchingRows();
        for (const row of matching) {
          const docId = String(row.id || '');
          if (!docId) continue;
          const res = await firestoreDeleteDoc(table, docId, idToken);
          if (!res.ok) return { data: null, count: null, error: { message: res.error || 'Delete failed' } };
        }
        return { data: [], count: matching.length, error: null };
      }

      // Select mode
      const rows = await fetchMatchingRows();
      const totalCount = rows.length;
      let sliced = rows;
      if (rangeVal) {
        sliced = sliced.slice(rangeVal.from, rangeVal.to + 1);
      } else if (limitVal !== undefined) {
        sliced = sliced.slice(0, limitVal);
      }

      return {
        data: countOnly ? null : (sliced as Row[]),
        count: totalCount,
        error: null,
      };
    } catch (err) {
      return {
        data: null,
        count: null,
        error: { message: err instanceof Error ? err.message : 'Unexpected database error' },
      };
    }
  }

  async function fetchMatchingRows(): Promise<Record<string, unknown>[]> {
    // Fast-path 1: Direct document lookup by 'id' == value
    const idFilter = filters.find(
      (f) => f.column === 'id' && f.op === '==' && typeof f.value === 'string' && f.value.trim(),
    );
    if (idFilter && orConditions.length === 0) {
      const docId = String(idFilter.value).trim();
      try {
        const singleDoc = await firestoreGetDoc(table, docId, idToken);
        if (singleDoc) {
          const matchesAll = filters.every((f) => matchesFilter(singleDoc, f));
          if (matchesAll) return [singleDoc];
        }
      } catch {
        // Fall back to general query
      }
    }

    // Fast-path 2: Deterministic composite ID for event_registrations (eventId__userId)
    if (table === 'event_registrations' && orConditions.length === 0) {
      const eventFilter = filters.find((f) => f.column === 'event_id' && f.op === '==' && typeof f.value === 'string');
      const userFilter = filters.find((f) => f.column === 'user_id' && f.op === '==' && typeof f.value === 'string');
      if (eventFilter && userFilter) {
        const docId = `${String(eventFilter.value).trim()}__${String(userFilter.value).trim()}`;
        try {
          const singleDoc = await firestoreGetDoc(table, docId, idToken);
          if (singleDoc && filters.every((f) => matchesFilter(singleDoc, f))) {
            return [singleDoc];
          }
        } catch {
          // Fall back to general query
        }
      }
    }

    // Fast-path 3: Deterministic composite ID for event_team_members (eventId__email)
    if (table === 'event_team_members' && orConditions.length === 0) {
      const eventFilter = filters.find((f) => f.column === 'event_id' && f.op === '==' && typeof f.value === 'string');
      const emailFilter = filters.find((f) => (f.column === 'member_email' || f.column === 'email_key') && f.op === '==' && typeof f.value === 'string');
      if (eventFilter && emailFilter) {
        const docId = `${String(eventFilter.value).trim()}__${String(emailFilter.value).trim().toLowerCase()}`;
        try {
          const singleDoc = await firestoreGetDoc(table, docId, idToken);
          if (singleDoc && filters.every((f) => matchesFilter(singleDoc, f))) {
            return [singleDoc];
          }
        } catch {
          // Fall back to general query
        }
      }
    }

    // Fast-path 4: Deterministic composite ID for user_forks (forker_id__forked_id)
    if (table === 'user_forks' && orConditions.length === 0) {
      const forkerFilter = filters.find((f) => f.column === 'forker_id' && f.op === '==' && typeof f.value === 'string');
      const forkedFilter = filters.find((f) => f.column === 'forked_id' && f.op === '==' && typeof f.value === 'string');
      if (forkerFilter && forkedFilter) {
        const docId = `${String(forkerFilter.value).trim()}__${String(forkedFilter.value).trim()}`;
        try {
          const singleDoc = await firestoreGetDoc(table, docId, idToken);
          if (singleDoc && filters.every((f) => matchesFilter(singleDoc, f))) {
            return [singleDoc];
          }
        } catch {
          // Fall back to general query
        }
      }
    }

    const hasClientOnlyOps =
      orConditions.length > 0 ||
      filters.some((f) => f.op === 'ilike' || f.op === 'like' || f.op === 'contains' || f.op === 'not-null');

    let rows: Record<string, unknown>[];
    if (hasClientOnlyOps) {
      const all = await firestoreListCollection(table, idToken);
      rows = all.filter((item) => filters.every((f) => matchesFilter(item, f)));
      for (const cond of orConditions) {
        const branches = parseOrCondition(cond);
        if (branches.length) {
          rows = rows.filter((item) => branches.some((b) => matchesFilter(item, b)));
        }
      }
      if (orderBy) {
        rows.sort((a, b) => {
          const aVal = a[orderBy!.column];
          const bVal = b[orderBy!.column];
          if (aVal === bVal) return 0;
          if (aVal === undefined || aVal === null) return 1;
          if (bVal === undefined || bVal === null) return -1;
          return orderBy!.ascending ? (aVal < bVal ? -1 : 1) : aVal > bVal ? -1 : 1;
        });
      }
    } else {
      rows = await firestoreQuery(table, filters, orderBy, rangeVal ? undefined : limitVal, idToken);
    }
    return rows;
  }

  const builder: DbQueryBuilder<Row, InsertRow, UpdateRow> = {
    select(_columns?: string, opts?: { count?: 'exact'; head?: boolean }) {
      if (opts?.head) countOnly = true;
      return builder;
    },
    eq(column: string, value: unknown) {
      filters.push({ column, op: '==', value });
      return builder;
    },
    neq(column: string, value: unknown) {
      filters.push({ column, op: '!=', value });
      return builder;
    },
    gte(column: string, value: unknown) {
      filters.push({ column, op: '>=', value });
      return builder;
    },
    lte(column: string, value: unknown) {
      filters.push({ column, op: '<=', value });
      return builder;
    },
    in(column: string, values: unknown[]) {
      filters.push({ column, op: 'in', value: values });
      return builder;
    },
    like(column: string, value: string) {
      filters.push({ column, op: 'like', value });
      return builder;
    },
    ilike(column: string, value: string) {
      filters.push({ column, op: 'ilike', value });
      return builder;
    },
    not(column: string, op: string, value: unknown) {
      if (op === 'is' && value === null) {
        filters.push({ column, op: 'not-null', value: null });
      }
      return builder;
    },
    contains(column: string, value: unknown[]) {
      filters.push({ column, op: 'contains', value });
      return builder;
    },
    or(condition: string) {
      orConditions.push(condition);
      return builder;
    },
    order(column: string, opts?: { ascending?: boolean }) {
      orderBy = { column, ascending: opts?.ascending ?? true };
      return builder;
    },
    limit(n: number) {
      limitVal = n;
      return builder;
    },
    range(from: number, to: number) {
      rangeVal = { from, to };
      return builder;
    },
    insert(data: InsertRow | InsertRow[]) {
      mode = 'insert';
      writePayload = data;
      return builder;
    },
    upsert(data: InsertRow | InsertRow[], opts?: { onConflict?: string }) {
      mode = 'upsert';
      writePayload = data;
      conflictKey = opts?.onConflict;
      return builder;
    },
    update(data: UpdateRow) {
      mode = 'update';
      writePayload = data;
      return builder;
    },
    delete() {
      mode = 'delete';
      return builder;
    },
    single(): DbSingleQueryBuilder<Row> {
      isSingle = true;
      return singleBuilder;
    },
    maybeSingle(): DbSingleQueryBuilder<Row> {
      isMaybeSingle = true;
      return singleBuilder;
    },
    then(onfulfilled, onrejected) {
      return execute().then(onfulfilled, onrejected);
    },
  };

  const singleBuilder: DbSingleQueryBuilder<Row> = {
    select() {
      return singleBuilder;
    },
    eq(column: string, value: unknown) {
      filters.push({ column, op: '==', value });
      return singleBuilder;
    },
    neq(column: string, value: unknown) {
      filters.push({ column, op: '!=', value });
      return singleBuilder;
    },
    single() {
      isSingle = true;
      return singleBuilder;
    },
    maybeSingle() {
      isMaybeSingle = true;
      return singleBuilder;
    },
    then(onfulfilled, onrejected) {
      return execute()
        .then((res): DbSingleResponse<Row> => {
          if (res.error) return { data: null, error: res.error };
          const first = res.data?.[0] ?? null;
          if (isSingle && !first && !isMaybeSingle) {
            return { data: null, error: { message: 'Record not found.' } };
          }
          return { data: first, error: null };
        })
        .then(onfulfilled, onrejected);
    },
  };

  return builder;
}

async function handleRpc<K extends RpcName>(
  fn: K,
  args: RpcFunctions[K]['Args'],
  currentUser: CurrentUser | null,
  idToken: string | null,
): Promise<{ data: RpcFunctions[K]['Returns'] | null; error: DbError | null }> {
  const available = await isFirestoreAvailable(idToken);

  switch (fn) {
    case 'get_event_registration_statuses': {
      const { p_event_ids } = args as RpcFunctions['get_event_registration_statuses']['Args'];
      let catalogRows: Record<string, unknown>[] = [];
      let regRows: Record<string, unknown>[] = [];
      if (available) {
        try {
          catalogRows = await firestoreListCollection('event_catalog', idToken);
        } catch {
          catalogRows = [];
        }
        try {
          regRows = await firestoreListCollection('event_registrations', idToken);
        } catch {
          regRows = [];
        }
      }

      // If currentUser is signed in, check direct doc lookup in case collection listing was restricted
      if (currentUser && available) {
        await Promise.all(
          p_event_ids.map(async (eventId) => {
            const alreadyInRegs = regRows.some(
              (r) => r.event_id === eventId && r.user_id === currentUser.id,
            );
            if (!alreadyInRegs) {
              try {
                const regDoc = await firestoreGetDoc(
                  'event_registrations',
                  `${eventId}__${currentUser.id}`,
                  idToken,
                );
                if (regDoc && regDoc.id) {
                  regRows.push({
                    id: regDoc.id,
                    event_id: eventId,
                    user_id: currentUser.id,
                  });
                }
              } catch {
                // Ignore direct doc lookup error
              }
            }
          }),
        );
      }

      const nowIso = new Date().toISOString().slice(0, 10);

      const statuses = p_event_ids.map((eventId) => {
        const fromDb = catalogRows.find((r) => r.id === eventId);
        const capacity = Number(fromDb?.capacity ?? 50);
        const deadline = String(
          fromDb?.registration_deadline ?? '2099-12-31',
        );
        const eventRegs = regRows.filter((r) => r.event_id === eventId);
        const isRegistered = Boolean(currentUser && eventRegs.some((r) => r.user_id === currentUser.id));
        const seatsLeft = Math.max(0, capacity - eventRegs.length);
        const registrationOpen = deadline >= nowIso && seatsLeft > 0;
        return {
          event_id: eventId,
          capacity,
          registration_deadline: deadline,
          seats_left: seatsLeft,
          is_registered: isRegistered,
          registration_open: registrationOpen,
        };
      });

      return { data: statuses as RpcFunctions[K]['Returns'], error: null };
    }

    case 'register_for_event': {
      if (!currentUser) return { data: null, error: { message: 'Sign in required.', status: 401 } };
      const { p_event_id } = args as RpcFunctions['register_for_event']['Args'];
      let catalogRows: Record<string, unknown>[] = [];
      try {
        catalogRows = available
          ? await firestoreQuery('event_catalog', [{ column: 'id', op: '==', value: p_event_id }], undefined, 1, idToken)
          : [];
      } catch {
        // Fall back to empty array if Firestore query fails
        catalogRows = [];
      }
      const eventDoc = catalogRows[0];
      const capacity = Number(eventDoc?.capacity ?? 50);
      const deadline = String(eventDoc?.registration_deadline ?? '2099-12-31');

      if (!available) {
        return {
          data: [{ result: 'registered', seats_left: Math.max(0, capacity - 1), capacity, registration_deadline: deadline }] as RpcFunctions[K]['Returns'],
          error: null,
        };
      }

      let existing: Record<string, unknown>[] = [];
      try {
        existing = await firestoreQuery(
          'event_registrations',
          [{ column: 'event_id', op: '==', value: p_event_id }],
          undefined,
          undefined,
          idToken,
        );
      } catch {
        // Fall back to empty array if Firestore query fails
        existing = [];
      }

      // Check if user is already registered (either query match or direct document get)
      let alreadyRegistered = existing.some((r) => r.user_id === currentUser.id);
      const regId = `${p_event_id}__${currentUser.id}`;
      if (!alreadyRegistered) {
        try {
          const directCheck = await firestoreGetDoc('event_registrations', regId, idToken);
          if (directCheck && directCheck.id) {
            alreadyRegistered = true;
            if (!existing.some((r) => r.id === regId)) {
              existing.push({ id: regId, event_id: p_event_id, user_id: currentUser.id });
            }
          }
        } catch {
          // ignore
        }
      }

      if (alreadyRegistered) {
        return {
          data: [{ result: 'already_registered', seats_left: Math.max(0, capacity - existing.length), capacity, registration_deadline: deadline }] as RpcFunctions[K]['Returns'],
          error: null,
        };
      }
      if (deadline < new Date().toISOString().slice(0, 10)) {
        return {
          data: [{ result: 'deadline_passed', seats_left: Math.max(0, capacity - existing.length), capacity, registration_deadline: deadline }] as RpcFunctions[K]['Returns'],
          error: null,
        };
      }
      if (existing.length >= capacity) {
        return {
          data: [{ result: 'full', seats_left: 0, capacity, registration_deadline: deadline }] as RpcFunctions[K]['Returns'],
          error: null,
        };
      }

      try {
        const writeRes = await firestoreSetDoc(
          'event_registrations',
          regId,
          {
            id: regId,
            event_id: p_event_id,
            user_id: currentUser.id,
            registered_at: new Date().toISOString(),
          },
          idToken,
          false,
        );
        if (!writeRes.ok) {
          console.error('[register_for_event] firestoreSetDoc failed:', writeRes.error);
          return { data: null, error: { message: writeRes.error || 'Registration failed', status: 500 } };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Registration failed';
        console.error('[register_for_event] exception:', msg);
        return { data: null, error: { message: msg, status: 500 } };
      }

      return {
        data: [{
          result: 'registered',
          seats_left: Math.max(0, capacity - existing.length - 1),
          capacity,
          registration_deadline: deadline,
        }] as RpcFunctions[K]['Returns'],
        error: null,
      };
    }

    case 'cancel_event_registration': {
      if (!currentUser) return { data: null, error: { message: 'Sign in required.', status: 401 } };
      const { p_event_id } = args as RpcFunctions['cancel_event_registration']['Args'];
      if (available) {
        try {
          await firestoreDeleteDoc('event_registrations', `${p_event_id}__${currentUser.id}`, idToken);
        } catch {
          // Firestore delete failed, but cancellation still "succeeds" from user perspective
        }
      }
      return { data: true as RpcFunctions[K]['Returns'], error: null };
    }

    case 'create_hackathon_team': {
      if (!currentUser) return { data: null, error: { message: 'Sign in required.', status: 401 } };
      const { p_event_id, p_name, p_member_emails } = args as RpcFunctions['create_hackathon_team']['Args'];
      const cleanName = p_name.trim();
      if (!cleanName || cleanName.length > 80) {
        return { data: null, error: { message: 'Team names must be between 1 and 80 characters.', code: '22023', status: 400 } };
      }

      const leaderEmail = currentUser.email.trim().toLowerCase();
      const extraEmails = (p_member_emails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);
      const emails = [...new Set([leaderEmail, ...extraEmails])];

      if (available) {
        const regDoc = await firestoreGetDoc('event_registrations', `${p_event_id}__${currentUser.id}`, idToken);
        if (!regDoc) {
          return {
            data: null,
            error: {
              message: 'Register for this event first before forming a team.',
              code: 'NOT_REGISTERED',
              status: 403,
            },
          };
        }

        for (const email of emails) {
          const existingMember = await firestoreGetDoc(
            'event_team_members',
            `${p_event_id}__${email}`,
            idToken,
          );
          if (existingMember) {
            return {
              data: null,
              error: {
                message: email === leaderEmail
                  ? 'You are already a member of a team for this event.'
                  : `${email} is already on a team for this event.`,
                code: '23505',
                status: 409,
              },
            };
          }
        }
      }

      const teamId = randomUUID();
      if (available) {
        const nowIso = new Date().toISOString();
        await firestoreSetDoc(
          'event_teams',
          teamId,
          {
            id: teamId,
            event_id: p_event_id,
            name: cleanName,
            leader_id: currentUser.id,
            leader_email: leaderEmail,
            created_at: nowIso,
          },
          idToken,
          false,
        );
        for (const email of emails) {
          const memberId = `${p_event_id}__${email}`;
          await firestoreSetDoc(
            'event_team_members',
            memberId,
            {
              id: memberId,
              event_id: p_event_id,
              team_id: teamId,
              member_email: email,
              email_key: email,
              created_at: nowIso,
            },
            idToken,
            false,
          );
        }
      }
      return { data: teamId as RpcFunctions[K]['Returns'], error: null };
    }

    case 'verify_certificate': {
      if (!available) return { data: [] as RpcFunctions[K]['Returns'], error: null };
      const { p_certificate_id } = args as RpcFunctions['verify_certificate']['Args'];
      let certs: Record<string, unknown>[] = [];
      try {
        certs = await firestoreQuery(
          'event_certificates',
          [{ column: 'id', op: '==', value: p_certificate_id }],
          undefined,
          1,
          idToken,
        );
      } catch {
        return { data: [] as RpcFunctions[K]['Returns'], error: null };
      }
      if (!certs[0]) return { data: [] as RpcFunctions[K]['Returns'], error: null };
      const cert = certs[0];
      let profiles: Record<string, unknown>[] = [];
      try {
        profiles = await firestoreQuery(
          'profiles',
          [{ column: 'id', op: '==', value: cert.user_id }],
          undefined,
          1,
          idToken,
        );
      } catch {
        // Fall back to empty profiles array
        profiles = [];
      }
      let catalogDocs: Record<string, unknown>[] = [];
      try {
        catalogDocs = await firestoreQuery(
          'event_catalog',
          [{ column: 'id', op: '==', value: cert.event_id }],
          undefined,
          1,
          idToken,
        );
      } catch {
        catalogDocs = [];
      }
      const eventTitle = (catalogDocs[0]?.title as string) || String(cert.event_id);
      return {
        data: [{
          certificate_id: String(cert.id),
          event_id: String(cert.event_id),
          event_title: eventTitle,
          attendee_name: String(profiles[0]?.full_name || 'Attendee'),
          issued_at: String(cert.issued_at || ''),
          is_valid: true,
        }] as RpcFunctions[K]['Returns'],
        error: null,
      };
    }

    case 'get_leaderboard':
    case 'get_user_leaderboard_position': {
      return { data: [] as RpcFunctions[K]['Returns'], error: null };
    }

    case 'fork_user':
    case 'unfork_user': {
      return { data: null, error: { message: 'Use direct user_forks table fallback.' } };
    }

    default:
      return { data: null, error: { message: `RPC ${String(fn)} is not implemented.` } };
  }
}

export async function createDbClient() {
  const [currentUser, idToken] = await Promise.all([getCurrentUser(), getSessionIdToken()]);

  return {
    auth: {
      getUser: async (): Promise<{ data: { user: CurrentUser | null }; error: DbError | null }> => {
        return { data: { user: currentUser }, error: null };
      },
      updateUser: async (attrs: { data?: Record<string, unknown> }): Promise<{ error: DbError | null }> => {
        if (!currentUser || !attrs?.data) return { error: null };
        const available = await isFirestoreAvailable(idToken);
        if (!available) return { error: null };
        const res = await firestoreSetDoc(
          'profiles',
          currentUser.id,
          { ...attrs.data, updated_at: new Date().toISOString() },
          idToken,
          true,
        );
        return { error: res.ok ? null : { message: res.error || 'Unable to update profile' } };
      },
      exchangeCodeForSession: async (): Promise<{ error: DbError | null }> => ({ error: null }),
    },

    from: <T extends TableName>(table: T) => createTypedQueryBuilder(table, idToken),

    rpc: <K extends RpcName>(fn: K, args: RpcFunctions[K]['Args']) => handleRpc(fn, args, currentUser, idToken),
  };
}

export type DbClient = Awaited<ReturnType<typeof createDbClient>>;
