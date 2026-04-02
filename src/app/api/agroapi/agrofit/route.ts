import { NextRequest, NextResponse } from "next/server";
import { searchAgrofitProducts } from "@/lib/agroapi";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q") || "";
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1", 10);

  if (!query) {
    return NextResponse.json({ data: [], total: 0, pages: 0 });
  }

  try {
    const result = await searchAgrofitProducts(query, page);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("AGROFIT proxy error:", error.message);
    return NextResponse.json({ error: error.message, data: [], total: 0, pages: 0 }, { status: 502 });
  }
}
