import { connection } from "next/server";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { removeDevice } from "@/lib/actions/devices";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PairForm } from "./pair-form";
import { PasswordForm } from "./password-form";
import { UsernameForm } from "./username-form";
import { PageTitle, SettingRow } from "@/components/ui";

export const metadata = { title: "Account · Forever Gold" };

export default function AccountPage() {
  return (
    <main className="mx-auto max-w-[1360px] px-4 pb-16 sm:px-8">
      <Header active="account" />
      <Suspense fallback={<div className="pt-7" aria-busy="true"><div className="skeleton h-8 w-40" /><div className="skeleton mt-6 h-96" /></div>}>
        <Account />
      </Suspense>
    </main>
  );
}

async function Account() {
  await connection();
  const me = await requireUser();
  const devices = await db.device.findMany({ where: { userId: me.id }, orderBy: { createdAt: "asc" } });
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "never");
  return (
    <>
      <PageTitle title="Account">
        {me.displayName}, {me.role === "ADMIN" ? "admin" : "member"}. {devices.length ? `${devices.length} paired ${devices.length === 1 ? "PC" : "PCs"}.` : "No PC paired yet."}
      </PageTitle>
      <div className="border-t border-line">
        <SettingRow
          title="App and addon"
          note={
            <ol className="list-decimal space-y-1 pl-4">
              <li>Unzip the addon into <span className="text-text">_forever_\Interface\AddOns</span>.</li>
              <li>Install the app. Windows warns because it is unsigned: More info, Run anyway.</li>
              <li>Make a pairing code here and paste it into the app.</li>
            </ol>
          }
        >
          <div className="card p-4">
            <div className="flex flex-wrap gap-2">
              <a href="/api/download/ForeverGold.msi" className="btn btn-primary">Download the app (.msi)</a>
              <a href="/api/download/ForeverGold-addon.zip" className="btn">Download the addon (.zip)</a>
            </div>
            <div className="mt-4">
              <PairForm />
            </div>
          </div>
          {devices.length ? (
            <div className="card mt-4 overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>PC</th>
                    <th>Paired</th>
                    <th>Last seen</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d) => (
                    <tr key={d.id}>
                      <td className="font-medium">{d.name}</td>
                      <td className="num text-muted">{d.createdAt.toISOString().slice(0, 10)}</td>
                      <td className="num text-muted">{day(d.lastSeenAt)}</td>
                      <td className="r">
                        <form action={removeDevice}>
                          <input type="hidden" name="id" value={d.id} />
                          <button type="submit" className="btn btn-small">Disconnect</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </SettingRow>
        <SettingRow title="Username" note={<>Signs you in and shows in the top bar.</>}>
          <div className="card p-4">
            <UsernameForm current={me.displayName} />
          </div>
        </SettingRow>
        <SettingRow title="Password" note="Changing it signs out your other browsers.">
          <div className="card p-4">
            <PasswordForm />
          </div>
        </SettingRow>
      </div>
    </>
  );
}
