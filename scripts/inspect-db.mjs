// Prints every collection in the database with its document count and the
// field names/types seen in a sample of documents (no values), so the mapping
// in src/lib/data/mapping.ts can be pointed at the real schema.
//
//   MONGODB_URI="mongodb+srv://..." npm run db:inspect
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("Set MONGODB_URI first (see .env.example).");
  process.exit(1);
}
const SAMPLE = Number(process.env.SAMPLE || 200);

function shape(value, prefix, out) {
  if (value === null || value === undefined) return;
  const type = Array.isArray(value) ? "array" : value instanceof Date ? "date" : value?._bsontype ? value._bsontype : typeof value;
  out.set(prefix, (out.get(prefix) ?? new Set()).add(type));
  if (type === "object") for (const [k, v] of Object.entries(value)) shape(v, prefix ? `${prefix}.${k}` : k, out);
  if (type === "array" && value.length) shape(value[0], `${prefix}[]`, out);
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20_000 });
await client.connect();
const db = client.db(process.env.MONGODB_DB || undefined);
console.log(`Database: ${db.databaseName}\n`);
for (const { name } of await db.listCollections().toArray()) {
  const col = db.collection(name);
  const count = await col.estimatedDocumentCount();
  const fields = new Map();
  for (const doc of await col.aggregate([{ $sample: { size: SAMPLE } }]).toArray()) shape(doc, "", fields);
  fields.delete("");
  console.log(`== ${name} (${count.toLocaleString()} docs)`);
  for (const [k, types] of [...fields.entries()].sort()) console.log(`   ${k}: ${[...types].join(" | ")}`);
  console.log();
}
await client.close();
