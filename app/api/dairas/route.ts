import { NextResponse } from "next/server";
import daira from "@/database/daira-final-update";

export async function GET() {
  return NextResponse.json(daira);
}

