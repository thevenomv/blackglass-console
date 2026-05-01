import { NextResponse } from "next/server";

const bundles: Record<
  string,
  { sha256: string; expiresInSeconds: number; bytes: number }
> = {
  "bundle-production-weekly": {
    sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    expiresInSeconds: 3600,
    bytes: 182903,
  },
  "bundle-host-07-incident": {
    sha256: "a9f12bde045c8912f8f3ecc17a3e9b7d6c5e4f30291827364556473829100abc",
    expiresInSeconds: 900,
    bytes: 48211,
  },
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const meta =
    bundles[id] ??
    ({
      sha256: "0000000000000000000000000000000000000000000000000000000000000000",
      expiresInSeconds: 600,
      bytes: 4096,
    } as const);

  const u = new URL(request.url);
  const fileUrl = `${u.origin}/api/v1/evidence/bundles/${encodeURIComponent(id)}/file`;

  return NextResponse.json({
    bundle_id: id,
    sha256: meta.sha256,
    bytes: meta.bytes,
    expires_in_seconds: meta.expiresInSeconds,
    download_url: fileUrl,
    generated_at: new Date().toISOString(),
  });
}
