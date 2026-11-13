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
      <button type="submit" className="btn btn-small btn-danger">
        Delete
      </button>
    </form>
  );
}
