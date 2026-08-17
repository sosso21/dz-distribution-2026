import { NextResponse } from "next/server";
import commune from "@/database/commune";

export async function GET() {
  return NextResponse.json(commune);
}
