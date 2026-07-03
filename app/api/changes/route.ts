/** History of applied changes (most recent first). */
import { NextResponse } from "next/server";
import { listChanges } from "@/lib/changes";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ changes: listChanges() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
