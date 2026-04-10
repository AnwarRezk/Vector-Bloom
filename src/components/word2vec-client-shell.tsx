"use client";

import { useEffect, useState } from "react";
import { Word2VecApp } from "@/components/word2vec-app";

function LoadingShell() {
  return (
    <main className="mesh-backdrop workspace-shell overflow-hidden px-3 py-3 text-white sm:px-4 lg:px-5">
      <div className="mx-auto flex h-full w-full max-w-[1820px] flex-col panel-enter">
        <section className="workspace-grid grid h-full gap-3 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
          <div className="glass-panel rounded-[28px] bg-white/3" />
          <div className="glass-panel rounded-[28px] bg-white/3" />
          <div className="glass-panel rounded-[28px] bg-white/3" />
        </section>
      </div>
    </main>
  );
}

export function Word2VecClientShell() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setMounted(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (!mounted) {
    return <LoadingShell />;
  }

  return <Word2VecApp />;
}
