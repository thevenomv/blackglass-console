import Image from "next/image";

const SRC = "/brand/blackglass-wordmark.png";

type BrandLogoProps = {
  variant?: "nav" | "footer";
  className?: string;
};

/**
 * Monochrome wordmark: black on transparent. Invert in dark mode for contrast on dark backgrounds.
 */
export function BrandLogo({ variant = "nav", className = "" }: BrandLogoProps) {
  const tall = variant === "footer";
  return (
    <Image
      src={SRC}
      alt="Blackglass"
      width={512}
      height={256}
      sizes={tall ? "(max-width: 768px) 200px, 240px" : "(max-width: 768px) 100px, 120px"}
      className={`w-auto dark:invert ${tall ? "h-10" : "h-7"} ${className}`}
      priority={!tall}
    />
  );
}
