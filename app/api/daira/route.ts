import { NextResponse } from "next/server";
import daira from "@/database/daira";

export async function GET() {
  return NextResponse.json(daira);
}
