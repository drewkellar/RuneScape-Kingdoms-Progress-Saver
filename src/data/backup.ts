import JSZip from 'jszip';
import { z } from 'zod';
import { cardSchema, stateSchema } from '../domain/model';
import type { Cache, Character } from '../domain/model';
import { getPortrait } from './storage';
import { supabase } from './client';
const exportCharacter = z
  .object({ id: z.string().uuid(), state: stateSchema, portrait: z.string().nullable() })
  .strict();
export const backupSchema = z
  .object({
    format: z.literal('kingdoms-backup'),
    version: z.literal(1),
    exportedAt: z.string().datetime(),
    pendingChanges: z.number().int().nonnegative(),
    characters: z.array(exportCharacter).min(1).max(500),
    cards: z.array(cardSchema).max(2000),
  })
  .strict()
  .superRefine((v, ctx) => {
    const ids = new Set(v.cards.map((c) => c.id));
    if (
      ids.size !== v.cards.length ||
      new Set(v.characters.map((c) => c.id)).size !== v.characters.length
    )
      ctx.addIssue({ code: 'custom', message: 'Duplicate IDs' });
    for (const c of v.characters)
      if (c.state.cards.some((x) => !ids.has(x.definitionId)))
        ctx.addIssue({ code: 'custom', message: 'Missing card reference' });
  });
export type Backup = z.infer<typeof backupSchema>;
export function makeBackup(cache: Cache, characters: Character[]): Backup {
  const refs = new Set(characters.flatMap((c) => c.state.cards.map((x) => x.definitionId)));
  return backupSchema.parse({
    format: 'kingdoms-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    pendingChanges: cache.pending.filter((p) => characters.some((c) => c.id === p.characterId))
      .length,
    characters: characters.map((c) => ({
      id: c.id,
      state: c.state,
      portrait: c.portrait_path ? `portraits/${c.id}.webp` : null,
    })),
    cards: cache.cards.filter((c) => refs.has(c.id)),
  });
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export async function exportBackup(
  cache: Cache,
  characters: Character[],
  account: string,
  local: boolean,
) {
  const data = makeBackup(cache, characters);
  const filename = `kingdoms-${new Date().toISOString().slice(0, 10)}`;
  if (!characters.some((c) => c.portrait_path))
    return download(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      `${filename}.json`,
    );
  const zip = new JSZip();
  for (const c of characters.filter((c) => c.portrait_path)) {
    let blob = await getPortrait(account, c.portrait_path!);
    if (!blob && !local && supabase) {
      const result = await supabase.storage.from('portraits').download(c.portrait_path!);
      if (result.error) throw result.error;
      blob = result.data;
    }
    if (!blob)
      throw Error(`Portrait for ${c.state.name} is unavailable; reconnect before exporting.`);
    zip.file(`portraits/${c.id}.webp`, blob);
  }
  zip.file('backup.json', JSON.stringify(data, null, 2));
  download(await zip.generateAsync({ type: 'blob' }), `${filename}.zip`);
}
export async function readBackup(file: File): Promise<{ data: Backup; images: Map<string, Blob> }> {
  if (file.size > 25000000) throw Error('Backup must be under 25 MB.');
  const images = new Map<string, Blob>();
  if (!file.name.toLowerCase().endsWith('.zip'))
    return { data: backupSchema.parse(JSON.parse(await file.text())), images };
  const zip = await JSZip.loadAsync(file);
  // Inspect uncompressed sizes before inflating untrusted archives.
  let total = 0;
  for (const item of Object.values(zip.files)) {
    total +=
      (item as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0;
  }
  if (total > 50000000 || Object.keys(zip.files).length > 600)
    throw Error('Expanded backup is too large.');
  const json = zip.file('backup.json');
  if (!json) throw Error('Missing backup.json');
  const data = backupSchema.parse(JSON.parse(await json.async('string')));
  for (const c of data.characters)
    if (c.portrait) {
      if (c.portrait !== `portraits/${c.id}.webp`) throw Error('Invalid portrait path');
      const image = zip.file(c.portrait);
      if (!image) throw Error('Missing portrait file');
      images.set(c.id, await image.async('blob'));
    }
  return { data, images };
}
export async function cropPortrait(file: Blob, zoom = 1, x = 0.5, y = 0.5): Promise<Blob> {
  if (file.size > 8000000) throw Error('Choose an image under 8 MB.');
  if (file.type && !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw Error('Use a JPEG, PNG, or WebP image.');
  const bitmap = await createImageBitmap(file);
  if (bitmap.width > 12000 || bitmap.height > 12000) {
    bitmap.close();
    throw Error('Image dimensions are too large.');
  }
  const size = Math.min(bitmap.width, bitmap.height) / zoom;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  canvas
    .getContext('2d')!
    .drawImage(
      bitmap,
      (bitmap.width - size) * x,
      (bitmap.height - size) * y,
      size,
      size,
      0,
      0,
      512,
      512,
    );
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(Error('Could not encode portrait'))),
      'image/webp',
      0.85,
    ),
  );
}
