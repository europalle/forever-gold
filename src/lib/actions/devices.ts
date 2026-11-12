"use server";

import { revalidatePath } from "next/cache";
import { db } from "../db";
import { requireUser } from "../auth";
import { newDeviceToken } from "../device";
import type { FormState } from "./auth";

export type PairState = FormState & { code?: string };

export async function createDevice(_prev: PairState, form: FormData): Promise<PairState> {
  const me = await requireUser();
  const name = String(form.get("name") ?? "").trim().slice(0, 40) || "My PC";
  if ((await db.device.count({ where: { userId: me.id } })) >= 5) return { error: "Disconnect an old helper first (5 at most)." };
  const { token, hash } = newDeviceToken();
  await db.device.create({ data: { userId: me.id, name, tokenHash: hash } });
  revalidatePath("/account");
  return { ok: `Pairing code for "${name}". Paste it into the helper when it asks. It is shown only now.`, code: token };
}

export async function removeDevice(form: FormData): Promise<void> {
  const me = await requireUser();
  await db.device.deleteMany({ where: { id: String(form.get("id") ?? ""), userId: me.id } });
  revalidatePath("/account");
}
