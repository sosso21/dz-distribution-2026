import { NextResponse } from "next/server";
import wilaya from "@/database/wilaya";

export async function GET() {
  return NextResponse.json(wilaya);
}
