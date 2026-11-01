'use strict';
// Base de secours MongoDB pour Firestore (quota gratuit Spark).
// Façade compatible avec le sous-ensemble Firestore utilisé par server.js :
// collection/doc/get/set/update/delete/create/add, where('==')/limit, batch,
// runTransaction, FieldValue.serverTimestamp()/delete().
// - Chaque écriture Firestore est recopiée dans Mongo ; chaque lecture
//   Firestore réussie y rafraîchit les documents lus.
// - Si Firestore renvoie RESOURCE_EXHAUSTED, les lectures (et écritures)
//   basculent sur Mongo pendant 10 min ; les écritures faites pendant la
//   panne sont rejouées vers Firestore dès qu'il répond de nouveau.
const { MongoClient } = require('mongodb');

const BLOCK_MS = 10 * 60 * 1000;
const PENDING = '_fs_pending';
const META = '_backup_meta';

function isQuotaError(err) {
  return !!err && typeof err === 'object' && (err.code === 8 || err.code === 'resource-exhausted'
    || /RESOURCE_EXHAUSTED|Quota exceeded/i.test(String(err.message || '')));
}

class DualStore {
  constructor(fs, { uri, dbName, FieldValue, Timestamp, FieldPath, forceFallback = false }) {
    this.fs = fs;
    this.FV = FieldValue;
    this.TS = Timestamp;
    this.FP = FieldPath;
    this.readsBlockedUntil = forceFallback ? Infinity : 0;
    this.writesBlockedUntil = forceFallback ? Infinity : 0;
    this.lastFallbackAt = null;
    this.sync = { running: false, doneAt: null, docs: 0, error: null };
    this.client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
    this.ready = this.client.connect().then(c => {
      this.mdb = c.db(dbName || 'resumeci');
      console.log('✅ Base de secours MongoDB connectée');
      return this.mdb;
    });
    this.ready.catch(e => console.warn('⚠️ MongoDB (secours) non connecté:', e.message));
    this._flushTimer = setInterval(() => this.flushPending().catch(() => {}), BLOCK_MS);
    this._flushTimer.unref?.();
  }

  collection(name) { return new CollRef(this, name); }
  batch() { return new Batch(this); }

  // ---------- conversion Firestore <-> Mongo ----------
  isSentinel(v, kind) {
    if (!v || typeof v !== 'object' || typeof v.isEqual !== 'function' || !this.FV) return false;
    try { return v.isEqual(kind === 'delete' ? this.FV.delete() : this.FV.serverTimestamp()); } catch (e) { return false; }
  }
  toMongoValue(v) {
    if (v === null || v === undefined || typeof v !== 'object') return v;
    if (this.isSentinel(v, 'ts')) return new Date();
    if (this.TS && v instanceof this.TS) return v.toDate();
    if (v instanceof Date) return v;
    if (typeof v.toDate === 'function' && typeof v.seconds === 'number') return v.toDate();
    if (Array.isArray(v)) return v.map(x => this.toMongoValue(x));
    if (v.constructor && v.constructor.name === 'DocumentReference') return v.path;
    if (v.constructor && v.constructor !== Object && v instanceof DocRef) return v.path;
    const out = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = this.toMongoValue(x);
    return out;
  }
  // { $set, $unset } pour un set merge / update ; doc complet pour un set simple.
  toMongoUpdate(data) {
    const $set = {}; const $unset = {};
    for (const [k, v] of Object.entries(data || {})) {
      if (v === undefined) continue;
      if (this.isSentinel(v, 'delete')) $unset[k] = '';
      else $set[k] = this.toMongoValue(v);
    }
    const upd = {};
    if (Object.keys($set).length) upd.$set = $set;
    if (Object.keys($unset).length) upd.$unset = $unset;
    return upd;
  }
  toMongoDoc(data) {
    const out = {};
    for (const [k, v] of Object.entries(data || {})) {
      if (v === undefined || this.isSentinel(v, 'delete')) continue;
      out[k] = this.toMongoValue(v);
    }
    return out;
  }
  fromMongoValue(v) {
    if (v instanceof Date) return this.TS ? this.TS.fromDate(v) : v;
    if (Array.isArray(v)) return v.map(x => this.fromMongoValue(x));
    if (v && typeof v === 'object' && v.constructor === Object) {
      const out = {};
      for (const [k, x] of Object.entries(v)) out[k] = this.fromMongoValue(x);
      return out;
    }
    return v;
  }
  fromMongoDoc(doc) {
    if (!doc) return undefined;
    const { _id, ...rest } = doc;
    return this.fromMongoValue(rest);
  }

  // ---------- routage ----------
  async m(coll) { const d = await this.ready; return d.collection(coll); }
  noteQuota(kind, err) {
    const until = Date.now() + BLOCK_MS;
    if (kind === 'read') this.readsBlockedUntil = until; else this.writesBlockedUntil = until;
    this.lastFallbackAt = new Date().toISOString();
    console.warn(`[Secours] Quota Firestore (${kind}) : bascule sur MongoDB 10 min (${err.message})`);
  }
  async read(fsFn, mongoFn) {
    if (Date.now() < this.readsBlockedUntil) return mongoFn();
    try { return await fsFn(); } catch (e) {
      if (!isQuotaError(e)) throw e;
      this.noteQuota('read', e);
      return mongoFn();
    }
  }
  // fsFn : écriture Firestore ; mirror : recopie Mongo ; pending : clés à rejouer si Firestore bloqué.
  async write(fsFn, mirror, pending) {
    if (Date.now() >= this.writesBlockedUntil) {
      try {
        const r = await fsFn();
        mirror().catch(e => console.warn('[Secours] Recopie Mongo KO:', e.message));
        return r;
      } catch (e) {
        if (!isQuotaError(e)) throw e;
        this.noteQuota('write', e);
      }
    }
    await mirror();
    const pc = await this.m(PENDING);
    await Promise.all(pending.map(([coll, id]) =>
      pc.updateOne({ _id: `${coll}/${id}` }, { $set: { coll, id, at: new Date() } }, { upsert: true })));
  }
  mirrorDocs(coll, docs) {
    if (!docs.length) return;
    this.m(coll).then(c => c.bulkWrite(docs.map(d => ({
      replaceOne: { filter: { _id: d.id }, replacement: this.toMongoDoc(d.data()), upsert: true }
    })), { ordered: false })).catch(e => console.warn('[Secours] Rafraîchissement Mongo KO:', e.message));
  }

  // Rejoue vers Firestore les écritures faites pendant la panne (état Mongo = vérité).
  async flushPending() {
    if (Date.now() < this.writesBlockedUntil) return 0;
    const pc = await this.m(PENDING);
    const items = await pc.find({}).limit(200).toArray();
    let n = 0;
    for (const it of items) {
      const doc = await (await this.m(it.coll)).findOne({ _id: it.id });
      const ref = this.fs.collection(it.coll).doc(it.id);
      try {
        if (doc) await ref.set(this.fromMongoDoc(doc)); else await ref.delete();
        await pc.deleteOne({ _id: it._id });
        n++;
      } catch (e) {
        if (isQuotaError(e)) { this.noteQuota('write', e); break; }
        console.warn('[Secours] Rejeu KO', it._id, e.message);
      }
    }
    if (n) console.log(`[Secours] ${n} écriture(s) rejouée(s) vers Firestore`);
    return n;
  }

  // Copie complète Firestore -> Mongo (une lecture par document, par pages).
  async fullSync() {
    if (this.sync.running) return this.sync;
    this.sync = { running: true, doneAt: null, docs: 0, error: null };
    try {
      const cols = await this.fs.listCollections();
      for (const col of cols) {
        let last = null;
        for (;;) {
          let q = col.orderBy(this.FP.documentId()).limit(300);
          if (last) q = q.startAfter(last);
          const snap = await q.get();
          if (snap.empty) break;
          const mc = await this.m(col.id);
          await mc.bulkWrite(snap.docs.map(d => ({
            replaceOne: { filter: { _id: d.id }, replacement: this.toMongoDoc(d.data()), upsert: true }
          })), { ordered: false });
          this.sync.docs += snap.size;
          last = snap.docs[snap.docs.length - 1].id;
          if (snap.size < 300) break;
        }
      }
      this.sync.doneAt = new Date().toISOString();
      await (await this.m(META)).updateOne({ _id: 'fullSync' }, { $set: { doneAt: new Date(), docs: this.sync.docs } }, { upsert: true });
      console.log(`[Secours] Copie Firestore -> Mongo terminée (${this.sync.docs} docs)`);
    } catch (e) {
      this.sync.error = e.message;
      if (isQuotaError(e)) this.noteQuota('read', e);
      console.warn('[Secours] Copie complète interrompue:', e.message);
    } finally {
      this.sync.running = false;
    }
    return this.sync;
  }
  // Au démarrage puis toutes les heures : copie complète tant qu'elle n'a jamais abouti.
  scheduleInitialSync() {
    const tick = async () => {
      try {
        const meta = await (await this.m(META)).findOne({ _id: 'fullSync' });
        if (meta && meta.doneAt) { this.sync.doneAt = meta.doneAt.toISOString(); return true; }
        if (Date.now() < this.readsBlockedUntil) return false;
        await this.fullSync();
        return !!this.sync.doneAt;
      } catch (e) { return false; }
    };
    const loop = async () => { if (!(await tick())) { const t = setTimeout(loop, 60 * 60 * 1000); t.unref?.(); } };
    setTimeout(loop, 15 * 1000).unref?.();
  }
  async status() {
    let pending = null; let connected = false;
    try { pending = await (await this.m(PENDING)).countDocuments(); connected = true; } catch (e) {}
    return {
      connected,
      fallbackActive: Date.now() < this.readsBlockedUntil || Date.now() < this.writesBlockedUntil,
      lastFallbackAt: this.lastFallbackAt,
      pendingWrites: pending,
      fullSync: this.sync
    };
  }
}

class DocSnap {
  constructor(ref, data) { this.ref = ref; this.id = ref.id; this._d = data; this.exists = data !== undefined; }
  data() { return this._d; }
  get(field) { return this._d ? this._d[field] : undefined; }
}
class QuerySnap {
  constructor(docs) { this.docs = docs; this.size = docs.length; this.empty = docs.length === 0; }
  forEach(fn) { this.docs.forEach(fn); }
}

class DocRef {
  constructor(store, coll, id) {
    this.store = store; this.collName = coll;
    this._fs = store.fs.collection(coll).doc(...(id === undefined ? [] : [String(id)]));
    this.id = this._fs.id;
    this.path = `${coll}/${this.id}`;
  }
  async _mongoGet() {
    const doc = await (await this.store.m(this.collName)).findOne({ _id: this.id });
    return new DocSnap(this, this.store.fromMongoDoc(doc));
  }
  get() {
    return this.store.read(async () => {
      const s = await this._fs.get();
      if (s.exists) this.store.mirrorDocs(this.collName, [s]);
      return new DocSnap(this, s.exists ? s.data() : undefined);
    }, () => this._mongoGet());
  }
  _mirrorSet(data, opts) {
    return async () => {
      const c = await this.store.m(this.collName);
      if (opts && opts.merge) {
        const upd = this.store.toMongoUpdate(data);
        if (Object.keys(upd).length) await c.updateOne({ _id: this.id }, upd, { upsert: true });
      } else {
        await c.replaceOne({ _id: this.id }, this.store.toMongoDoc(data), { upsert: true });
      }
    };
  }
  set(data, opts) {
    return this.store.write(() => this._fs.set(data, ...(opts ? [opts] : [])), this._mirrorSet(data, opts), [[this.collName, this.id]]);
  }
  update(data) {
    const mirror = async () => {
      const upd = this.store.toMongoUpdate(data);
      if (Object.keys(upd).length) await (await this.store.m(this.collName)).updateOne({ _id: this.id }, upd);
    };
    return this.store.write(() => this._fs.update(data), mirror, [[this.collName, this.id]]);
  }
  delete() {
    const mirror = async () => { await (await this.store.m(this.collName)).deleteOne({ _id: this.id }); };
    return this.store.write(() => this._fs.delete(), mirror, [[this.collName, this.id]]);
  }
  create(data) {
    const mirror = async () => {
      try { await (await this.store.m(this.collName)).insertOne({ _id: this.id, ...this.store.toMongoDoc(data) }); } catch (e) {
        if (e.code === 11000 && Date.now() < this.store.writesBlockedUntil) {
          const err = new Error('ALREADY_EXISTS'); err.code = 6; throw err;
        }
        if (e.code !== 11000) throw e;
      }
    };
    return this.store.write(() => this._fs.create(data), mirror, [[this.collName, this.id]]);
  }
}

class Query {
  constructor(store, coll, filters = [], lim = null) { this.store = store; this.collName = coll; this.filters = filters; this.lim = lim; }
  where(field, op, value) {
    if (op !== '==') throw new Error(`dualstore: opérateur non géré (${op})`);
    return new Query(this.store, this.collName, [...this.filters, [field, value]], this.lim);
  }
  limit(n) { return new Query(this.store, this.collName, this.filters, n); }
  get() {
    return this.store.read(async () => {
      let q = this.store.fs.collection(this.collName);
      for (const [f, v] of this.filters) q = q.where(f, '==', v);
      if (this.lim) q = q.limit(this.lim);
      const s = await q.get();
      this.store.mirrorDocs(this.collName, s.docs);
      return new QuerySnap(s.docs.map(d => new DocSnap(new DocRef(this.store, this.collName, d.id), d.data())));
    }, async () => {
      const filter = {};
      for (const [f, v] of this.filters) filter[f] = this.store.toMongoValue(v);
      let cur = (await this.store.m(this.collName)).find(filter);
      if (this.lim) cur = cur.limit(this.lim);
      const docs = await cur.toArray();
      return new QuerySnap(docs.map(d => new DocSnap(new DocRef(this.store, this.collName, d._id), this.store.fromMongoDoc(d))));
    });
  }
}
class CollRef extends Query {
  constructor(store, name) { super(store, name); this.id = name; }
  doc(id) { return new DocRef(this.store, this.collName, id); }
  async add(data) { const ref = this.doc(); await ref.set(data); return ref; }
}

class Batch {
  constructor(store) { this.store = store; this.ops = []; }
  set(ref, data, opts) { this.ops.push(['set', ref, data, opts]); return this; }
  update(ref, data) { this.ops.push(['update', ref, data]); return this; }
  delete(ref) { this.ops.push(['delete', ref]); return this; }
  commit() {
    const fsCommit = () => {
      const b = this.store.fs.batch();
      for (const [op, ref, data, opts] of this.ops) {
        if (op === 'set') b.set(ref._fs, data, ...(opts ? [opts] : []));
        else if (op === 'update') b.update(ref._fs, data);
        else b.delete(ref._fs);
      }
      return b.commit();
    };
    const mirror = async () => {
      for (const [op, ref, data, opts] of this.ops) {
        if (op === 'set') await ref._mirrorSet(data, opts)();
        else if (op === 'update') {
          const upd = this.store.toMongoUpdate(data);
          if (Object.keys(upd).length) await (await this.store.m(ref.collName)).updateOne({ _id: ref.id }, upd);
        } else await (await this.store.m(ref.collName)).deleteOne({ _id: ref.id });
      }
    };
    return this.store.write(fsCommit, mirror, this.ops.map(([, ref]) => [ref.collName, ref.id]));
  }
}

// Transaction : Firestore si possible ; sinon lectures Mongo + écritures appliquées à la fin.
DualStore.prototype.runTransaction = async function (fn) {
  const viaFs = async () => {
    const writes = [];
    const result = await this.fs.runTransaction(async t => {
      writes.length = 0;
      return fn({
        get: async ref => { const s = await t.get(ref._fs); return new DocSnap(ref, s.exists ? s.data() : undefined); },
        set: (ref, data, opts) => { t.set(ref._fs, data, ...(opts ? [opts] : [])); writes.push(['set', ref, data, opts]); },
        update: (ref, data) => { t.update(ref._fs, data); writes.push(['update', ref, data]); },
        delete: ref => { t.delete(ref._fs); writes.push(['delete', ref]); }
      });
    });
    const mirror = async () => {
      for (const [op, ref, data, opts] of writes) {
        if (op === 'set') await ref._mirrorSet(data, opts)();
        else if (op === 'update') {
          const upd = this.toMongoUpdate(data);
          if (Object.keys(upd).length) await (await this.m(ref.collName)).updateOne({ _id: ref.id }, upd);
        } else await (await this.m(ref.collName)).deleteOne({ _id: ref.id });
      }
    };
    mirror().catch(e => console.warn('[Secours] Recopie Mongo KO:', e.message));
    return result;
  };
  const viaMongo = async () => {
    const b = new Batch(this);
    const result = await fn({
      get: ref => ref._mongoGet(),
      set: (ref, data, opts) => { b.set(ref, data, opts); },
      update: (ref, data) => { b.update(ref, data); },
      delete: ref => { b.delete(ref); }
    });
    if (b.ops.length) await b.commit();
    return result;
  };
  return this.read(viaFs, viaMongo);
};

function withMongoBackup(fs, opts) {
  if (!fs || !opts.uri) return fs;
  const store = new DualStore(fs, opts);
  store.scheduleInitialSync();
  return store;
}

module.exports = { withMongoBackup, isQuotaError, DualStore };
