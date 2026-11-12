"use client";

import { deleteUser } from "@/lib/actions/admin";

export function DeleteButton({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={deleteUser}
      onSubmit={(e) => {
        if (!confirm(`Delete ${name}'s account, ledger and uploads? This cannot be undone.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="rounded border border-line px-2 py-1 text-xs text-bad hover:border-bad">
        Delete
      </button>
    </form>
  );
}
