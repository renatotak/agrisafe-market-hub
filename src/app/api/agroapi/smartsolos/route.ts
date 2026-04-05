import { NextResponse } from "next/server";
import { getSoilExpertProfiles, classifySoilExpert } from "@/lib/agroapi";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const page = parseInt(searchParams.get("page") || "1", 10);

  try {
    const data = await getSoilExpertProfiles(page, q);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = await classifySoilExpert(body);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
