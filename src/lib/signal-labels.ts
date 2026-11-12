// Words and colours for signals, shared by the Signals and item pages.

export const ACTION_LABEL: Record<string, string> = { buy: "Buy", sell: "Sell", hold: "Hold", wait: "Wait", none: "" };
export const CONDITION_LABEL: Record<string, string> = {
  CRASH: "Crashing",
  FLOOD: "Flooded",
  SQUEEZE: "Short supply",
  SPIKE: "Spiked",
  SLIDE: "Sliding",
  DIP: "Dip",
  RICH: "Above usual",
  UPTREND: "Rising",
  CALM: "Calm",
};

export function actionClass(action: string, strength: number) {
  const tone = action === "buy" ? "text-good border-good" : action === "sell" ? "text-gold border-gold" : action === "wait" ? "text-bad border-bad" : "text-warn border-warn";
  return `${tone} ${strength === 2 ? "font-semibold" : "opacity-80"}`;
}
