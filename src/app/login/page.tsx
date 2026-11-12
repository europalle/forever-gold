import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Forever Gold" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold text-gold">Forever Gold</h1>
      <p className="mt-1 text-sm text-muted">Members only. Ask the guild&apos;s admin for an account.</p>
      <LoginForm />
    </main>
  );
}
