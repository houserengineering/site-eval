// App-side helpers for deliverables: photo bytes from the device store, browser downloads.
import type { PhotoSource } from '../generator';
import type { RecordStore } from '../storage/db';

export const photoSource =
  (store: RecordStore): PhotoSource =>
  async (id) => {
    const blob = await store.getPhoto(id);
    return blob && new Uint8Array(await blob.arrayBuffer());
  };

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
