import { Mark } from "@/components/header";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Forever Gold" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <Mark size={36} />
      <h1 className="mt-4 text-2xl font-bold">Forever Gold</h1>
      <p className="mt-1 text-muted">Guild members only.</p>
      <LoginForm />
    </main>
  );
}
