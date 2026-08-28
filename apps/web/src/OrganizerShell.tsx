import type { ReactNode } from "react";

export type OrganizerSection = "live" | "overlays" | "teams" | "matches";

const navigation: Array<{
  section: OrganizerSection;
  href: string;
  label: string;
}> = [
  { section: "live", href: "/control/live", label: "Live Operations" },
  { section: "teams", href: "/control/teams", label: "Team Setup" },
  { section: "matches", href: "/control/matches", label: "Match Setup" },
  { section: "overlays", href: "/control/overlays", label: "Overlay Setup" },
];

export function OrganizerSidebar({
  active,
  connected,
  statusLines,
  token,
  onTokenChange,
  extra,
  footer,
}: {
  active: OrganizerSection;
  connected: boolean;
  statusLines: ReactNode;
  token: string;
  onTokenChange: (value: string) => void;
  extra?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <aside className="control-sidebar">
      <div className="brand-lockup">
        <span className="brand-rune">S</span>
        <div>
          <strong>SHAYYZ</strong>
          <small>MLBB OVERLAY</small>
        </div>
      </div>
      <nav aria-label="Organizer controls">
        {navigation.map((item) => (
          <a
            aria-current={active === item.section ? "page" : undefined}
            className={active === item.section ? "active" : ""}
            href={item.href}
            key={item.section}
          >
            {item.label}
          </a>
        ))}
      </nav>
      {extra}
      <div className="system-card">
        <span className={`status-light ${connected ? "online" : ""}`} />
        <div>
          <strong>{connected ? "Live sync" : "Reconnecting"}</strong>
          {statusLines}
        </div>
      </div>
      <label className="token-field">
        LAN control token
        <input
          type="password"
          value={token}
          placeholder="Only required on LAN"
          onChange={(event) => onTokenChange(event.target.value)}
        />
      </label>
      {footer}
    </aside>
  );
}
