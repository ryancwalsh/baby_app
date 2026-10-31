export function TileNote({ note }: { readonly note: string }) {
  return note === '' ? null : <p className="text-faint truncate italic text-base">{note}</p>;
}
