import { login } from "./actions";
import { Leaf } from "lucide-react";
import { t } from "@/lib/i18n";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="flex-1 flex flex-col w-full px-8 sm:max-w-md justify-center gap-2 p-4 h-screen mx-auto">
      <div className="flex items-center gap-2 justify-center mb-8">
        <Leaf className="text-emerald-500" size={32} />
        <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
          AgriSafe Market Hub
        </h1>
      </div>

      <form className="flex-1 flex flex-col w-full gap-4 text-foreground">

        {params?.error && (
          <p className="mt-4 p-4 bg-red-50 text-red-600 text-sm border-s-4 border-red-500 mb-4">
            {params.error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-md font-medium text-slate-700" htmlFor="email">
            Email
          </label>
          <input
            className="rounded-md px-4 py-2 bg-inherit border text-slate-900 border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-2"
            name="email"
            placeholder="you@example.com"
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-md font-medium text-slate-700" htmlFor="password">
            Password / Senha
          </label>
          <input
            className="rounded-md px-4 py-2 bg-inherit border text-slate-900 border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-6"
            type="password"
            name="password"
            placeholder="••••••••"
            required
          />
        </div>

        <button
          formAction={login}
          className="bg-emerald-600 rounded-md px-4 py-2 text-white font-medium hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-2 transition-colors"
        >
          Sign In / Entrar
        </button>

        {params?.message && (
          <p className="mt-4 p-4 bg-gray-50 text-slate-600 text-center">
            {params.message}
          </p>
        )}
      </form>
    </div>
  );
}
