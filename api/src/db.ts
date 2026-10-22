import { AsyncLocalStorage } from "node:async_hooks";
import { CreateTableCommand, DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

export const TABLE = process.env.TABLE_NAME ?? "lumina";
export const DEMO = "FAM#rosa";

const partition = new AsyncLocalStorage<string>();
export const pk = () => partition.getStore() ?? DEMO;
export const withFamily = <T>(key: string, fn: () => T) => partition.run(key, fn);

const local = process.env.AWS_ENDPOINT_URL_DYNAMODB;
const client = new DynamoDBClient(local ? { credentials: { accessKeyId: "local", secretAccessKey: "local" } } : {});
const ddb = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });

export type Item = Record<string, any>;

export async function get<T = Item>(sk: string): Promise<T | undefined> {
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: pk(), SK: sk } }));
  return r.Item as T | undefined;
}

export async function put(sk: string, item: Item) {
  await ddb.send(new PutCommand({ TableName: TABLE, Item: { ...item, PK: pk(), SK: sk } }));
}

export async function del(sk: string) {
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK: pk(), SK: sk } }));
}

export async function query<T = Item>(prefix: string, opts: { after?: string; newestFirst?: boolean; limit?: number } = {}): Promise<T[]> {
  const items: T[] = [];
  let start: Record<string, any> | undefined;
  do {
    const r = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND SK BETWEEN :a AND :b",
      ExpressionAttributeValues: { ":pk": pk(), ":a": prefix + (opts.after ? opts.after + "\u0000" : "") || "!", ":b": prefix + "￿" },
      ScanIndexForward: !opts.newestFirst,
      Limit: opts.limit,
      ExclusiveStartKey: start,
    }));
    items.push(...(r.Items as T[]));
    start = opts.limit && items.length >= opts.limit ? undefined : r.LastEvaluatedKey;
  } while (start);
  return items;
}

export async function putMany(items: { sk: string; item: Item }[]) {
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25).map(({ sk, item }) => ({ PutRequest: { Item: { ...item, PK: pk(), SK: sk } } }));
    let pending: Record<string, any> | undefined = { [TABLE]: chunk };
    while (pending && Object.keys(pending).length) pending = (await ddb.send(new BatchWriteCommand({ RequestItems: pending }))).UnprocessedItems;
  }
}

export async function wipe() {
  const all = await query<Item>("");
  for (let i = 0; i < all.length; i += 25) {
    const chunk = all.slice(i, i + 25).map((x) => ({ DeleteRequest: { Key: { PK: pk(), SK: x.SK } } }));
    let pending: Record<string, any> | undefined = { [TABLE]: chunk };
    while (pending && Object.keys(pending).length) pending = (await ddb.send(new BatchWriteCommand({ RequestItems: pending }))).UnprocessedItems;
  }
}

export async function ensureTable() {
  if (!local) return;
  try {
    await client.send(new DescribeTableCommand({ TableName: TABLE }));
  } catch {
    await client.send(new CreateTableCommand({
      TableName: TABLE,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [{ AttributeName: "PK", AttributeType: "S" }, { AttributeName: "SK", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "PK", KeyType: "HASH" }, { AttributeName: "SK", KeyType: "RANGE" }],
    })).catch((e) => { if (e.name !== "ResourceInUseException") throw e; });
  }
}
