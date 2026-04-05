import { NextRequest, NextResponse } from "next/server";
import { agroApiFetch } from "@/lib/agroapi";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q") || "";
  const mode = req.nextUrl.searchParams.get("mode") || "partial"; // partial | exact | relations

  if (!query) {
    return NextResponse.json({ data: [], total: 0 });
  }

  try {
    const endpoint =
      mode === "exact" ? "/agrotermos/v1/termo" :
      mode === "relations" ? "/agrotermos/v1/termoComRelacoes" :
      "/agrotermos/v1/termoParcial";

    const data = await agroApiFetch(endpoint, { label: query });

    // Normalize data.dados to always be an array to prevent .map() crashes on frontend
    if (data.dados && !Array.isArray(data.dados)) {
      data.dados = [];
    } else if (!data.dados) {
      data.dados = [];
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("AgroTermos proxy error:", error.message);
    return NextResponse.json({ error: error.message, dados: [] }, { status: 502 });
  }
}
