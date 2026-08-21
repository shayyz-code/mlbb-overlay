import type { Hero } from "@shayyz/contracts";
import { useEffect, useRef, useState } from "react";

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function HeroMedia({
  hero,
  fallback,
}: {
  hero?: Hero | undefined;
  fallback: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const [portraitFailed, setPortraitFailed] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const element = container.current;
    if (!element || !("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting ?? false),
      { rootMargin: "120px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const showPoster =
    Boolean(hero?.posterUrl) && visible && !reducedMotion && !posterFailed;
  const showPortrait = Boolean(hero?.portraitUrl) && !portraitFailed;

  return (
    <div className="hero-visual" ref={container} aria-hidden="true">
      {showPoster ? (
        <video
          src={hero?.posterUrl}
          poster={showPortrait ? hero?.portraitUrl : undefined}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          onError={() => setPosterFailed(true)}
        />
      ) : showPortrait ? (
        <img
          src={hero?.portraitUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setPortraitFailed(true)}
        />
      ) : (
        <span className="hero-initials">{fallback}</span>
      )}
    </div>
  );
}
