import { prisma } from "../config/prisma.js";

const ADMIN_TABLE = "users.admin";

export async function findAdminBySupabaseId(supabaseId) {
  const sql = `
    select admin_id, supabase_id, created_at
    from ${ADMIN_TABLE}
    where supabase_id = $1::uuid
    limit 1
  `;
  const rows = await prisma.$queryRawUnsafe(sql, supabaseId);
  return rows?.[0] || null;
}

export async function isSupabaseUserAdmin(supabaseId) {
  const adminRow = await findAdminBySupabaseId(supabaseId);
  return Boolean(adminRow);
}
