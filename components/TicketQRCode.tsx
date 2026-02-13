/// components/TicketQRCode.tsx — Renders a QR code image for a ticket payload
"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

type TicketQRCodeProps = {
  value: string;
  size?: number;
};

export function TicketQRCode({ value, size = 180 }: TicketQRCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then((url: string) => {
        if (cancelled) return;
        setHasError(false);
        setDataUrl(url);
      })
      .catch(() => {
        if (cancelled) return;
        setHasError(true);
        setDataUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (hasError) {
    return (
      <div className="h-[180px] w-[180px] border-2 border-dashed border-foreground p-3 text-center text-xs text-muted-foreground">
        QR generation failed
      </div>
    );
  }

  if (!dataUrl) {
    return (
      <div className="h-[180px] w-[180px] animate-pulse bg-muted border-2 border-foreground" />
    );
  }

  return (
    <Image
      src={dataUrl}
      alt="Ticket QR code"
      width={size}
      height={size}
      className="border-2 border-foreground bg-foreground p-2"
      loading="lazy"
      unoptimized
    />
  );
}
