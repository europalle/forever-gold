export const input = "w-full rounded border border-line bg-bg px-3 py-2 text-text outline-none focus:border-gold";
export const button = "rounded bg-gold px-3 py-2 text-sm font-medium text-bg disabled:opacity-60";

export function Message({ state }: { state: { error?: string; ok?: string } }) {
  if (state.error) return <p className="text-sm text-bad">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-good">{state.ok}</p>;
  return null;
}
