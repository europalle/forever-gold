export const input = "field";
export const button = "btn";

export function Message({ state }: { state: { error?: string; ok?: string } }) {
  if (state.error) return <p className="text-sm text-bad">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-good">{state.ok}</p>;
  return null;
}
