import { openDB } from 'idb';
import type { Cache } from '../domain/model';
const db = () =>
  openDB('kingdoms-companion-v1', 1, {
    upgrade(db) {
      db.createObjectStore('accounts');
      db.createObjectStore('portraits');
    },
  });
export async function readCache(account: string): Promise<Cache | undefined> {
  return (await db()).get('accounts', account);
}
export async function writeCache(account: string, cache: Cache) {
  await (await db()).put('accounts', structuredClone(cache), account);
}
export async function putPortrait(account: string, id: string, blob: Blob) {
  await (await db()).put('portraits', blob, `${account}:${id}`);
}
export async function getPortrait(account: string, id: string): Promise<Blob | undefined> {
  return (await db()).get('portraits', `${account}:${id}`);
}
