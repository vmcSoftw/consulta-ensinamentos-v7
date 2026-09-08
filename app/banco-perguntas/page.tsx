import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { pool } from "@/lib/db";
import {
  ADMIN_COOKIE_NAME,
  adminConfigured,
  adminCookieTokenHash,
} from "@/lib/admin";
import BancoPerguntasClient from "./BancoPerguntasClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function hasRestrictedAccess() {
  if (!adminConfigured()) return false;

  const store = await cookies();
  const token = store.get(ADMIN_COOKIE_NAME)?.value || "";
  if (!token) return false;

  const tokenHash = adminCookieTokenHash(token);
  const result = await pool.query(
    `SELECT 1
       FROM public.admin_sessions
       WHERE token_hash = $1
         AND revoked_at IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
    [tokenHash],
  );

  return Boolean(result.rowCount);
}

export default async function BancoPerguntasProtectedPage() {
  if (!(await hasRestrictedAccess())) {
    redirect("/admin?next=%2Fbanco-perguntas");
  }

  return <BancoPerguntasClient />;
}
