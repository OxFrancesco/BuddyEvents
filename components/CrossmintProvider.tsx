"use client";

import { PropsWithChildren, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  CrossmintProvider as BaseCrossmintProvider,
  useCrossmint,
} from "@crossmint/client-sdk-react-ui";

function CrossmintJwtBridge({
  children,
  jwtTemplate,
}: PropsWithChildren<{
  jwtTemplate: string;
}>) {
  const { isLoaded, userId, getToken } = useAuth();
  const { setJwt } = useCrossmint();

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!userId) {
      setJwt(undefined);
      return;
    }

    let cancelled = false;

    void getToken({ template: jwtTemplate })
      .then((token) => {
        if (!cancelled) {
          setJwt(token ?? undefined);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setJwt(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, jwtTemplate, setJwt, userId]);

  return <>{children}</>;
}

export function CrossmintProvider({
  children,
  apiKey,
  jwtTemplate,
}: PropsWithChildren<{
  apiKey?: string;
  jwtTemplate: string;
}>) {
  if (!apiKey) {
    return <>{children}</>;
  }

  return (
    <BaseCrossmintProvider apiKey={apiKey}>
      <CrossmintJwtBridge jwtTemplate={jwtTemplate}>
        {children}
      </CrossmintJwtBridge>
    </BaseCrossmintProvider>
  );
}
