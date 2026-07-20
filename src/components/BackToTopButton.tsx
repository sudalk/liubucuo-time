import { useEffect, useState } from "react";

export function BackToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const screen = document.querySelector<HTMLElement>(".sketch-screen");
    if (!screen) return;
    const update = () => setVisible(screen.scrollTop > 260);
    update();
    screen.addEventListener("scroll", update, { passive: true });
    return () => screen.removeEventListener("scroll", update);
  }, []);

  return (
    <button
      type="button"
      className={`back-top-button${visible ? " is-visible" : ""}`}
      onClick={() => document.querySelector<HTMLElement>(".sketch-screen")?.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="回到顶部"
      tabIndex={visible ? 0 : -1}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5v14M6.5 10.5 12 5l5.5 5.5" />
      </svg>
    </button>
  );
}
