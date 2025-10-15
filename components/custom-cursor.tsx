"use client";

import React, { useEffect, useRef } from "react";

// Smooth, performant custom cursor using requestAnimationFrame and direct DOM transforms.
// Avoids frequent React state updates on mousemove for much better responsiveness.
export function CustomCursor() {
  const mainRef = useRef<HTMLDivElement | null>(null);
  const trailRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // target mouse position (updated on mousemove)
  const target = useRef({ x: 0, y: 0 });

  // current positions used for the smooth lerp
  const current = useRef({ x: 0, y: 0 });
  const trailPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Don't run custom cursor on touch devices
    if (typeof window.ontouchstart !== "undefined") return;

    const handleMouseMove = (e: MouseEvent) => {
      target.current.x = e.clientX;
      target.current.y = e.clientY;
      // show on first movement
      if (mainRef.current && mainRef.current.style.opacity !== "1") {
        mainRef.current.style.opacity = "1";
      }
      if (trailRef.current && trailRef.current.style.opacity !== "0.6") {
        trailRef.current.style.opacity = "0.6";
      }
    };

    const setHover = (hovering: boolean) => {
      if (mainRef.current) {
        mainRef.current.style.transition = hovering
          ? "transform 120ms ease-out"
          : "transform 180ms ease-out";
        mainRef.current.style.transform = `translate3d(${
          current.current.x - 10
        }px, ${current.current.y - 10}px, 0) scale(${hovering ? 1.6 : 1})`;
        mainRef.current.dataset.hover = hovering ? "true" : "false";
      }
      if (trailRef.current) {
        trailRef.current.style.transition = hovering
          ? "transform 200ms ease-out"
          : "transform 300ms ease-out";
        trailRef.current.style.transform = `translate3d(${
          trailPos.current.x - 20
        }px, ${trailPos.current.y - 20}px, 0) scale(${hovering ? 2 : 1})`;
        trailRef.current.dataset.hover = hovering ? "true" : "false";
      }
    };

    const handleOver = (e: Event) => {
      const targetEl = e.target as HTMLElement | null;
      const hovering = !!(
        targetEl &&
        (targetEl.closest("a") || targetEl.closest("button") ||
          targetEl.getAttribute?.("data-cursor-hover") === "true")
      );
      setHover(hovering);
    };

    const animate = () => {
      const ease = 0.18;
      current.current.x += (target.current.x - current.current.x) * ease;
      current.current.y += (target.current.y - current.current.y) * ease;

      // trailing follows a bit slower
      trailPos.current.x += (current.current.x - trailPos.current.x) *
        (ease * 0.6);
      trailPos.current.y += (current.current.y - trailPos.current.y) *
        (ease * 0.6);

      if (mainRef.current) {
        const scale = mainRef.current.dataset.hover === "true" ? 1.6 : 1;
        mainRef.current.style.transform = `translate3d(${
          current.current.x - 10
        }px, ${current.current.y - 10}px, 0) scale(${scale})`;
      }
      if (trailRef.current) {
        const scale = trailRef.current.dataset.hover === "true" ? 2 : 1;
        trailRef.current.style.transform = `translate3d(${
          trailPos.current.x - 20
        }px, ${trailPos.current.y - 20}px, 0) scale(${scale})`;
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseover", handleOver);
    document.addEventListener("mouseout", handleOver);
    // track element enter/leave for interactive elements
    document.addEventListener("mouseenter", handleOver, true);
    document.addEventListener("mouseleave", handleOver, true);

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseover", handleOver);
      document.removeEventListener("mouseout", handleOver);
      document.removeEventListener("mouseenter", handleOver, true);
      document.removeEventListener("mouseleave", handleOver, true);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <>
      <div
        ref={mainRef}
        className="fixed pointer-events-none z-[9999] opacity-0"
        style={{ left: 0, top: 0, transform: "translate3d(0,0,0)" }}
        data-hover="false"
      >
        <div className="w-5 h-5 bg-[#4ADE80] rounded-full opacity-90" />
      </div>

      <div
        ref={trailRef}
        className="fixed pointer-events-none z-[9998] opacity-0"
        style={{ left: 0, top: 0, transform: "translate3d(0,0,0)" }}
        data-hover="false"
      >
        <div className="w-8 h-8 border-2 border-[#00FFB2] rounded-full opacity-40" />
      </div>
    </>
  );
}
